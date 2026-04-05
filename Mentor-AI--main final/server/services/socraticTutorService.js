const { redisClient } = require('../config/redisClient');
const geminiService = require('./geminiService');
const ollamaService = require('./ollamaService');
const axios = require('axios');
const {
    SOCRATIC_CLASSIFICATION_PROMPT,
    SOCRATIC_QUESTION_GENERATION_PROMPT,
    SOCRATIC_INTRO_PROMPT
} = require('../config/promptTemplates');

const TUTOR_STATE_TTL = 3600; // 1 hour
const MASTERY_THRESHOLD = 2;

const UNDERSTANDING_LEVELS = {
    CORRECT: 'CORRECT',
    PARTIAL: 'PARTIAL',
    MISCONCEPTION: 'MISCONCEPTION',
    VAGUE: 'VAGUE'
};

const PEDAGOGICAL_MOVES = {
    REFINE: 'REFINE',       // Partial/Vague -> Explain then Advance
    CORRECT: 'CORRECT',     // Misconception -> Correct then Advance
    ADVANCE: 'ADVANCE'      // Correct -> Reinforce then teach next
};

const SOCRATIC_STATES = {
    INTRODUCTION: 'INTRODUCTION',
    QUESTION: 'QUESTION',
    EVALUATION: 'EVALUATION',
    REFINE: 'REFINE',
    CORRECT: 'CORRECT',
    ADVANCE: 'ADVANCE',
    MASTERY_ACHIEVED: 'MASTERY_ACHIEVED'
};

/**
 * Determine pedagogical move
 * CRITICAL: We always want to keep the student moving forward.
 */
function determinePedagogicalMove(classification, lastPedagogicalMove) {
    // If they were partial or had a misconception, we REFINE/CORRECT and then move on.
    // If they were correct, we ADVANCE.

    switch (classification) {
        case UNDERSTANDING_LEVELS.CORRECT:
            return PEDAGOGICAL_MOVES.ADVANCE;
        case UNDERSTANDING_LEVELS.MISCONCEPTION:
            return PEDAGOGICAL_MOVES.CORRECT;
        default:
            return PEDAGOGICAL_MOVES.REFINE;
    }
}

function getLLMService(llmConfig) {
    const llmService = llmConfig.llmProvider === 'ollama' ? ollamaService : geminiService;
    const llmOptions = {
        ...(llmConfig.llmProvider === 'ollama' && { model: llmConfig.ollamaModel }),
        apiKey: llmConfig.apiKey,
        ollamaUrl: llmConfig.ollamaUrl
    };
    return { llmService, llmOptions };
}

/**
 * Generate initial response for a topic
 */
async function startSocraticSession(topic, context, llmConfig) {
    const { llmService, llmOptions } = getLLMService(llmConfig);
    const prompt = SOCRATIC_INTRO_PROMPT(topic, context);

    try {
        const response = await llmService.generateContentWithHistory(
            [],
            prompt,
            'You are a warm AI Tutor. Respond with ONLY the tutor response text.',
            llmOptions
        );

        return response.trim();
    } catch (error) {
        console.error('[SocraticTutor] Start session error:', error);
        return `Let's dive into ${topic}! It's a fascinating subject. In simple terms, it is about understanding the core idea clearly before going deeper.`;
    }
}

/**
 * Classify student response
 */
async function classifyStudentUnderstanding(studentResponse, moduleTitle, lastQuestion, llmConfig) {
    const { llmService, llmOptions } = getLLMService(llmConfig);
    const prompt = SOCRATIC_CLASSIFICATION_PROMPT(moduleTitle, lastQuestion, studentResponse);

    try {
        const response = await llmService.generateContentWithHistory(
            [],
            prompt,
            'You are an expert assessment AI. Respond with ONLY valid JSON.',
            llmOptions
        );

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No JSON found in response');
    } catch (error) {
        console.error('[SocraticTutor] Classification error:', error);
        return { classification: 'VAGUE', reasoning: 'Error fallback' };
    }
}

/**
 * Generate follow-up
 */
async function generateSocraticFollowUp(classification, pedagogicalMove, moduleTitle, previousQuestion, studentResponse, turnCount, llmConfig) {
    const { llmService, llmOptions } = getLLMService(llmConfig);
    const prompt = SOCRATIC_QUESTION_GENERATION_PROMPT(
        classification,
        pedagogicalMove,
        moduleTitle,
        previousQuestion,
        studentResponse,
        turnCount
    );

    try {
        const response = await llmService.generateContentWithHistory(
            [],
            prompt,
            'You are a warm AI Tutor. Respond with ONLY the tutor response text.',
            llmOptions
        );

        return response.trim();
    } catch (error) {
        console.error('[SocraticTutor] Follow-up generation error:', error);
        return "That's a helpful starting point. Here's the key idea in plain language: focus on the main concept first, then add the details if needed.";
    }
}

/**
 * Process the response loop
 */
async function processTutorResponse(studentResponse, sessionId, llmConfig) {
    const state = await getTutorSessionState(sessionId);
    if (!state) return null;

    const { moduleTitle, lastQuestion, turnCount, consecutiveUnderstands } = state;

    // 1. Classify
    const assessment = await classifyStudentUnderstanding(studentResponse, moduleTitle, lastQuestion, llmConfig);
    const classification = assessment.classification.toUpperCase();

    // 2. Track Mastery
    let newConsecutive = (classification === UNDERSTANDING_LEVELS.CORRECT) ? (consecutiveUnderstands + 1) : 0;
    const isMastered = newConsecutive >= MASTERY_THRESHOLD;

    if (isMastered) {
        await clearTutorSessionState(sessionId);
        return {
            followUpQuestion: `🎉 Spot on! You've definitely mastered ${moduleTitle}. You explained it perfectly.\n\nReady to move to the next topic, or is there something specific you'd like to dive deeper into?`,
            classification,
            reasoning: assessment.reasoning,
            isMastered: true,
            socraticState: SOCRATIC_STATES.MASTERY_ACHIEVED
        };
    }

    // 3. Determine move and generate response
    const pedagogicalMove = determinePedagogicalMove(classification, state.lastPedagogicalMove);
    const followUp = await generateSocraticFollowUp(
        classification,
        pedagogicalMove,
        moduleTitle,
        lastQuestion,
        studentResponse,
        turnCount,
        llmConfig
    );

    // 4. Update state
    const newState = {
        ...state,
        lastQuestion: followUp,
        turnCount: turnCount + 1,
        consecutiveUnderstands: newConsecutive,
        lastPedagogicalMove: pedagogicalMove,
        socraticState: pedagogicalMove // Use move as state for simplicity
    };
    await setTutorSessionState(sessionId, newState);

    return {
        followUpQuestion: followUp,
        classification,
        pedagogicalMove,
        reasoning: assessment.reasoning,
        isMastered: false,
        socraticState: pedagogicalMove
    };
}

/**
 * Redis helpers
 */
async function getTutorSessionState(sessionId) {
    if (!redisClient?.isOpen) return null;
    const data = await redisClient.get(`tutor_state:${sessionId}`);
    return data ? JSON.parse(data) : null;
}

async function setTutorSessionState(sessionId, state) {
    if (!redisClient?.isOpen) return;
    await redisClient.set(`tutor_state:${sessionId}`, JSON.stringify(state), { EX: TUTOR_STATE_TTL });
}

async function clearTutorSessionState(sessionId) {
    if (!redisClient?.isOpen) return;
    await redisClient.del(`tutor_state:${sessionId}`);
}

module.exports = {
    startSocraticSession,
    processTutorResponse,
    getTutorSessionState,
    setTutorSessionState,
    clearTutorSessionState,
    UNDERSTANDING_LEVELS,
    PEDAGOGICAL_MOVES,
    SOCRATIC_STATES
};

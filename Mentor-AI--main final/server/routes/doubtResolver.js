const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const SavedDoubt = require('../models/SavedDoubt');
const { logger, auditLog } = require('../utils/logger');

const router = express.Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_CANDIDATES = Array.from(new Set([
    process.env.GEMINI_MODEL,
    process.env.GEMINI_MODEL_NAME,
    'gemini-2.0-flash',
].filter(Boolean)));

function getGeminiModel(modelName) {
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key is not configured.');
    }

    const normalizedModelName = String(modelName || '').replace(/^models\//, '');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    return genAI.getGenerativeModel({ model: normalizedModelName });
}

function isModelUnavailableError(error) {
    const text = String(error?.message || '').toLowerCase();
    // Catch 404, 503, 429 and other temporary/model issues
    return text.includes('404') 
        || text.includes('not found') 
        || text.includes('models/')
        || text.includes('503')
        || text.includes('service unavailable')
        || text.includes('429')
        || text.includes('quota')
        || text.includes('rate limit')
        || text.includes('too many requests')
        || text.includes('high demand');
}

function localGenerateDoubtResolution(question, subject, level) {
    // Local fallback for doubt resolution when all API models fail
    // Templates organized by subject for relevant examples
    
    const templates = {
        mathematics: {
            root_causes: [
                'Confusion about the fundamental concept or definition',
                'Misunderstanding how this concept relates to other mathematical principles'
            ],
            steps: [
                'Start with the simplest definition: understand what this concept means',
                'Look at how it connects to concepts you already know well',
                'Work through a basic example step-by-step to build intuition',
                'Practice with similar problems to strengthen your understanding',
                'Revisit the concept and explain it in your own words'
            ],
            analogy: 'Like learning to ride a bike: the basic mechanics are simple, but connecting theory with practice takes repetition.',
            check_q: {
                question: 'Which statement correctly describes this concept?',
                options: [
                    'A foundational principle that builds understanding of related topics',
                    'An isolated fact with no connection to other concepts'
                ],
                correct: 0
            }
        },
        physics: {
            root_causes: [
                'Difficulty visualizing how physical forces and motion work together',
                'Confusion between related but distinct physical quantities or laws'
            ],
            steps: [
                'Draw a diagram or visualize the physical scenario described',
                'Identify all the forces or quantities involved in the situation',
                'Apply the relevant law or principle step-by-step',
                'Calculate or reason through the expected result',
                'Verify your reasoning by checking if the answer makes physical sense'
            ],
            analogy: 'Like understanding water flow: visualize what happens, trace the path, then explain why.',
            check_q: {
                question: 'When approaching physics problems, what helps most?',
                options: [
                    'Visualizing the scenario and identifying all relevant quantities',
                    'Jumping straight to formulas without understanding the context'
                ],
                correct: 0
            }
        },
        chemistry: {
            root_causes: [
                'Not connecting molecular structure to chemical behavior and reactions',
                'Confusion about how atomic bonds and electron interactions drive chemistry'
            ],
            steps: [
                'Picture how atoms bond together in the molecule or compound',
                'Understand how electrons distribute between bonded atoms',
                'Connect molecular structure to properties like reactivity or polarity',
                'Walk through the reaction mechanism or process step-by-step',
                'Explain why this compound or reaction behaves the way it does'
            ],
            analogy: 'Like understanding team dynamics: structure determines interactions, which drive outcomes.',
            check_q: {
                question: 'What is the key to understanding chemical behavior?',
                options: [
                    'Connecting molecular structure and electron interactions to properties',
                    'Memorizing facts without understanding the underlying science'
                ],
                correct: 0
            }
        },
        'computer science': {
            root_causes: [
                'Difficulty translating logic or algorithms into code mentally',
                'Confusion about how abstract concepts map to concrete implementation'
            ],
            steps: [
                'Break down the problem into smaller, manageable pieces',
                'Write pseudocode or outline the logic before entering syntax',
                'Implement one piece at a time, testing as you go',
                'Trace through your code mentally to verify the logic',
                'Test edge cases and refine your solution based on results'
            ],
            analogy: 'Like building a house: blueprint first, structure next, details last.',
            check_q: {
                question: 'How should you approach a difficult coding problem?',
                options: [
                    'Break it into pieces, plan the logic, then code incrementally',
                    'Try to solve it entirely in your head before writing any code'
                ],
                correct: 0
            }
        },
        other: {
            root_causes: [
                'Uncertainty about how different parts of the concept fit together',
                'Missing a foundational understanding that this concept depends on'
            ],
            steps: [
                'Clarify the core definition: what is this concept fundamentally?',
                'Identify prerequisite knowledge: what else do you need to know first?',
                'Find concrete examples that illustrate the concept in action',
                'Connect this concept to related ideas you already understand',
                'Teach what you learned to someone else or write it down clearly'
            ],
            analogy: 'Like learning a new language: start with basics, build connections gradually, practice regularly.',
            check_q: {
                question: 'What is the best strategy for learning a new concept?',
                options: [
                    'Build from foundational understanding with concrete examples',
                    'Try to memorize everything at once without context'
                ],
                correct: 0
            }
        }
    };

    const subjectLower = String(subject || '').toLowerCase();
    const template = templates[subjectLower] || templates.other;

    return {
        rootCause: template.root_causes[0],
        steps: template.steps,
        analogy: template.analogy,
        checkQuestion: {
            question: template.check_q.question,
            options: template.check_q.options,
            correctIndex: template.check_q.correct,
            explanation: 'Understanding concepts through structured learning and real-world connections helps build strong foundational knowledge.'
        },
        usedFallback: true,
        fallbackReason: 'Gemini API is experiencing high demand. Using template-based guidance.'
    };
}

async function generateWithFallback(prompt) {
    let lastError = null;

    for (const modelName of MODEL_CANDIDATES) {
        try {
            const model = getGeminiModel(modelName);
            const result = await model.generateContent(prompt);
            const text = result.response?.text() || '';
            return { text, modelName };
        } catch (error) {
            lastError = error;
            if (!isModelUnavailableError(error)) {
                throw error;
            }
        }
    }

    // All models failed - return local fallback
    return { text: 'LOCAL_FALLBACK', modelName: 'local-template', error: lastError };
}

function extractJsonText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Model returned an empty response.');
    }

    const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = codeBlockMatch ? codeBlockMatch[1] : rawText;
    return candidate.trim();
}

function safeJsonParse(rawText) {
    const jsonText = extractJsonText(rawText);

    try {
        return JSON.parse(jsonText);
    } catch {
        const objectMatch = jsonText.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            return JSON.parse(objectMatch[0]);
        }
        throw new Error('Failed to parse model JSON response.');
    }
}

function normalizeLevel(value) {
    const allowed = ['beginner', 'intermediate', 'advanced'];
    const normalized = String(value || '').trim().toLowerCase();
    return allowed.includes(normalized) ? normalized : 'beginner';
}

function normalizeResolvedPayload(payload) {
    const steps = Array.isArray(payload?.steps)
        ? payload.steps.map((step) => String(step).trim()).filter(Boolean).slice(0, 5)
        : [];

    const rawOptions = Array.isArray(payload?.checkQuestion?.options)
        ? payload.checkQuestion.options
        : [];

    const options = rawOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 2);

    const parsedCorrectIndex = Number(payload?.checkQuestion?.correctIndex);
    const safeCorrectIndex = Number.isInteger(parsedCorrectIndex) && parsedCorrectIndex >= 0 && parsedCorrectIndex < options.length
        ? parsedCorrectIndex
        : 0;

    return {
        rootCause: String(payload?.rootCause || '').trim(),
        steps,
        analogy: String(payload?.analogy || '').trim(),
        checkQuestion: {
            question: String(payload?.checkQuestion?.question || '').trim(),
            options,
            correctIndex: safeCorrectIndex,
            explanation: String(payload?.checkQuestion?.explanation || '').trim(),
        },
    };
}

router.post('/resolve', async (req, res) => {
    const question = String(req.body?.question || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const level = normalizeLevel(req.body?.level);

    if (!question || !subject) {
        return res.status(400).json({ message: 'question and subject are required.' });
    }

    try {
        const prompt = [
            `A student has this doubt: ${question} in subject ${subject} at ${level} level.`,
            'Provide:',
            '1) Root cause of confusion in 2 sentences,',
            '2) Step-by-step explanation in exactly 5 numbered steps, each step max 3 sentences,',
            '3) A simple real-world analogy,',
            '4) A quick 2-option check-your-understanding question with correct answer.',
            'Return as strict JSON: { rootCause, steps[], analogy, checkQuestion: {question, options[], correctIndex, explanation} }',
            'Do not include markdown code fences.',
        ].join('\n');

        const { text, modelName } = await generateWithFallback(prompt);
        
        let resolved;
        if (text === 'LOCAL_FALLBACK') {
            // All API models failed, use local template-based fallback
            resolved = localGenerateDoubtResolution(question, subject, level);
        } else {
            const parsed = safeJsonParse(text);
            resolved = normalizeResolvedPayload(parsed);
        }

        if (!resolved.rootCause || resolved.steps.length < 5 || !resolved.checkQuestion.question || resolved.checkQuestion.options.length !== 2) {
            return res.status(502).json({ message: 'Doubt resolver returned incomplete structured output.' });
        }

        auditLog(req, 'DOUBT_RESOLVED', {
            subject,
            level,
            model: modelName,
            usedFallback: resolved.usedFallback,
        });

        return res.status(200).json(resolved);
    } catch (error) {
        logger.error('[DoubtResolver] Failed to resolve doubt', {
            message: error.message,
            stack: error.stack,
            subject,
            level,
        });

        return res.status(500).json({ message: `Failed to resolve doubt: ${error.message}` });
    }
});

router.post('/save', async (req, res) => {
    const userId = req.user?._id;
    const question = String(req.body?.question || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const answer = req.body?.answer;

    if (!userId || !question || !subject || !answer) {
        return res.status(400).json({ message: 'question, subject, and answer are required.' });
    }

    try {
        const saved = await SavedDoubt.create({
            userId,
            question,
            subject,
            answer,
            createdAt: new Date(),
        });

        auditLog(req, 'DOUBT_SAVED', {
            savedDoubtId: saved._id.toString(),
            subject,
        });

        return res.status(201).json({
            message: 'Doubt saved successfully.',
            savedDoubtId: saved._id,
        });
    } catch (error) {
        logger.error('[DoubtResolver] Failed to save doubt', {
            message: error.message,
            stack: error.stack,
        });

        return res.status(500).json({ message: `Failed to save doubt: ${error.message}` });
    }
});

router.get('/saved', async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const savedDoubts = await SavedDoubt.find({ userId })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        return res.status(200).json({ savedDoubts });
    } catch (error) {
        logger.error('[DoubtResolver] Failed to load saved doubts', {
            message: error.message,
            stack: error.stack,
        });

        return res.status(500).json({ message: `Failed to load saved doubts: ${error.message}` });
    }
});

module.exports = router;

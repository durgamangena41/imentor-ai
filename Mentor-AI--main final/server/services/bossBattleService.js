// server/services/bossBattleService.js
// RELOAD TRIGGER: 2026-01-11T11:36:51 - Fixed AI generation
const BossBattle = require('../models/BossBattle');
const GamificationProfile = require('../models/GamificationProfile');
const ChatHistory = require('../models/ChatHistory');
const { selectLLM } = require('./llmRouterService');
const geminiService = require('./geminiService');
const gamificationService = require('./gamificationService');
const badgeService = require('./badgeService');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Analyze user's weak topics from chat history
 * Similar to bounty service but focused on boss battles
 */
async function identifyWeakTopic(userId) {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const chats = await ChatHistory.find({
            userId,
            timestamp: { $gte: sevenDaysAgo }
        }).limit(30);

        if (chats.length === 0) {
            return null;
        }

        // Count topic frequency
        const topics = {};
        chats.forEach(chat => {
            const topic = chat.documentContext || 'general';
            topics[topic] = (topics[topic] || 0) + 1;
        });

        // Get most frequently asked topic (= weak topic)
        const sortedTopics = Object.entries(topics)
            .sort((a, b) => b[1] - a[1]);

        return sortedTopics[0] ? sortedTopics[0][0] : null;

    } catch (error) {
        logger.error('[BossBattle] Error identifying weak topic:', error);
        return null;
    }
}

/**
 * Generate boss battle questions using AI
 */
async function generateBattleQuestions(topic, difficulty, count = 5) {
    try {
        const prompt = `Generate ${count} challenging ${difficulty} level multiple-choice questions about "${topic}".

Return ONLY a JSON array with this exact structure:
[
  {
    "questionText": "Question here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option X",
    "explanation": "Why this is correct (brief)"
  }
]

Make questions progressively harder. Test deep understanding, not just memorization.`;

        logger.info(`[BossBattle] Generating ${count} questions for topic: ${topic}, difficulty: ${difficulty}`);

        const { chosenModel } = await selectLLM(prompt, { user: { _id: 'system' }, subject: topic });
        logger.info(`[BossBattle] Selected model: ${chosenModel.provider} - ${chosenModel.modelId}`);

        let response;
        let generationSuccess = false;

        // Try Ollama first (always attempt, regardless of chosen model)
        try {
            logger.info('[BossBattle] 🚀 Attempting question generation with Ollama...');
            const ollamaService = require('./ollamaService');
            response = await ollamaService.generateContentWithHistory(
                [],      // empty chat history
                prompt,  // the question generation prompt
                null,    // no system prompt
                { 
                    model: chosenModel.provider === 'ollama' ? chosenModel.modelId : 'llama3.2:latest',
                    ollamaUrl: process.env.OLLAMA_API_BASE_URL || 'http://localhost:11434',
                    temperature: 0.7 
                }
            );
            generationSuccess = true;
            logger.info('[BossBattle] ✅ Ollama generation successful');
        } catch (ollamaError) {
            logger.warn('[BossBattle] ⚠️ Ollama generation failed:', ollamaError.message);
            logger.info('[BossBattle] 🔄 Falling back to Gemini API...');
        }

        // Fallback to Gemini if Ollama failed or if Gemini was selected
        if (!generationSuccess) {
            try {
                logger.info('[BossBattle] 🚀 Attempting question generation with Gemini API...');
                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) {
                    logger.error('[BossBattle] ❌ GEMINI_API_KEY not found in environment');
                    throw new Error('Gemini API key not configured');
                }
                response = await geminiService.generateContentWithHistory(
                    [],      // empty chat history
                    prompt,  // the question generation prompt
                    null,    // no system prompt
                    { temperature: 0.7, apiKey }  // options with API key
                );
                generationSuccess = true;
                logger.info('[BossBattle] ✅ Gemini generation successful');
            } catch (geminiError) {
                logger.error('[BossBattle] ❌ Gemini generation also failed:', geminiError.message);
                throw new Error('Both Ollama and Gemini failed to generate questions');
            }
        }

        logger.info(`[BossBattle] Received AI response (length: ${response?.length || 0})`);

        // Extract JSON array
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            logger.error(`[BossBattle] Failed to parse AI response. Response preview: ${response?.substring(0, 200)}`);
            throw new Error('Failed to parse AI response - no JSON array found');
        }

        const questions = JSON.parse(jsonMatch[0]);

        // Validate questions
        if (!Array.isArray(questions) || questions.length === 0) {
            logger.warn(`[BossBattle] Invalid questions format for ${topic}`);
            throw new Error('Invalid questions format');
        }

        logger.info(`[BossBattle] ✅ Successfully generated ${questions.length} valid questions for ${topic}`);

        const formattedQuestions = questions.map(q => ({
            questionText: q.questionText,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || '',
            userAnswer: '',
            isCorrect: false,
            timeSpent: 0
        }));

        // Ensure we have exactly the requested count
        if (formattedQuestions.length < count) {
            logger.warn(`[BossBattle] Only got ${formattedQuestions.length}/${count} questions, adding fallbacks`);
            const fallbacks = generateFallbackQuestions(topic, count - formattedQuestions.length);
            return [...formattedQuestions, ...fallbacks];
        }

        return formattedQuestions.slice(0, count); // Return exactly 'count' questions

    } catch (error) {
        logger.error('[BossBattle] ❌ Error generating questions:', {
            error: error.message,
            stack: error.stack,
            topic,
            difficulty
        });
        // Fallback questions
        return generateFallbackQuestions(topic, count);
    }
}

/**
 * Fallback questions if AI fails
 */
function generateFallbackQuestions(topic, count) {
    const topicQuestions = {
        'General Knowledge': [
            {
                questionText: 'What is the capital of France?',
                options: ['Paris', 'London', 'Berlin', 'Madrid'],
                correctAnswer: 'Paris',
                explanation: 'Paris is the capital and largest city of France.'
            },
            {
                questionText: 'Which planet is known as the Red Planet?',
                options: ['Mars', 'Venus', 'Jupiter', 'Saturn'],
                correctAnswer: 'Mars',
                explanation: 'Mars appears red due to iron oxide on its surface.'
            },
            {
                questionText: 'What is the largest ocean on Earth?',
                options: ['Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'],
                correctAnswer: 'Pacific Ocean',
                explanation: 'The Pacific Ocean covers about 46% of Earth\'s water surface.'
            },
            {
                questionText: 'Who wrote "Romeo and Juliet"?',
                options: ['William Shakespeare', 'Charles Dickens', 'Jane Austen', 'Mark Twain'],
                correctAnswer: 'William Shakespeare',
                explanation: 'Shakespeare wrote this tragedy around 1594-1596.'
            },
            {
                questionText: 'What is the chemical symbol for gold?',
                options: ['Au', 'Ag', 'Fe', 'Cu'],
                correctAnswer: 'Au',
                explanation: 'Au comes from the Latin word "aurum" meaning gold.'
            }
        ],
        'Python': [
            {
                questionText: 'Which keyword is used to define a function in Python?',
                options: ['def', 'function', 'define', 'func'],
                correctAnswer: 'def',
                explanation: 'The "def" keyword is used to define functions in Python.'
            },
            {
                questionText: 'What is the output of: type([1, 2, 3])?',
                options: ['<class \'list\'>', '<class \'tuple\'>', '<class \'dict\'>', '<class \'set\'>'],
                correctAnswer: '<class \'list\'>',
                explanation: 'Square brackets [] create a list object in Python.'
            },
            {
                questionText: 'Which method adds an element to the end of a list?',
                options: ['append()', 'add()', 'insert()', 'push()'],
                correctAnswer: 'append()',
                explanation: 'The append() method adds elements to the end of a list.'
            },
            {
                questionText: 'What does the "pass" statement do?',
                options: ['Does nothing, acts as placeholder', 'Exits a loop', 'Raises an exception', 'Returns None'],
                correctAnswer: 'Does nothing, acts as placeholder',
                explanation: 'pass is a null operation used as a placeholder in Python.'
            },
            {
                questionText: 'How do you create a dictionary in Python?',
                options: ['{}', '[]', '()', 'dict[]'],
                correctAnswer: '{}',
                explanation: 'Curly braces {} are used to create dictionaries in Python.'
            }
        ],
        'JavaScript': [
            {
                questionText: 'Which keyword declares a block-scoped variable?',
                options: ['let', 'var', 'const', 'Both let and const'],
                correctAnswer: 'Both let and const',
                explanation: 'Both let and const create block-scoped variables, unlike var.'
            },
            {
                questionText: 'What does === check for?',
                options: ['Value and type equality', 'Value equality only', 'Type equality only', 'Reference equality'],
                correctAnswer: 'Value and type equality',
                explanation: 'The === operator checks both value and type without coercion.'
            },
            {
                questionText: 'Which method adds elements to the end of an array?',
                options: ['push()', 'pop()', 'shift()', 'unshift()'],
                correctAnswer: 'push()',
                explanation: 'push() adds one or more elements to the end of an array.'
            },
            {
                questionText: 'What is a closure in JavaScript?',
                options: ['Function with access to outer scope', 'Loop termination', 'Error handling', 'Object method'],
                correctAnswer: 'Function with access to outer scope',
                explanation: 'A closure gives a function access to its outer scope.'
            },
            {
                questionText: 'Which keyword creates an asynchronous function?',
                options: ['async', 'await', 'promise', 'callback'],
                correctAnswer: 'async',
                explanation: 'The async keyword declares an asynchronous function.'
            }
        ]
    };

    // Get questions for this topic or use General Knowledge
    const questionPool = topicQuestions[topic] || topicQuestions['General Knowledge'];
    
    // Return requested number of questions
    const questions = [];
    for (let i = 0; i < count && i < questionPool.length; i++) {
        questions.push({
            ...questionPool[i],
            userAnswer: '',
            isCorrect: false,
            timeSpent: 0
        });
    }
    
    // If we need more questions than available, repeat from start
    while (questions.length < count) {
        const idx = questions.length % questionPool.length;
        questions.push({
            ...questionPool[idx],
            userAnswer: '',
            isCorrect: false,
            timeSpent: 0
        });
    }
    
    return questions;
}

/**
 * Create a new boss battle for user
 */
async function createBossBattle(userId, topic = null, difficulty = null) {
    try {
        // Get user's level for difficulty calculation
        const profile = await GamificationProfile.findOne({ userId });
        const userLevel = profile?.level || 1;

        // Determine topic
        if (!topic) {
            topic = await identifyWeakTopic(userId);
            if (!topic) {
                topic = 'General Knowledge';
            }
        }

        // Determine difficulty based on user level
        if (!difficulty) {
            difficulty = userLevel >= 10 ? 'hard' :
                userLevel >= 5 ? 'medium' : 'easy';
        }

        // Generate questions
        const questions = await generateBattleQuestions(topic, difficulty, 5);

        // Create battle
        const battleId = `battle_${uuidv4()}`;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48); // 48 hour expiry

        const battle = new BossBattle({
            userId,
            battleId,
            targetWeakness: topic,
            difficulty,
            questions,
            totalQuestions: questions.length,
            expiresAt
        });

        await battle.save();

        logger.info(`[BossBattle] Created battle ${battleId} for user ${userId} on topic ${topic}`);

        return battle;

    } catch (error) {
        logger.error('[BossBattle] Error creating battle:', error);
        throw error;
    }
}

/**
 * AI-Powered Answer Evaluation
 * Uses Gemini to intelligently evaluate user answers
 */
async function evaluateAnswersWithAI(battle, userAnswers) {
    try {
        const prompt = `
You are an expert AI evaluator for educational assessments. Evaluate the user's answers to the following questions.

**Topic:** ${battle.targetWeakness}
**Difficulty:** ${battle.difficulty}

**Instructions:**
1. Compare each user answer with the correct answer and options
2. Determine if the answer is correct (even if phrased differently)
3. Provide detailed feedback explaining why it's correct or incorrect
4. Be lenient with minor variations in wording if the concept is correct

**Questions and Answers:**

${battle.questions.map((q, i) => `
Question ${i + 1}: ${q.questionText}
Options: ${q.options.join(', ')}
Correct Answer: ${q.correctAnswer}
User Answer: ${userAnswers[i]?.userAnswer || 'No answer provided'}
`).join('\n')}

**Output Format (JSON):**
Return a JSON array with one object per question:
[
  {
    "questionIndex": 0,
    "isCorrect": true/false,
    "aiExplanation": "Detailed explanation of why the answer is correct/incorrect",
    "conceptualUnderstanding": "assessment of user's understanding (good/partial/poor)"
  },
  ...
]
`;

        const llm = await selectLLM();
        const response = await geminiService.generateText(llm, prompt);

        // Parse JSON response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            logger.warn('[BossBattle] AI evaluation failed, falling back to exact match');
            return fallbackEvaluation(battle, userAnswers);
        }

        const evaluations = JSON.parse(jsonMatch[0]);

        logger.info(`[BossBattle] AI evaluated ${evaluations.length} answers`);
        return evaluations;

    } catch (error) {
        logger.error('[BossBattle] Error in AI evaluation:', error);
        return fallbackEvaluation(battle, userAnswers);
    }
}

/**
 * Fallback evaluation using exact string comparison
 */
function fallbackEvaluation(battle, userAnswers) {
    return userAnswers.map((answer, index) => ({
        questionIndex: index,
        isCorrect: answer.userAnswer === battle.questions[index].correctAnswer,
        aiExplanation: battle.questions[index].explanation,
        conceptualUnderstanding: answer.userAnswer === battle.questions[index].correctAnswer ? 'good' : 'poor'
    }));
}

/**
 * Generate AI-powered revision plan for failed battles
 */
async function generateAIRevisionPlan(battle, evaluationResults) {
    try {
        const incorrectQuestions = battle.questions.filter((q, i) => !evaluationResults[i].isCorrect);

        const prompt = `
You are an educational advisor. A student failed a boss battle on "${battle.targetWeakness}".

**Performance:**
- Score: ${battle.score}%
- Correct: ${battle.correctAnswers}/${battle.totalQuestions}
- Difficulty: ${battle.difficulty}

**Weak Areas:**
${incorrectQuestions.map((q, i) => `
- ${q.questionText}
  User's answer: ${q.userAnswer}
  Correct answer: ${q.correctAnswer}
`).join('\n')}

**Create a personalized revision plan with:**
1. 3-5 specific topics to focus on
2. Suggested study materials or resources
3. Estimated retry days (2-7 days based on difficulty)
4. Actionable study tips

**Output Format (JSON):**
{
  "recommendedTopics": ["topic1", "topic2", ...],
  "suggestedDocuments": ["resource1", "resource2", ...],
  "estimatedRetryDays": 3,
  "aiSuggestions": "Detailed study plan and tips"
}
`;

        const llm = await selectLLM();
        const response = await geminiService.generateText(llm, prompt);

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return generateFallbackRevisionPlan(battle);
        }

        const plan = JSON.parse(jsonMatch[0]);
        plan.estimatedRetryDate = new Date(Date.now() + plan.estimatedRetryDays * 24 * 60 * 60 * 1000);

        logger.info(`[BossBattle] Generated AI revision plan`);
        return plan;

    } catch (error) {
        logger.error('[BossBattle] Error generating AI revision plan:', error);
        return generateFallbackRevisionPlan(battle);
    }
}

/**
 * Fallback revision plan
 */
function generateFallbackRevisionPlan(battle) {
    const incorrectQuestions = battle.questions.filter(q => !q.isCorrect);

    return {
        recommendedTopics: incorrectQuestions.map(q => q.questionText.substring(0, 50)),
        suggestedDocuments: [`Review ${battle.targetWeakness} fundamentals`],
        estimatedRetryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        aiSuggestions: `Focus on understanding the core concepts of ${battle.targetWeakness}. Review the incorrect questions and practice similar problems.`
    };
}

/**
 * Submit answers for a battle
 */
async function submitBattle(battleId, userId, answers) {
    try {
        logger.info(`[BossBattle] User ${userId} submitting battle ${battleId}`);

        const battle = await BossBattle.findOne({ battleId, userId });

        if (!battle) {
            throw new Error('Battle not found');
        }

        if (battle.status !== 'active') {
            throw new Error('Battle is not active');
        }

        if (battle.isExpired()) {
            battle.status = 'expired';
            await battle.save();
            throw new Error('Battle has expired');
        }

        logger.info(`[BossBattle] Evaluating answers for battle ${battleId} using AI`);

        // AI-Powered Answer Evaluation
        const evaluationResults = await evaluateAnswersWithAI(battle, answers);

        // Update battle with AI evaluation results
        evaluationResults.forEach((result, index) => {
            if (battle.questions[index]) {
                battle.questions[index].userAnswer = answers[index].userAnswer;
                battle.questions[index].isCorrect = result.isCorrect;
                battle.questions[index].timeSpent = answers[index].timeSpent || 0;
                battle.questions[index].explanation = result.aiExplanation || battle.questions[index].explanation;
            }
        });

        // Calculate score
        battle.calculateScore();
        battle.completedAt = new Date();

        // Calculate total time
        battle.totalTimeSpent = battle.questions.reduce((sum, q) => sum + q.timeSpent, 0);

        logger.info(`[BossBattle] Battle ${battleId} score: ${battle.score}% (${battle.correctAnswers}/${battle.totalQuestions})`);

        // Determine XP reward
        let earnedXP = 0;
        let newXPTotal = 0;
        let newLevel = 0;
        let leveledUp = false;

        if (battle.isPassed()) {
            battle.status = 'completed';
            // Base XP by difficulty
            const baseXP = battle.difficulty === 'hard' ? 90 :
                battle.difficulty === 'medium' ? 60 : 40;
            // Bonus for perfect score
            const perfectBonus = battle.score === 100 ? 20 : 0;
            earnedXP = baseXP + perfectBonus;

            // Award XP with error handling
            try {
                const xpResult = await gamificationService.awardXP(userId, earnedXP, 'boss_battle', battle.targetWeakness);
                battle.earnedXP = earnedXP;
                newXPTotal = xpResult.newXP;
                newLevel = xpResult.newLevel;
                leveledUp = xpResult.leveledUp;
                logger.info(`[BossBattle] ✅ Awarded ${earnedXP} XP to user ${userId}. Total XP: ${newXPTotal}, Level: ${newLevel}${leveledUp ? ' 🎉 LEVEL UP!' : ''}`);
            } catch (xpError) {
                logger.error('[BossBattle] ❌ Failed to award XP:', xpError);
                throw new Error('Failed to award XP for boss battle');
            }

            // Check for badge
            try {
                const badge = await badgeService.checkBossBattleBadge(userId, battle);
                if (badge) {
                    battle.earnedBadge = badge.name;
                    logger.info(`[BossBattle] 🏆 User ${userId} earned badge: ${badge.name}`);
                }
            } catch (badgeError) {
                logger.error('[BossBattle] ⚠️ Badge check failed:', badgeError);
                // Don't throw - XP already awarded
            }

        } else {
            battle.status = 'failed';
            logger.info(`[BossBattle] Battle ${battleId} failed with score ${battle.score}%`);
            // Generate AI-powered revision plan
            battle.revisionPlan = await generateAIRevisionPlan(battle, evaluationResults);
        }

        await battle.save();
        logger.info(`[BossBattle] ✅ Battle ${battleId} saved with status: ${battle.status}`);

        // Update profile with completed battle
        if (battle.status === 'completed') {
            try {
                await GamificationProfile.findOneAndUpdate(
                    { userId },
                    {
                        $push: {
                            completedBattles: {
                                battleId: battle.battleId,
                                topic: battle.targetWeakness,
                                score: battle.score,
                                completedAt: battle.completedAt,
                                earnedBadge: battle.earnedBadge
                            }
                        }
                    }
                );
                logger.info(`[BossBattle] ✅ Updated gamification profile for user ${userId}`);
            } catch (profileError) {
                logger.error('[BossBattle] ❌ Failed to update profile:', profileError);
                // Don't throw - battle completion already saved
            }
        }

        logger.info(`[BossBattle] ✅ Battle submission complete for user ${userId}`);

        return {
            status: battle.status,
            score: battle.score,
            correctAnswers: battle.correctAnswers,
            totalQuestions: battle.totalQuestions,
            earnedXP,
            newXPTotal,
            newLevel,
            leveledUp,
            earnedBadge: battle.earnedBadge,
            revisionPlan: battle.revisionPlan
        };

    } catch (error) {
        logger.error('[BossBattle] ❌ Error submitting battle:', error);
        throw error;
    }
}

/**
 * Generate AI-powered revision plan
 */
/**
 * Get active battles for user
 */
async function getActiveBattles(userId) {
    try {
        // Expire old battles first
        await BossBattle.expireOldBattles();

        const battles = await BossBattle.find({
            userId,
            status: 'active'
        }).sort({ generatedAt: -1 });

        return battles;
    } catch (error) {
        logger.error('[BossBattle] Error getting battles:', error);
        return [];
    }
}

/**
 * Get battle history
 */
async function getBattleHistory(userId, limit = 10) {
    try {
        const battles = await BossBattle.find({
            userId,
            status: { $in: ['completed', 'failed'] }
        }).sort({ completedAt: -1 }).limit(limit);

        return battles;
    } catch (error) {
        logger.error('[BossBattle] Error getting history:', error);
        return [];
    }
}

module.exports = {
    createBossBattle,
    submitBattle,
    getActiveBattles,
    getBattleHistory,
    identifyWeakTopic,
    generateBattleQuestions // Add for testing
};

// server/services/bountyService.js
const BountyQuestion = require('../models/BountyQuestion');
const GamificationProfile = require('../models/GamificationProfile');
const ChatHistory = require('../models/ChatHistory');
const { selectLLM } = require('./llmRouterService');
const geminiService = require('./geminiService');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Analyze user's chat history to identify knowledge gaps
 * @param {string} userId - User ID
 * @param {number} lookbackDays - Number of days to analyze (default: 7)
 * @returns {Promise<Object>} - Knowledge gaps analysis
 */
async function analyzeKnowledgeGaps(userId, lookbackDays = 7) {
    try {
        const since = new Date();
        since.setDate(since.getDate() - lookbackDays);

        // Get recent chat history
        const chats = await ChatHistory.find({
            userId,
            timestamp: { $gte: since }
        }).sort({ timestamp: -1 }).limit(50);

        if (chats.length === 0) {
            return null;
        }

        // Analyze patterns
        const topics = {};
        const errorPatterns = [];
        let totalResponseTime = 0;

        chats.forEach(chat => {
            // Extract topics from queries
            const query = chat.query.toLowerCase();

            // Simple topic extraction (can be enhanced with NLP)
            const topicKeywords = {
                'python': ['python', 'def', 'class', 'import'],
                'statistics': ['statistics', 'mean', 'median', 'distribution'],
                'machine_learning': ['ml', 'model', 'train', 'neural'],
                'linear_algebra': ['matrix', 'vector', 'linear algebra'],
                'data_structures': ['array', 'list', 'tree', 'graph']
            };

            for (const [topic, keywords] of Object.entries(topicKeywords)) {
                if (keywords.some(kw => query.includes(kw))) {
                    topics[topic] = (topics[topic] || 0) + 1;
                }
            }

            // Check for error indicators in responses
            if (chat.response && (
                chat.response.includes('error') ||
                chat.response.includes('mistake') ||
                chat.response.includes('incorrect')
            )) {
                errorPatterns.push({
                    topic: chat.documentContext || 'general',
                    query: chat.query.substring(0, 100)
                });
            }
        });

        // Find weakest topics (frequently asked but with errors)
        const weakTopics = Object.entries(topics)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([topic]) => topic);

        const avgResponseTime = totalResponseTime / chats.length || 0;

        return {
            weakTopics,
            errorPatterns: errorPatterns.slice(0, 5),
            avgResponseTime,
            totalInteractions: chats.length,
            analysisDate: new Date()
        };

    } catch (error) {
        logger.error('[BountyService] Error analyzing knowledge gaps:', error);
        return null;
    }
}

/**
 * Generate a bounty question based on knowledge gaps
 * @param {string} userId - User ID
 * @param {Object} gapAnalysis - Knowledge gap data
 * @returns {Promise<Object>} - Generated bounty question
 */
async function generateBountyQuestion(userId, gapAnalysis) {
    try {
        if (!gapAnalysis || !gapAnalysis.weakTopics || gapAnalysis.weakTopics.length === 0) {
            logger.warn('[BountyService] No knowledge gaps found for user:', userId);
            return null;
        }

        // Select weakest topic
        const targetTopic = gapAnalysis.weakTopics[0];

        // Determine difficulty based on user level
        const profile = await GamificationProfile.findOne({ userId });
        const userLevel = profile?.level || 1;

        let difficulty = 'easy';
        if (userLevel >= 10) difficulty = 'expert';
        else if (userLevel >= 7) difficulty = 'hard';
        else if (userLevel >= 4) difficulty = 'medium';

        // Generate question using AI
        const prompt = `Generate a challenging ${difficulty} level question about ${targetTopic} to test deep understanding.

The student has shown weakness in this area based on their recent learning patterns.

Return a JSON object with:
{
  "questionText": "The question (be specific and thought-provoking)",
  "questionType": "multiple_choice",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": "Option X",
  "explanation": "Why this is the correct answer (concise)",
  "creditReward": ${difficulty === 'expert' ? 50 : (difficulty === 'hard' ? 30 : (difficulty === 'medium' ? 20 : 10))},
  "xpBonus": ${difficulty === 'expert' ? 25 : (difficulty === 'hard' ? 15 : (difficulty === 'medium' ? 10 : 5))}
}`;

        const { chosenModel } = await selectLLM(prompt, { user: { _id: userId }, subject: targetTopic });

        let questionData;
        let generationSuccess = false;

        // Try Ollama first (always attempt, regardless of chosen model)
        try {
            logger.info('[BountyService] 🚀 Attempting question generation with Ollama...');
            const ollamaService = require('./ollamaService');
            const response = await ollamaService.generateContentWithHistory(
                [],      // empty chat history
                prompt,  // the bounty question prompt
                null,    // no system prompt
                { 
                    model: chosenModel.provider === 'ollama' ? chosenModel.modelId : 'llama3.2:latest',
                    ollamaUrl: process.env.OLLAMA_API_BASE_URL || 'http://localhost:11434',
                    temperature: 0.7 
                }
            );
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            questionData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            if (questionData) {
                generationSuccess = true;
                logger.info('[BountyService] ✅ Ollama generation successful');
            }
        } catch (ollamaError) {
            logger.warn('[BountyService] ⚠️ Ollama generation failed:', ollamaError.message);
            logger.info('[BountyService] 🔄 Falling back to Gemini API...');
        }

        // Fallback to Gemini if Ollama failed or if Gemini was selected
        if (!generationSuccess) {
            try {
                logger.info('[BountyService] 🚀 Attempting question generation with Gemini API...');
                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) {
                    logger.error('[BountyService] ❌ GEMINI_API_KEY not found in environment');
                    throw new Error('Gemini API key not configured');
                }
                const response = await geminiService.generateContentWithHistory(
                    [],      // empty chat history
                    prompt,  // the bounty question prompt
                    null,    // no system prompt
                    { temperature: 0.7, apiKey }  // options with API key
                );
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                questionData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
                if (questionData) {
                    generationSuccess = true;
                    logger.info('[BountyService] ✅ Gemini generation successful');
                }
            } catch (geminiError) {
                logger.error('[BountyService] ❌ Gemini generation also failed:', geminiError.message);
            }
        }

        if (!questionData) {
            // Fallback question
            questionData = {
                questionText: `Explain a practical application of ${targetTopic} in real-world scenarios.`,
                questionType: 'open_ended',
                options: [],
                correctAnswer: '',
                explanation: 'This tests understanding of practical applications.',
                creditReward: 15,
                learningCreditsBonus: 10
            };
        }

        // Save bounty to database
        const bountyId = `bounty_${uuidv4()}`;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

        const bounty = new BountyQuestion({
            bountyId,
            userId,
            topic: targetTopic,
            difficulty,
            knowledgeGap: `Weak in ${targetTopic} based on recent activity`,
            questionText: questionData.questionText,
            questionType: questionData.questionType,
            options: questionData.options || [],
            correctAnswer: questionData.correctAnswer,
            explanation: questionData.explanation,
            creditReward: questionData.creditReward,
            xpBonus: questionData.xpBonus || 0,
            expiresAt,
            generationMethod: 'gap_based',
            sessionAnalysisData: gapAnalysis
        });

        await bounty.save();

        logger.info(`[BountyService] Generated bounty ${bountyId} for user ${userId} on topic ${targetTopic}`);

        return bounty;

    } catch (error) {
        logger.error('[BountyService] Error generating bounty question:', error);
        return null;
    }
}

/**
 * Periodic bounty generation for all active users
 * @returns {Promise<number>} - Number of bounties generated
 */
async function generatePeriodicBounties() {
    try {
        logger.info('[BountyService] Starting periodic bounty generation...');

        // Get all active users (users with recent activity)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const activeProfiles = await GamificationProfile.find({
            lastActiveDate: { $gte: sevenDaysAgo }
        }).limit(100); // Process max 100 users per run

        let generatedCount = 0;

        for (const profile of activeProfiles) {
            try {
                // Check if user already has active bounties
                const existingBounties = await BountyQuestion.countDocuments({
                    userId: profile.userId,
                    status: 'active'
                });

                if (existingBounties >= 3) {
                    continue; // Skip if user has 3+ active bounties
                }

                // Analyze knowledge gaps
                const gapAnalysis = await analyzeKnowledgeGaps(profile.userId, 7);

                if (gapAnalysis) {
                    // Generate bounty
                    const bounty = await generateBountyQuestion(profile.userId, gapAnalysis);
                    if (bounty) {
                        generatedCount++;
                    }
                }

            } catch (userError) {
                logger.error('[BountyService] Error processing user:', profile.userId, userError);
            }
        }

        logger.info(`[BountyService] Generated ${generatedCount} bounties`);

        return generatedCount;

    } catch (error) {
        logger.error('[BountyService] Error in periodic generation:', error);
        return 0;
    }
}

/**
 * Award learning credits to user
 * @param {string} userId - User ID
 * @param {number} amount - Credits to award
 * @param {string} reason - Reason for award
 * @param {string} bountyId - Optional bounty ID
 * @returns {Promise<number>} - New credit balance
 */
async function awardCredits(userId, amount, reason, bountyId = '') {
    try {
        const profile = await GamificationProfile.findOne({ userId });

        if (!profile) {
            throw new Error('Gamification profile not found');
        }

        // Update both legacy and new fields
        profile.learningCredits += amount;
        profile.totalLearningCredits = (profile.totalLearningCredits || 0) + amount;
        
        // Add to legacy creditsHistory
        profile.creditsHistory.push({
            amount,
            reason,
            bountyId,
            timestamp: new Date()
        });
        
        // Add to new learningCreditsHistory
        if (!profile.learningCreditsHistory) {
            profile.learningCreditsHistory = [];
        }
        profile.learningCreditsHistory.push({
            amount,
            reason,
            bountyId,
            topic: '',
            timestamp: new Date()
        });

        // Keep history manageable
        if (profile.creditsHistory.length > 100) {
            profile.creditsHistory = profile.creditsHistory.slice(-100);
        }
        if (profile.learningCreditsHistory.length > 100) {
            profile.learningCreditsHistory = profile.learningCreditsHistory.slice(-100);
        }

        await profile.save();

        logger.info(`[BountyService] Awarded ${amount} credits to user ${userId}. New balance: ${profile.learningCredits}, Total Learning Credits: ${profile.totalLearningCredits}`);

        return profile.learningCredits;

    } catch (error) {
        logger.error('[BountyService] Error awarding credits:', error);
        throw error;
    }
}

/**
 * Submit bounty answer
 * @param {string} bountyId - Bounty ID
 * @param {string} userId - User ID
 * @param {string} answer - User's answer
 * @returns {Promise<Object>} - Result with credits awarded
 */
async function submitBountyAnswer(bountyId, userId, answer) {
    try {
        logger.info(`[BountyService] User ${userId} submitting answer for bounty ${bountyId}`);

        const bounty = await BountyQuestion.findOne({ bountyId, userId });

        if (!bounty) {
            throw new Error('Bounty not found');
        }

        if (bounty.status !== 'active') {
            throw new Error('Bounty is not active');
        }

        if (bounty.isExpired()) {
            bounty.status = 'expired';
            await bounty.save();
            throw new Error('Bounty has expired');
        }

        // Submit answer
        const isCorrect = bounty.submit(answer);
        await bounty.save();

        logger.info(`[BountyService] Bounty ${bountyId} answer ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);

        let creditsAwarded = 0;
        let xpAwarded = 0;
        let newCreditsBalance = 0;
        let newXPTotal = 0;
        let newLevel = 0;
        let leveledUp = false;

        if (isCorrect) {
            // Award credits
            creditsAwarded = bounty.creditReward;
            try {
                newCreditsBalance = await awardCredits(userId, creditsAwarded, 'bounty_completed', bountyId);
                logger.info(`[BountyService] ✅ Awarded ${creditsAwarded} credits to user ${userId}. New balance: ${newCreditsBalance}`);
            } catch (creditError) {
                logger.error('[BountyService] ❌ Failed to award credits:', creditError);
                throw new Error('Failed to award credits');
            }

            // Award bonus XP
            if (bounty.xpBonus > 0) {
                try {
                    const gamificationService = require('./gamificationService');
                    const xpResult = await gamificationService.awardXP(userId, bounty.xpBonus, 'bounty_question', bounty.topic);
                    xpAwarded = bounty.xpBonus;
                    newXPTotal = xpResult.newXP;
                    newLevel = xpResult.newLevel;
                    leveledUp = xpResult.leveledUp;
                    logger.info(`[BountyService] ✅ Awarded ${xpAwarded} XP to user ${userId}. Total XP: ${newXPTotal}, Level: ${newLevel}${leveledUp ? ' 🎉 LEVEL UP!' : ''}`);
                } catch (xpError) {
                    logger.error('[BountyService] ❌ Failed to award XP:', xpError);
                    // Don't throw - credits already awarded
                }
            }
        }

        logger.info(`[BountyService] ✅ Bounty submission complete for user ${userId}`);

        return {
            isCorrect,
            creditsAwarded,
            xpAwarded,
            newCreditsBalance,
            newXPTotal,
            newLevel,
            leveledUp,
            explanation: bounty.explanation,
            correctAnswer: bounty.correctAnswer
        };

    } catch (error) {
        logger.error('[BountyService] ❌ Error submitting bounty:', error);
        throw error;
    }
}

/**
 * Get active bounties for user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Active bounties
 */
async function getActiveBounties(userId) {
    try {
        // Expire old bounties first
        await BountyQuestion.expireOldBounties();

        const bounties = await BountyQuestion.find({
            userId,
            status: 'active'
        }).sort({ creditReward: -1, expiresAt: 1 });

        return bounties;

    } catch (error) {
        logger.error('[BountyService] Error getting bounties:', error);
        return [];
    }
}

module.exports = {
    analyzeKnowledgeGaps,
    generateBountyQuestion,
    generatePeriodicBounties,
    awardCredits,
    submitBountyAnswer,
    getActiveBounties
};

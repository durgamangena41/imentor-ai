// server/services/skillTreeGameService.js
const SkillTreeGame = require('../models/SkillTreeGame');
const GamificationProfile = require('../models/GamificationProfile');
const { logger } = require('../utils/logger');
const geminiService = require('./geminiService');

/**
 * Generate levels for a specific topic using AI
 */
async function generateLevels(userId, topic, assessmentResult, answers) {
    try {
        const knowledgeLevel = assessmentResult?.level || 'Beginner';

        const prompt = `
            You are a curriculum designer for a gamified learning platform "iMentor".
            Generate a comprehensive learning path for the topic: "${topic}".
            The user's current knowledge level is: "${knowledgeLevel}".
            
            Based on the assessment summary: "${assessmentResult?.summary || ''}"
            
            RULES:
            1. Generate exactly 25 levels.
            2. For a ${knowledgeLevel} learner, start with appropriate concepts.
            3. Each level MUST have:
               - id: sequential number starting from 1
               - name: concise, catchy level title
               - description: what will be learned (max 100 chars)
               - difficulty: "easy" (levels 1-8), "medium" (levels 9-16), "hard" (levels 17-24), or "boss" (level 25)
            
            RETURN ONLY A JSON ARRAY like this:
            [
              { "id": 1, "name": "Title", "description": "...", "difficulty": "easy", "status": "unlocked" },
              ...
            ]
            Important: The FIRST level (id: 1) should have status: "unlocked", all others "locked".
        `;

        let responseText = await geminiService.generateContentWithHistory([], prompt, null);

        let levels = [];
        try {
            // Clean markdown if present
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                levels = JSON.parse(jsonMatch[0]);
            } else {
                levels = JSON.parse(responseText);
            }
        } catch (parseErr) {
            logger.error('[SkillTreeGameService] JSON Parse Error:', parseErr);
            throw new Error('Failed to generate valid levels JSON');
        }

        // Ensure IDs and status are correct
        levels = levels.map((l, i) => ({
            ...l,
            id: i + 1,
            status: i === 0 ? 'unlocked' : 'locked',
            stars: 0,
            score: 0,
            attempts: 0
        }));

        return levels;

    } catch (error) {
        logger.error('[SkillTreeGameService] Error generating levels:', error);
        throw error;
    }
}

/**
 * Generate 5 questions for a specific level using AI
 */
async function generateLevelQuestions(topic, levelName, difficulty) {
    try {
        const prompt = `
            You are the "iMentor" Assessment Engine.
            Topic: "${topic}"
            Sub-topic/Level: "${levelName}"
            Difficulty: "${difficulty}"
            
            TASK: Generate 5 multiple-choice questions.
            RULES:
            1. Each question must have 4 options.
            2. Provide exactly one correctIndex (0-3).
            3. Provide a helpful explanation for the correct answer.
            4. Tone should be encouraging and educational.
            5. Return ONLY a JSON object with a "questions" key.
            
            Example format:
            {
              "questions": [
                {
                  "question": "What is...?",
                  "options": ["A", "B", "C", "D"],
                  "correctIndex": 0,
                  "explanation": "..."
                }
              ]
            }
        `;

        let responseText = await geminiService.generateContentWithHistory([], prompt, null);

        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const data = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            return data.questions || [];
        } catch (parseErr) {
            logger.error('[SkillTreeGameService] Question JSON Parse Error:', parseErr);
            throw new Error('Failed to generate valid questions JSON');
        }

    } catch (error) {
        logger.error('[SkillTreeGameService] Error generating questions:', error);
        throw error;
    }
}

/**
 * Update level progress and award credits
 */
async function updateLevelProgress(userId, gameId, levelId, progressData) {
    try {
        const game = await SkillTreeGame.findOne({ _id: gameId, userId });
        if (!game) throw new Error('Game not found');

        const levelIndex = game.levels.findIndex(l => l.id === parseInt(levelId));
        if (levelIndex === -1) throw new Error('Level not found');

        const level = game.levels[levelIndex];
        const isFirstCompletion = level.status !== 'completed' && progressData.status === 'completed';

        // Update level stats
        level.stars = Math.max(level.stars || 0, progressData.stars || 0);
        level.score = Math.max(level.score || 0, progressData.score || 0);
        level.status = progressData.status || level.status;
        level.completedAt = progressData.status === 'completed' ? new Date() : level.completedAt;
        level.attempts = (level.attempts || 0) + 1;

        // Unlock next level if completed
        if (progressData.status === 'completed' && levelIndex < game.levels.length - 1) {
            const nextLevel = game.levels[levelIndex + 1];
            if (nextLevel.status === 'locked') {
                nextLevel.status = 'unlocked';
            }
        }

        await game.save();

        let creditsEarned = 0;
        if (isFirstCompletion && progressData.stars > 0) {
            creditsEarned = progressData.stars === 3 ? 10 : progressData.stars === 2 ? 8 : 5;
            await awardLearningCredits(userId, creditsEarned, 'application', game.topic);
        }

        return {
            success: true,
            learningCreditsEarned: creditsEarned,
            game
        };

    } catch (error) {
        logger.error('[SkillTreeGameService] Error updating progress:', error);
        throw error;
    }
}

/**
 * Helper to award Learning Credits to GamificationProfile
 */
async function awardLearningCredits(userId, amount, reason, topic) {
    try {
        let profile = await GamificationProfile.findOne({ userId });
        if (!profile) {
            profile = new GamificationProfile({ userId });
        }

        profile.totalLearningCredits += amount;
        profile.learningCreditsHistory.push({
            amount,
            reason: reason || 'skill_tree_completion',
            topic,
            timestamp: new Date()
        });

        await profile.save();
        logger.info(`[SkillTreeGameService] Awarded ${amount} credits to user ${userId} for ${topic}`);
    } catch (error) {
        logger.error('[SkillTreeGameService] Error awarding credits:', error);
    }
}

module.exports = {
    generateLevels,
    generateLevelQuestions,
    updateLevelProgress,
    awardLearningCredits
};

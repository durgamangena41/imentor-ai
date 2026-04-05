// server/services/skillTreeService.js
const SkillTree = require('../models/SkillTree');
const GamificationProfile = require('../models/GamificationProfile');
const { logger } = require('../utils/logger');

/**
 * Check if a skill is unlocked for a user
 * @param {string} userId - User ID
 * @param {string} skillId - Skill identifier
 * @returns {Promise<{unlocked: boolean, blockedBy: string|null, masteryPercentage: number}>}
 */
async function isSkillUnlocked(userId, skillId) {
    try {
        const skill = await SkillTree.findOne({ skillId, isActive: true });
        if (!skill) {
            return { unlocked: false, blockedBy: null, message: 'Skill not found' };
        }

        const profile = await GamificationProfile.findOne({ userId });
        if (!profile) {
            return { unlocked: false, blockedBy: null, message: 'Profile not found' };
        }

        // Check all prerequisites
        for (const prereqId of skill.prerequisites) {
            const prereqSkill = await SkillTree.findOne({ skillId: prereqId });
            if (!prereqSkill) continue;

            const prereqMastery = profile.skillMastery.get(prereqId) || 0;

            if (prereqMastery < prereqSkill.masteryThreshold) {
                return {
                    unlocked: false,
                    blockedBy: prereqId,
                    requiredMastery: prereqSkill.masteryThreshold,
                    currentMastery: prereqMastery,
                    message: `Requires ${prereqSkill.name} at ${prereqSkill.masteryThreshold}% mastery`
                };
            }
        }

        const currentMastery = profile.skillMastery.get(skillId) || 0;

        return {
            unlocked: true,
            blockedBy: null,
            masteryPercentage: currentMastery
        };

    } catch (error) {
        logger.error('[SkillTreeService] Error checking skill unlock:', error);
        return { unlocked: false, blockedBy: null, message: 'Error occurred' };
    }
}

/**
 * Get user's complete skill tree state (for fog-of-war visualization)
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
async function getUserSkillTree(userId) {
    try {
        const allSkills = await SkillTree.find({ isActive: true }).lean();
        const profile = await GamificationProfile.findOne({ userId });

        if (!profile) {
            logger.warn(`[SkillTreeService] No profile found for user ${userId}`);
            return [];
        }

        const skillTreeState = await Promise.all(allSkills.map(async (skill) => {
            const unlockStatus = await isSkillUnlocked(userId, skill.skillId);
            const mastery = profile.skillMastery.get(skill.skillId) || 0;
            const isMastered = mastery >= skill.masteryThreshold;

            return {
                ...skill,
                unlocked: unlockStatus.unlocked,
                mastered: isMastered,
                masteryPercentage: mastery,
                status: isMastered ? 'mastered' :
                    unlockStatus.unlocked ? 'unlocked' : 'locked',
                blockedBy: unlockStatus.blockedBy,
                // Remove sensitive data
                assessmentQuestions: unlockStatus.unlocked ? skill.assessmentQuestions : []
            };
        }));

        // Sort by tier and category
        skillTreeState.sort((a, b) => {
            if (a.position.tier !== b.position.tier) {
                return a.position.tier - b.position.tier;
            }
            return a.category.localeCompare(b.category);
        });

        return skillTreeState;

    } catch (error) {
        logger.error('[SkillTreeService] Error getting user skill tree:', error);
        return [];
    }
}

/**
 * Update skill mastery after an assessment
 * @param {string} userId - User ID
 * @param {string} skillId - Skill identifier
 * @param {number} assessmentScore - Score from assessment (0-100)
 * @returns {Promise<{newMastery: number, newlyUnlocked: Array}>}
 */
async function updateSkillMastery(userId, skillId, assessmentScore) {
    try {
        const profile = await GamificationProfile.findOne({ userId });
        if (!profile) {
            throw new Error('Profile not found');
        }

        const currentMastery = profile.skillMastery.get(skillId) || 0;

        // Weighted average: 70% current mastery + 30% new assessment score
        // This prevents a single bad attempt from destroying progress
        const newMastery = Math.round((currentMastery * 0.7) + (assessmentScore * 0.3));

        profile.skillMastery.set(skillId, newMastery);

        // Check if this unlocks new skills
        const newlyUnlocked = await checkForNewUnlocks(userId, profile);

        await profile.save();

        logger.info(`[SkillTreeService] Updated mastery for ${skillId}: ${currentMastery}% → ${newMastery}%`);

        return {
            newMastery,
            newlyUnlocked,
            justMastered: newMastery >= 80 && currentMastery < 80
        };

    } catch (error) {
        logger.error('[SkillTreeService] Error updating skill mastery:', error);
        throw error;
    }
}

/**
 * Check for newly unlocked skills after mastery update
 * @param {string} userId - User ID
 * @param {GamificationProfile} profile - User's profile
 * @returns {Promise<Array>} - Array of newly unlocked skill IDs
 */
async function checkForNewUnlocks(userId, profile) {
    try {
        const allSkills = await SkillTree.find({ isActive: true });
        const newlyUnlocked = [];

        for (const skill of allSkills) {
            // Skip if already unlocked
            if (profile.unlockedSkills.includes(skill.skillId)) {
                continue;
            }

            const { unlocked } = await isSkillUnlocked(userId, skill.skillId);

            if (unlocked) {
                profile.unlockedSkills.push(skill.skillId);
                newlyUnlocked.push(skill.skillId);
                logger.info(`[SkillTreeService] Unlocked new skill for ${userId}: ${skill.skillId}`);
            }
        }

        return newlyUnlocked;

    } catch (error) {
        logger.error('[SkillTreeService] Error checking for new unlocks:', error);
        return [];
    }
}

/**
 * Get assessment questions for a skill
 * @param {string} userId - User ID
 * @param {string} skillId - Skill identifier
 * @returns {Promise<Array|null>}
 */
async function getSkillAssessment(userId, skillId) {
    try {
        const { unlocked } = await isSkillUnlocked(userId, skillId);

        if (!unlocked) {
            logger.warn(`[SkillTreeService] User ${userId} attempted to access locked skill ${skillId}`);
            return null;
        }

        const skill = await SkillTree.findOne({ skillId, isActive: true });
        if (!skill) {
            return null;
        }

        // Return questions without correct answers (for frontend display)
        return skill.assessmentQuestions.map(q => ({
            _id: q._id,
            difficulty: q.difficulty,
            question: q.question,
            options: q.options
        }));

    } catch (error) {
        logger.error('[SkillTreeService] Error getting skill assessment:', error);
        return null;
    }
}

/**
 * Submit assessment answers and calculate score
 * @param {string} userId - User ID
 * @param {string} skillId - Skill identifier
 * @param {Array} userAnswers - Array of user's answers
 * @returns {Promise<{score: number, results: Array}>}
 */
async function submitSkillAssessment(userId, skillId, userAnswers) {
    try {
        const skill = await SkillTree.findOne({ skillId, isActive: true });
        if (!skill) {
            throw new Error('Skill not found');
        }

        const results = [];
        let correctCount = 0;

        skill.assessmentQuestions.forEach((question, index) => {
            const userAnswer = userAnswers[index];
            const isCorrect = userAnswer === question.correctAnswer;

            if (isCorrect) correctCount++;

            results.push({
                questionId: question._id,
                isCorrect,
                correctAnswer: question.correctAnswer,
                explanation: question.explanation
            });
        });

        const score = Math.round((correctCount / skill.assessmentQuestions.length) * 100);

        // Update mastery
        const masteryUpdate = await updateSkillMastery(userId, skillId, score);

        logger.info(`[SkillTreeService] Assessment submitted for ${skillId}: ${score}%`);

        return {
            score,
            results,
            newMastery: masteryUpdate.newMastery,
            newlyUnlocked: masteryUpdate.newlyUnlocked,
            justMastered: masteryUpdate.justMastered
        };

    } catch (error) {
        logger.error('[SkillTreeService] Error submitting assessment:', error);
        throw error;
    }
}

/**
 * Get skill tree statistics
 * @param {string} userId - User ID
 * @returns {Promise<object>}
 */
async function getSkillTreeStats(userId) {
    try {
        const profile = await GamificationProfile.findOne({ userId });
        if (!profile) {
            return { totalSkills: 0, unlockedCount: 0, masteredCount: 0, progress: 0 };
        }

        const totalSkills = await SkillTree.countDocuments({ isActive: true });
        const unlockedCount = profile.unlockedSkills.length;

        let masteredCount = 0;
        for (const [skillId, mastery] of profile.skillMastery.entries()) {
            const skill = await SkillTree.findOne({ skillId });
            if (skill && mastery >= skill.masteryThreshold) {
                masteredCount++;
            }
        }

        const progress = totalSkills > 0 ? Math.round((masteredCount / totalSkills) * 100) : 0;

        return {
            totalSkills,
            unlockedCount,
            masteredCount,
            lockedCount: totalSkills - unlockedCount,
            progress
        };

    } catch (error) {
        logger.error('[SkillTreeService] Error getting skill tree stats:', error);
        return { totalSkills: 0, unlockedCount: 0, masteredCount: 0, progress: 0 };
    }
}

/**
 * Store user's topic assessment result
 * @param {string} userId - User ID
 * @param {string} topic - Topic name
 * @param {Object} result - Assessment result
 * @param {Array} answers - User's answers to diagnostic questions
 */
async function storeUserTopicAssessment(userId, topic, result, answers) {
    try {
        let profile = await GamificationProfile.findOne({ userId });
        if (!profile) {
            profile = new GamificationProfile({ userId });
        }

        // Initialize topicAssessments if not exists
        if (!profile.topicAssessments) {
            profile.topicAssessments = new Map();
        }

        profile.topicAssessments.set(topic.toLowerCase(), {
            level: result.level,
            summary: result.summary,
            strengths: result.strengths || [],
            improvements: result.improvements || [],
            recommendedStartingPoint: result.recommendedStartingPoint,
            answers: answers,
            assessedAt: new Date()
        });

        await profile.save();
        logger.info(`[SkillTreeService] Stored topic assessment for user ${userId}, topic: ${topic}`);

    } catch (error) {
        logger.error('[SkillTreeService] Error storing topic assessment:', error);
        // Don't throw - this is not critical
    }
}

module.exports = {
    isSkillUnlocked,
    getUserSkillTree,
    updateSkillMastery,
    checkForNewUnlocks,
    getSkillAssessment,
    submitSkillAssessment,
    getSkillTreeStats,
    storeUserTopicAssessment
};

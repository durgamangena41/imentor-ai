    // server/jobs/bossBattleGenerator.js
const cron = require('node-cron');
const GamificationProfile = require('../models/GamificationProfile');
const bossBattleService = require('../services/bossBattleService');
const { logger } = require('../utils/logger');

/**
 * Cron job to generate boss battles for active users
 * Runs every 4 hours
 * Analyzes weak topics and creates personalized battles
 */

let cronJob = null;

const startBossBattleGenerator = () => {
    if (cronJob) {
        logger.warn('[BossBattleCron] Job already running');
        return;
    }

    // Run every 4 hours
    cronJob = cron.schedule('0 */4 * * *', async () => {
        logger.info('[BossBattleCron] Starting daily boss battle generation...');

        try {
            // Get all active users (have logged in within last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const activeProfiles = await GamificationProfile.find({
                updatedAt: { $gte: sevenDaysAgo }
            }).limit(100); // Limit to prevent overload

            logger.info(`[BossBattleCron] Found ${activeProfiles.length} active users`);

            let generated = 0;
            let failed = 0;

            for (const profile of activeProfiles) {
                try {
                    // Check if user already has an active battle
                    const activeBattles = await bossBattleService.getActiveBattles(profile.userId);

                    // Only create if they have 0 or 1 active battles
                    if (activeBattles.length < 2) {
                        await bossBattleService.createBossBattle(profile.userId);
                        generated++;
                        logger.info(`[BossBattleCron] Created battle for user ${profile.userId}`);
                    }

                } catch (error) {
                    failed++;
                    logger.error(`[BossBattleCron] Failed for user ${profile.userId}:`, error.message);
                }
            }

            logger.info(`[BossBattleCron] Generation complete. Generated: ${generated}, Failed: ${failed}`);

        } catch (error) {
            logger.error('[BossBattleCron] Error in cron job:', error);
        }
    });

    logger.info('[BossBattleCron] Boss battle generator started - runs every 4 hours');
};

const stopBossBattleGenerator = () => {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        logger.info('[BossBattleCron] Boss battle generator stopped');
    }
};

module.exports = {
    startBossBattleGenerator,
    stopBossBattleGenerator
};

// server/jobs/bossBattleCleanup.js
const cron = require('node-cron');
const BossBattle = require('../models/BossBattle');
const { logger } = require('../utils/logger');

/**
 * Cron job to automatically expire and remove old boss battles
 * Runs every 2 hours
 */
function startBossBattleCleanup() {
    // Schedule: Every 2 hours
    // Format: minute hour day month weekday
    cron.schedule('0 */2 * * *', async () => {
        logger.info('[BossBattleCleanup] Starting boss battle cleanup job...');

        try {
            // Mark expired battles as expired
            const expiredCount = await BossBattle.expireOldBattles();
            logger.info(`[BossBattleCleanup] Marked ${expiredCount} boss battles as expired`);

            // Optional: Delete expired battles after they've been expired for more than 24 hours
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const deleteResult = await BossBattle.deleteMany({
                status: 'expired',
                expiresAt: { $lt: oneDayAgo }
            });
            logger.info(`[BossBattleCleanup] Deleted ${deleteResult.deletedCount} old expired boss battles`);

        } catch (error) {
            logger.error('[BossBattleCleanup] Error in boss battle cleanup:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Set to your timezone
    });

    logger.info('[BossBattleCleanup] Cron job scheduled: Every 2 hours');
}

/**
 * Manual trigger for testing or admin use
 */
async function manualCleanup() {
    logger.info('[BossBattleCleanup] Manual cleanup initiated...');

    try {
        // Mark expired battles
        const expiredCount = await BossBattle.expireOldBattles();
        
        // Delete old expired battles
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const deleteResult = await BossBattle.deleteMany({
            status: 'expired',
            expiresAt: { $lt: oneDayAgo }
        });

        const result = {
            markedExpired: expiredCount,
            deleted: deleteResult.deletedCount
        };

        logger.info(`[BossBattleCleanup] Manual cleanup completed:`, result);
        return result;
    } catch (error) {
        logger.error('[BossBattleCleanup] Manual cleanup failed:', error);
        throw error;
    }
}

module.exports = {
    startBossBattleCleanup,
    manualCleanup
};

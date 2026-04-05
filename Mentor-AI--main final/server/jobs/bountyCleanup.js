// server/jobs/bountyCleanup.js
const cron = require('node-cron');
const BountyQuestion = require('../models/BountyQuestion');
const { logger } = require('../utils/logger');

/**
 * Cron job to automatically expire and remove old bounty questions
 * Runs every 2 hours
 */
function startBountyCleanup() {
    // Schedule: Every 2 hours
    // Format: minute hour day month weekday
    cron.schedule('0 */2 * * *', async () => {
        logger.info('[BountyCleanup] Starting bounty cleanup job...');

        try {
            // Mark expired bounties as expired
            const expiredCount = await BountyQuestion.expireOldBounties();
            logger.info(`[BountyCleanup] Marked ${expiredCount} bounties as expired`);

            // Optional: Delete expired bounties after they've been expired for more than 24 hours
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const deleteResult = await BountyQuestion.deleteMany({
                status: 'expired',
                expiresAt: { $lt: oneDayAgo }
            });
            logger.info(`[BountyCleanup] Deleted ${deleteResult.deletedCount} old expired bounties`);

        } catch (error) {
            logger.error('[BountyCleanup] Error in bounty cleanup:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Set to your timezone
    });

    logger.info('[BountyCleanup] Cron job scheduled: Every 2 hours');
}

/**
 * Manual trigger for testing or admin use
 */
async function manualCleanup() {
    logger.info('[BountyCleanup] Manual cleanup initiated...');

    try {
        // Mark expired bounties
        const expiredCount = await BountyQuestion.expireOldBounties();
        
        // Delete old expired bounties
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const deleteResult = await BountyQuestion.deleteMany({
            status: 'expired',
            expiresAt: { $lt: oneDayAgo }
        });

        const result = {
            markedExpired: expiredCount,
            deleted: deleteResult.deletedCount
        };

        logger.info(`[BountyCleanup] Manual cleanup completed:`, result);
        return result;
    } catch (error) {
        logger.error('[BountyCleanup] Manual cleanup failed:', error);
        throw error;
    }
}

module.exports = {
    startBountyCleanup,
    manualCleanup
};

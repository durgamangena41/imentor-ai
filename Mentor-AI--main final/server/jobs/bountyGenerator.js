// server/jobs/bountyGenerator.js
const cron = require('node-cron');
const bountyService = require('../services/bountyService');
const { logger } = require('../utils/logger');

/**
 * Cron job to automatically generate bounty questions
 * Runs daily at 9:00 AM
 */
function startBountyGenerator() {
    // Schedule: Every day at 9:00 AM
    // Format: minute hour day month weekday
    cron.schedule('0 9 * * *', async () => {
        logger.info('[BountyGenerator] Starting daily bounty generation...');

        try {
            const count = await bountyService.generatePeriodicBounties();
            logger.info(`[BountyGenerator] Successfully generated ${count} bounty questions`);
        } catch (error) {
            logger.error('[BountyGenerator] Error in scheduled bounty generation:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Set to your timezone
    });

    logger.info('[BountyGenerator] Cron job scheduled: Daily at 9:00 AM IST');
}

/**
 * Manual trigger for testing or admin use
 */
async function manualTrigger() {
    logger.info('[BountyGenerator] Manual trigger initiated...');

    try {
        const count = await bountyService.generatePeriodicBounties();
        logger.info(`[BountyGenerator] Generated ${count} bounties`);
        return count;
    } catch (error) {
        logger.error('[BountyGenerator] Manual trigger failed:', error);
        throw error;
    }
}

module.exports = {
    startBountyGenerator,
    manualTrigger
};

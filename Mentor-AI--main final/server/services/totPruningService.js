// server/services/totPruningService.js
const { logger } = require('../utils/logger');

/**
 * Service to handle pruning of Tree of Thoughts branches.
 */
const totPruningService = {
    /**
     * Determines if a reasoning branch should be pruned based on its latest step result.
     * @param {Object} stepResult - The result of the latest step (including confidence).
     * @param {number} stepIndex - The current step index in the plan.
     * @param {number} totalSteps - Total number of steps in the plan.
     * @returns {boolean} - True if the branch should be pruned.
     */
    shouldPruneBranch(stepResult, stepIndex, totalSteps) {
        if (!stepResult) return false;

        const confidence = stepResult.confidence_score || 0.5;

        // --- PRUNING LOGIC ---
        // 1. Critical Failure: If confidence is extremely low early on.
        if (stepIndex < 2 && confidence < 0.3) {
            logger.info(`[ToT Pruning] Pruning branch due to critical low confidence (${confidence}) at step ${stepIndex + 1}.`);
            return true;
        }

        // 2. Diminishing Returns: If confidence is consistently mediocre.
        if (stepIndex >= 2 && confidence < 0.5) {
            logger.info(`[ToT Pruning] Pruning branch due to sustained low performance (${confidence}) at step ${stepIndex + 1}.`);
            return true;
        }

        return false;
    },

    /**
     * Recommends the number of reasoning branches to generate based on query complexity.
     * @param {number} complexityScore - A score between 0 and 100 representing query complexity.
     * @returns {number} - Recommended number of branches (2-3).
     */
    getRecommendedBranchCount(complexityScore) {
        // user requirement: 2-3 branches
        if (complexityScore > 80) return 3;
        return 2;
    },

    /**
     * Evaluates if the current state of collected context is sufficient to reach a final answer.
     * @param {string} cumulativeContext - All gathered information so far.
     * @param {string} originalQuery - The user's original request.
     * @returns {boolean} - True if we can stop early.
     */
    isSufficientForEarlyExit(cumulativeContext, originalQuery) {
        // This could be enhanced with an LLM call, but for speed, we use heuristics or direct confidence checks.
        // For now, we rely on the specific step confidence in totOrchestrator.
        return false;
    }
};

module.exports = totPruningService;

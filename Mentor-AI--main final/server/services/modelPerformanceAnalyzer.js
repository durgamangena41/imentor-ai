// server/services/modelPerformanceAnalyzer.js
const LLMPerformanceLog = require('../models/LLMPerformanceLog');

/**
 * Service to analyze performance logs and provide model routing recommendations.
 */
const modelPerformanceAnalyzer = {
    /**
     * Cache for results to keep routing fast.
     * key: category, value: sorted array of high-performing models
     */
    recommendationCache: new Map(),
    lastAnalysisTime: null,
    CACHE_DURATION: 3600000, // 1 hour

    /**
     * Gets the best performing model for a specific category.
     * @param {string} category - The query category from classifier.
     * @returns {Promise<string|null>} - Recommended modelId or null.
     */
    async getBestModelForCategory(category) {
        // Refreash cache if needed
        if (!this.lastAnalysisTime || (Date.now() - this.lastAnalysisTime > this.CACHE_DURATION)) {
            await this.refreshAnalysis();
        }

        const recommendations = this.recommendationCache.get(category);
        if (recommendations && recommendations.length > 0) {
            // Return the top performer
            return recommendations[0].modelId;
        }
        return null;
    },

    /**
     * Refreshes the performance analysis by querying LLMPerformanceLog.
     */
    async refreshAnalysis() {
        console.log('[ModelAnalyzer] Refreshing model performance analysis...');
        const categories = ['technical', 'code', 'creative', 'multilingual', 'research', 'general'];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        for (const cat of categories) {
            try {
                // Aggregation to find success rates per model in this category
                const stats = await LLMPerformanceLog.aggregate([
                    { $match: { queryCategory: cat, createdAt: { $gte: thirtyDaysAgo } } },
                    {
                        $group: {
                            _id: "$chosenModelId",
                            successCount: {
                                $sum: { $cond: [{ $eq: ["$userFeedback", "positive"] }, 1, 0] }
                            },
                            failureCount: {
                                $sum: { $cond: [{ $eq: ["$userFeedback", "negative"] }, 1, 0] }
                            },
                            total: { $sum: 1 },
                            avgLatency: { $avg: "$responseTimeMs" }
                        }
                    },
                    {
                        $project: {
                            modelId: "$_id",
                            successRate: { $divide: ["$successCount", { $add: ["$total", 0.01] }] }, // Avoid div by zero
                            weightedScore: {
                                $subtract: [
                                    { $divide: ["$successCount", { $add: ["$total", 1] }] },
                                    { $divide: ["$failureCount", { $add: ["$total", 1] }] }
                                ]
                            }
                        }
                    },
                    { $sort: { weightedScore: -1 } }
                ]);

                this.recommendationCache.set(cat, stats);
            } catch (err) {
                console.error(`[ModelAnalyzer] Error analyzing category ${cat}:`, err);
            }
        }

        this.lastAnalysisTime = Date.now();
    }
};

module.exports = modelPerformanceAnalyzer;

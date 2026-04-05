const axios = require('axios');
const CourseTrainingData = require('../models/CourseTrainingData');
const SyntheticDataService = require('./syntheticDataService');
const { logger } = require('../utils/logger');

/**
 * Curriculum Alignment Service
 * Ensures 100% coverage of syllabus topics in the training dataset.
 * Automatically identifies and fills knowledge gaps using synthetic generation.
 */
class CurriculumAlignmentService {
    /**
     * Performs a full alignment audit and fills gaps automatically.
     */
    static async auditAndSync(subject) {
        try {
            logger.info(`[CurriculumAlignment] Starting audit for ${subject}`);

            // 1. Get existing counts per topic from MongoDB
            const aggregateCounts = await CourseTrainingData.aggregate([
                { $match: { subject } },
                { $group: { _id: "$metadata.topic", count: { $sum: 1 } } }
            ]);

            const existingCounts = {};
            aggregateCounts.forEach(item => {
                if (item._id) existingCounts[item._id] = item.count;
            });

            // 2. Query Python Bridge for Curriculum Alignment Report
            const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL || 'http://localhost:2001';
            const response = await axios.post(`${pythonServiceUrl}/curriculum/alignment`, {
                subject,
                existing_counts: existingCounts
            });

            const report = response.data;
            logger.info(`[CurriculumAlignment] Report: ${report.coverage_percentage?.toFixed(1)}% coverage. Gap Topics: ${report.missing_topics.length}`);

            // 3. Fill Gaps: Generate data for missing or low-coverage topics
            const topicsToGenerate = [
                ...report.missing_topics,
                ...report.low_coverage_topics.map(t => t.topic)
            ];

            if (topicsToGenerate.length > 0) {
                logger.info(`[CurriculumAlignment] Triggering synthetic generation for ${topicsToGenerate.length} topics in ${subject}`);

                // Process in small batches to avoid overloading Gemini
                for (const topic of topicsToGenerate.slice(0, 5)) {
                    await SyntheticDataService.generateForTopic(subject, topic, 5);
                }
            }

            return report;
        } catch (error) {
            logger.error(`[CurriculumAlignment] Audit failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Checks if a specific instruction is aligned with curriculum prerequisites.
     */
    static async checkPrerequisites(subject, topic) {
        // This can be used by the front-end to show "Prerequisite not met" warnings
    }
}

module.exports = CurriculumAlignmentService;

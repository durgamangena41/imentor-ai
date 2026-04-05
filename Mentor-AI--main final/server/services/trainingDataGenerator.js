// server/services/trainingDataGenerator.js
const axios = require('axios');
const CourseTrainingData = require('../models/CourseTrainingData');
const { getSubjectContent } = require('./courseDataExtractor');
const { logger } = require('../utils/logger');

/**
 * Orchestrates synthetic training data generation for a specific subject.
 */
async function generateSyntheticDataForSubject(subject) {
    try {
        console.log(`[TrainingDataGenerator] Starting pipeline for ${subject}`);

        // 1. Get raw text content
        const content = await getSubjectContent(subject);
        if (!content) throw new Error(`No content available for ${subject}`);

        // 2. Call Python Service for Q&A Generation
        const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL || 'http://localhost:2001';
        const response = await axios.post(`${pythonServiceUrl}/generate_qa`, {
            text: content
        });

        const qaPairs = response.data.qa_pairs;
        console.log(`[TrainingDataGenerator] Received ${qaPairs.length} Q&A pairs from Python.`);

        // 3. Save to MongoDB
        const savePromises = qaPairs.map(pair => {
            return CourseTrainingData.create({
                subject,
                instruction: pair.instruction,
                output: pair.output,
                source: 'synthetic',
                metadata: {
                    difficulty: pair.difficulty || 'medium',
                    taxonomy: pair.taxonomy || [],
                }
            });
        });

        await Promise.all(savePromises);
        console.log(`[TrainingDataGenerator] Successfully saved training data for ${subject}`);

        return {
            success: true,
            count: qaPairs.length
        };

    } catch (error) {
        console.error(`[TrainingDataGenerator] Pipeline failed: ${error.message}`);
        throw error;
    }
}

module.exports = {
    generateSyntheticDataForSubject
};

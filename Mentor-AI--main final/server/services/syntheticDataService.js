const { GoogleGenerativeAI } = require("@google/generative-ai");
const CourseTrainingData = require('../models/CourseTrainingData');
const { getSubjectContent } = require('./courseDataExtractor');
const axios = require('axios');
const { logger } = require('../utils/logger');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Synthetic Data Service
 * Leverages Frontier Models (Gemini) to generate high-quality curriculum-aligned training data.
 */
class SyntheticDataService {
    /**
     * Generates a batch of high-quality Q&A pairs from subject text.
     */
    static async generateFromText(subject, limit = 20) {
        try {
            const content = await getSubjectContent(subject);
            if (!content) throw new Error(`No content found for subject: ${subject}`);

            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

            const prompt = `
                You are an expert curriculum designer and AI trainer. 
                Below is the content for the subject "${subject}". 
                Your task is to generate ${limit} high-quality instructional training pairs (Instruction and Output).
                
                Requirements:
                1. Focus on core concepts and potential student misconceptions.
                2. Instructions should be varied (direct questions, "explain like I'm 5", problem-solving tasks).
                3. Outputs must be factually accurate, structured with clear steps, and pedagogical.
                4. Include metadata for each pair: "difficulty" (beginner, intermediate, advanced) and "topic" (sub-topic from the text).
                5. Create at least 3 "edge case" scenarios where a student might be confused.

                Return the response STRICTLY as a JSON array of objects:
                [
                  { "instruction": "...", "output": "...", "metadata": { "difficulty": "...", "topic": "...", "isEdgeCase": true/false } },
                  ...
                ]

                CONTENT:
                ${content.substring(0, 15000)} // Truncate safely
            `;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            // Extract JSON from markdown if wrapped
            const jsonStr = responseText.replace(/```json|```/g, '').trim();
            const data = JSON.parse(jsonStr);

            const saved = await this.saveToRegistry(subject, data);

            // Trigger Python Augmentation for Paraphrasing
            this.triggerAugmentation(saved.map(d => d._id));

            return saved;
        } catch (error) {
            logger.error(`[SyntheticDataService] Generation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Target identification: Generates specific Q&A for a syllabus topic.
     */
    static async generateForTopic(subject, topic, limit = 5) {
        try {
            const content = await getSubjectContent(subject);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

            const prompt = `
                You are an expert AI trainer. Focus ONLY on the topic: "${topic}" within the subject "${subject}".
                Generate ${limit} advanced instructional pairs.
                
                CONTENT for reference:
                ${content ? content.substring(0, 5000) : "Use your general knowledge if specific text is unavailable."}

                Requirements:
                - Create complex problem sets.
                - Include 1 prerequisite check question (e.g., "Before we solve X, do you know Y?").
                - Tag metadata: { "topic": "${topic}", "difficulty": "advanced" }

                Return life a JSON array.
            `;

            const result = await model.generateContent(prompt);
            const jsonStr = result.response.text().replace(/```json|```/g, '').trim();
            const data = JSON.parse(jsonStr);

            return await this.saveToRegistry(subject, data);
        } catch (error) {
            logger.error(`[SyntheticDataService] Topic-specific generation failed: ${error.message}`);
            return [];
        }
    }

    static async saveToRegistry(subject, data) {
        const promises = data.map(item => CourseTrainingData.create({
            subject,
            instruction: item.instruction,
            output: item.output,
            source: 'gemini-synthetic',
            metadata: {
                ...item.metadata,
                generatedAt: new Date()
            }
        }));
        return Promise.all(promises);
    }

    static async triggerAugmentation(dataIds) {
        const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL || 'http://localhost:2001';
        try {
            const records = await CourseTrainingData.find({ _id: { $in: dataIds } }).lean();
            const response = await axios.post(`${pythonServiceUrl}/augment_data`, {
                data: records.map(r => ({ instruction: r.instruction, output: r.output, subject: r.subject, difficulty: r.metadata.difficulty }))
            });

            if (response.data.augmented_data) {
                const augmented = response.data.augmented_data;
                await CourseTrainingData.insertMany(augmented.map(item => ({
                    subject: item.subject,
                    instruction: item.instruction,
                    output: item.output,
                    source: 'python-augmented',
                    metadata: {
                        difficulty: item.difficulty,
                        isAugmented: true,
                        generatedAt: new Date()
                    }
                })));
                logger.info(`[SyntheticDataService] Successfully saved ${augmented.length} augmented variations.`);
            }
        } catch (err) {
            logger.warn(`[SyntheticDataService] Augmentation pipeline failed/skipped: ${err.message}`);
        }
    }
}

module.exports = SyntheticDataService;

// server/services/courseDataExtractor.js
const AdminDocument = require('../models/AdminDocument');
const { logger } = require('../utils/logger');

/**
 * Extracts and aggregates text from all documents associated with a specific subject.
 */
async function getSubjectContent(subject) {
    try {
        console.log(`[CourseDataExtractor] Fetching documents for subject: ${subject}`);
        const documents = await AdminDocument.find({ subject });

        if (documents.length === 0) {
            console.warn(`[CourseDataExtractor] No documents found for subject: ${subject}`);
            return "";
        }

        const combinedText = documents
            .map(doc => `--- Document: ${doc.originalName} ---\n${doc.text}`)
            .join('\n\n');

        console.log(`[CourseDataExtractor] Extracted ${combinedText.length} characters from ${documents.length} documents.`);
        return combinedText;
    } catch (error) {
        console.error(`[CourseDataExtractor] Error: ${error.message}`);
        throw error;
    }
}

module.exports = {
    getSubjectContent
};

// server/services/contextManager.js
const geminiService = require('./geminiService');
const { logger } = require('../utils/logger');

const MAX_HISTORY_MESSAGES = 10; // Keep the last 10 messages raw
const SUMMARY_THRESHOLD = 15;   // Summarize if history exceeds 15 messages

/**
 * Manages the conversation context window to prevent token overflow.
 */
const contextManager = {
    /**
     * Prunes or summarizes chat history if it exceeds limits.
     * @param {Array} chatHistory - The full chat history array.
     * @param {object} options - Options for summarization.
     * @returns {Promise<Array>} - The processed history array.
     */
    async manageContext(chatHistory, options = {}) {
        if (!chatHistory || chatHistory.length <= SUMMARY_THRESHOLD) {
            return chatHistory;
        }

        logger.info(`[ContextManager] History size (${chatHistory.length}) exceeds threshold. Pruning...`);

        // Split history into "old" and "recent"
        const recentHistory = chatHistory.slice(-MAX_HISTORY_MESSAGES);
        const olderHistory = chatHistory.slice(0, chatHistory.length - MAX_HISTORY_MESSAGES);

        try {
            // Generate a summary of the older history
            const summary = await this.generateSummary(olderHistory, options);

            // Build the new history: [system_summary, ...recent_messages]
            return [
                {
                    role: 'user',
                    parts: [{ text: `[CONTEXT SUMMARY OF PREVIOUS TURNS]: ${summary}` }]
                },
                {
                    role: 'model',
                    parts: [{ text: "Understood. I have cached the previous context. How can I help you further?" }]
                },
                ...recentHistory
            ];
        } catch (error) {
            logger.error(`[ContextManager] Summarization failed: ${error.message}. Falling back to basic pruning.`);
            // Fallback: Just return the recent messages
            return recentHistory;
        }
    },

    /**
     * Uses LLM to create a concise summary of past interactions.
     */
    async generateSummary(history, options) {
        const historyText = history
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.parts[0].text}`)
            .join('\n');

        const prompt = `Summarize the following conversation history into a single, highly dense paragraph. 
Focus only on key facts, user preferences, and the current goal. 
Ignore greetings or repetitive small talk.

HISTORY:
${historyText}

SUMMARY:`;

        const { llmProvider = 'gemini', ...llmOptions } = options;
        // Always use a fast model for summarization
        const summaryResponse = await geminiService.generateContentWithHistory(
            [],
            prompt,
            "You are a context compression engine.",
            { ...llmOptions, modelId: 'gemini-1.5-flash' }
        );

        return summaryResponse.trim();
    }
};

module.exports = contextManager;

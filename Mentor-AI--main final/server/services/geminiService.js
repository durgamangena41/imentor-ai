// server/services/geminiService.js
// REFACTORED to use @google/generative-ai (Official Node.js SDK) correctly
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { runWithGeminiKeyRotation } = require('./geminiKeyRotationService');

const GEMINI_MODEL = "gemini-2.0-flash";
const FALLBACK_API_KEY = process.env.GEMINI_API_KEY;
// Default Gemini model used across the app.
const MODEL_NAME = process.env.GEMINI_MODEL || process.env.GEMINI_MODEL_NAME || GEMINI_MODEL;

const DEFAULT_MAX_OUTPUT_TOKENS_CHAT = 8192;
const DEFAULT_MAX_OUTPUT_TOKENS_KG = 8192;

const baseSafetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

async function generateContentWithHistory(
    chatHistory,
    currentUserQuery,
    systemPromptText = null,
    options = {}
) {
    const apiKeyToUse = options.apiKey || FALLBACK_API_KEY;

    if (!apiKeyToUse && !options.apiKey) {
        console.error("FATAL ERROR: Gemini API key is not available.");
        throw new Error("Gemini API key is missing.");
    }

    try {
        if (typeof currentUserQuery !== 'string' || currentUserQuery.trim() === '') {
            throw new Error("currentUserQuery must be a non-empty string.");
        }

        // Map Chat History to @google/generative-ai format
        // { role: 'user' | 'model', parts: [{ text: '...' }] }
        const contents = (chatHistory || [])
            .map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.text || '' }]
            }))
            .filter(msg => msg.parts.length > 0 && msg.parts[0].text);

        // Add current query
        contents.push({
            role: 'user',
            parts: [{ text: currentUserQuery }]
        });

        const modelToUse = options.model || MODEL_NAME;
        console.log(`Sending to ${modelToUse}. Turns: ${contents.length}.`);

        const generationConfig = {
            temperature: 0.7,
            maxOutputTokens: options.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS_CHAT,
        };

        const executeRequest = async (activeApiKey) => {
            const genAI = new GoogleGenerativeAI(activeApiKey);
            const model = genAI.getGenerativeModel({
                model: modelToUse,
                systemInstruction: systemPromptText ? { parts: [{ text: systemPromptText }] } : undefined,
                safetySettings: baseSafetySettings
            });

            return model.generateContent({
                contents,
                generationConfig
            });
        };

        const result = options.apiKey
            ? await executeRequest(apiKeyToUse)
            : await runWithGeminiKeyRotation(executeRequest);

        const response = await result.response;
        const text = response.text();

        if (!text) {
            console.warn("Gemini returned empty text. Candidates:", JSON.stringify(response.candidates, null, 2));
            if (response.promptFeedback) {
                console.warn("Prompt Feedback:", JSON.stringify(response.promptFeedback, null, 2));
            }
            throw new Error("No text returned from AI service (possibly blocked by safety settings).");
        }

        return text;

    } catch (error) {
        console.error("Gemini API Call Error:", error?.message || error);

        let clientMessage = "AI Service Error: " + (error.message || "Unknown error");
        if (error.message?.includes("404") || error.message?.includes("not found")) clientMessage = `Model not found.`;
        if (error.status === 503) clientMessage = "AI Service Overloaded.";

        // --- QUOTA FAILOVER FIX ---
        // Specifically flag 429 (Too Many Requests) for the router to handle failover
        const lowerMessage = String(error?.message || '').toLowerCase();
        const isQuotaError = error.status === 429
            || lowerMessage.includes('429')
            || lowerMessage.includes('quota')
            || lowerMessage.includes('all gemini keys are currently unavailable')
            || lowerMessage.includes('all gemini keys are currently at rpm limit')
            || lowerMessage.includes('all gemini keys reached daily limit');

        const enhancedError = new Error(clientMessage);
        enhancedError.status = error.status || 500;
        if (isQuotaError) enhancedError.isQuotaExceeded = true;

        throw enhancedError;
    }
}

/**
 * Generates an embedding for a text string.
 */
async function generateEmbedding(text, apiKey = null) {
    const key = apiKey || FALLBACK_API_KEY;
    if (!key) throw new Error("Gemini API key is missing for embeddings.");

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error("Gemini Embedding Error:", error.message);
        return null;
    }
}

/**
 * Fetch and log available models using the Google GenAI SDK.
 */
async function fetchAvailableModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    // Listing models is less direct/useful in this SDK version for typical use cases, 
    // often requires manual HTTP call or specific permission scopes.
    // logging a placeholder.
    console.log("Model listing via SDK skipped (using explicit model name).");
}

module.exports = {
    GEMINI_MODEL,
    generateContentWithHistory,
    DEFAULT_MAX_OUTPUT_TOKENS_KG,
    fetchAvailableModels,
    generateEmbedding
};
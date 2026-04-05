// server/services/geminiService.js
// REFACTORED to use @google/generative-ai (Official Node.js SDK) correctly
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const FALLBACK_API_KEY = process.env.GEMINI_API_KEY;
// Defaults to gemini-1.5-flash as it is more stable/common than 'gemini-flash-latest' which may vary
const MODEL_NAME = process.env.GEMINI_MODEL_NAME || "gemini-flash-latest";

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

    if (!apiKeyToUse) {
        console.error("FATAL ERROR: Gemini API key is not available.");
        throw new Error("Gemini API key is missing.");
    }

    try {
        // Initialize @google/generative-ai SDK
        const genAI = new GoogleGenerativeAI(apiKeyToUse);

        // Get the model
        const modelToUse = options.model || MODEL_NAME;
        const model = genAI.getGenerativeModel({
            model: modelToUse,
            systemInstruction: systemPromptText ? { parts: [{ text: systemPromptText }] } : undefined,
            safetySettings: baseSafetySettings
        });

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

        console.log(`Sending to ${MODEL_NAME}. Turns: ${contents.length}.`);

        // Generate content
        const generationConfig = {
            temperature: 0.7,
            maxOutputTokens: options.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS_CHAT,
        };

        const result = await model.generateContent({
            contents,
            generationConfig
        });

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
        if (error.message?.includes("404") || error.message?.includes("not found")) clientMessage = `Model ${MODEL_NAME} not found.`;
        if (error.status === 503) clientMessage = "AI Service Overloaded.";

        // --- QUOTA FAILOVER FIX ---
        // Specifically flag 429 (Too Many Requests) for the router to handle failover
        const isQuotaError = error.status === 429 || error.message?.includes("429") || error.message?.includes("quota");

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
    generateContentWithHistory,
    DEFAULT_MAX_OUTPUT_TOKENS_KG,
    fetchAvailableModels,
    generateEmbedding
};
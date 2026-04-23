// server/services/ollamaService.js
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SERVER_DEFAULT_OLLAMA_URL = process.env.OLLAMA_API_BASE_URL || 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:3b-instruct';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 30000);

const DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_CHAT = 8192;
const DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_KG = 8192;

// This function formats history for the /api/chat endpoint
function formatHistoryForOllamaChat(chatHistory) {
    return chatHistory.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.parts?.[0]?.text || ''
    }));
}

async function getInstalledOllamaModels(baseUrl, headers) {
    try {
        const response = await axios.get(`${baseUrl}/api/tags`, { headers, timeout: 15000 });
        return Array.isArray(response.data?.models)
            ? response.data.models.map((m) => m?.name).filter(Boolean)
            : [];
    } catch {
        return [];
    }
}

// async function generateContentWithHistory(
//     chatHistory,
//     currentUserQuery,
//     systemPromptText = null,
//     options = {}
// ) {
//     const baseUrlToUse = options.ollamaUrl || SERVER_DEFAULT_OLLAMA_URL;
//     const modelToUse = options.model || DEFAULT_OLLAMA_MODEL;
//     const effectiveMaxOutputTokens = options.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_CHAT;

//     const headers = { 'Content-Type': 'application/json' };
//     if (options.apiKey) {
//         headers['Authorization'] = `Bearer ${options.apiKey}`;
//     }

//     // --- THIS IS THE FIX ---
//     // Decide which endpoint to use based on whether there's a real history.
//     // Our Router call sends an empty history, so it will use /api/generate.
//     // Real chat calls will have history and use /api/chat.
//     let endpoint;
//     let requestPayload;

//     if (!chatHistory || chatHistory.length === 0) {
//         // Use /api/generate for one-shot requests like the Router agent
//         endpoint = `${baseUrlToUse}/api/generate`;
//         console.log(`Ollama Service: Using /api/generate endpoint for one-shot request.`);
//         requestPayload = {
//             model: modelToUse,
//             prompt: currentUserQuery, // The user query is the full prompt
//             system: systemPromptText || "You are a helpful AI assistant.",
//             stream: false,
//             options: {
//                 temperature: options.temperature || 0.7,
//                 num_predict: effectiveMaxOutputTokens,
//             }
//         };
//     } else {
//         // Use /api/chat for actual conversations with history
//         endpoint = `${baseUrlToUse}/api/chat`;
//         console.log(`Ollama Service: Using /api/chat endpoint for conversation with history.`);
//         const messages = formatHistoryForOllamaChat(chatHistory);
//         messages.push({ role: 'user', content: currentUserQuery }); // Add the current query

//         requestPayload = {
//             model: modelToUse,
//             messages: messages,
//             stream: false,
//             options: {
//                 temperature: options.temperature || 0.7,
//                 // num_predict is often not needed for /chat, but can be included
//             }
//         };
//         // For /chat, the system prompt is part of the messages array if needed
//         if (systemPromptText) {
//              messages.unshift({ role: 'system', content: systemPromptText });
//         }
//     }
//     // --- END OF FIX ---

//     // console.log(`Ollama Service: Sending request to ${endpoint} for model ${modelToUse}.`);

//     // console.log("\n==================== START OLLAMA FINAL INPUT ====================");
//     // console.log(`--- Endpoint: ${endpoint} ---`);
//     // console.log("--- Request Payload Sent to Model ---");
//     // console.log(JSON.stringify(requestPayload, null, 2));
//     // console.log("==================== END OLLAMA FINAL INPUT ====================\n");


//     try {
//         const response = await axios.post(endpoint, requestPayload, { 
//             headers,
//             timeout: 500000 
//         });

//         // Handle different response structures from /generate and /chat
//         let responseText = '';
//         if (response.data && response.data.response) { // from /api/generate
//             responseText = response.data.response;
//         } else if (response.data && response.data.message && response.data.message.content) { // from /api/chat
//             responseText = response.data.message.content;
//         } else {
//             throw new Error("Ollama service returned an invalid or unrecognized response structure.");
//         }

//         return responseText.trim();

//     } catch (error) {
//         console.error("Ollama API Call Error:", error.message);
//         const clientMessage = error.response?.data?.error || "Failed to get response from Ollama service.";
//         const enhancedError = new Error(clientMessage);
//         enhancedError.status = error.response?.status || 503;
//         throw enhancedError;
//     }
// }


async function generateContentWithHistory(
    chatHistory,
    currentUserQuery,
    systemPromptText = null,
    options = {}
) {
    const baseUrlToUse = options.ollamaUrl || SERVER_DEFAULT_OLLAMA_URL;
    const modelToUse = options.model || DEFAULT_OLLAMA_MODEL;
    const timeoutMs = Number(options.timeoutMs || OLLAMA_TIMEOUT_MS);

    const headers = { 'Content-Type': 'application/json' };
    if (options.apiKey) {
        headers['Authorization'] = `Bearer ${options.apiKey}`;
    }

    // Always use the /api/chat endpoint for consistency and flexibility.
    const endpoint = `${baseUrlToUse}/api/chat`;
    console.log(`Ollama Service: Using unified /api/chat endpoint for model ${modelToUse}.`);

    // Construct the messages array for the /api/chat payload.
    const messages = [];
    if (systemPromptText) {
        messages.push({ role: 'system', content: systemPromptText });
    }
    if (chatHistory && chatHistory.length > 0) {
        messages.push(...formatHistoryForOllamaChat(chatHistory));
    }
    messages.push({ role: 'user', content: currentUserQuery });

    const buildPayload = (model) => ({
        model,
        messages,
        stream: false,
        options: {
            temperature: options.temperature || 0.8,
            top_p: 0.95,
            top_k: 40,
            num_predict: options.numPredict || 2048,  // Force model to generate up to 2048 tokens for long responses
            repeat_penalty: 1.1,
        }
    });

    try {
        const response = await axios.post(endpoint, buildPayload(modelToUse), {
            headers,
            timeout: timeoutMs
        });

        // The /api/chat endpoint has a consistent response structure.
        if (response.data && response.data.message && response.data.message.content) {
            return response.data.message.content.trim();
        } else {
            throw new Error("Ollama service returned an invalid or unrecognized response structure from /api/chat.");
        }

    } catch (error) {
        const clientMessage = error.response?.data?.error || error.message || "Failed to get response from Ollama service.";
        const isModelMissing = Number(error.response?.status || 0) === 404
            && String(clientMessage).toLowerCase().includes('model')
            && String(clientMessage).toLowerCase().includes('not found');

        if (isModelMissing) {
            const installedModels = await getInstalledOllamaModels(baseUrlToUse, headers);
            const retryModel = installedModels.find((name) => name !== modelToUse);

            if (retryModel) {
                console.warn(`Ollama Service: Model ${modelToUse} not found. Retrying with installed model ${retryModel}.`);
                const retryResponse = await axios.post(endpoint, buildPayload(retryModel), {
                    headers,
                    timeout: timeoutMs
                });

                if (retryResponse.data && retryResponse.data.message && retryResponse.data.message.content) {
                    return retryResponse.data.message.content.trim();
                }
            }
        }

        console.error("Ollama API Call Error:", error.message);
        const enhancedError = new Error(clientMessage);
        enhancedError.status = error.response?.status || 503;
        throw enhancedError;
    }
}


module.exports = {
    generateContentWithHistory,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_CHAT,
    DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_KG,
};

// server/services/openaiService.js
const axios = require('axios');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_OPENAI_MODEL = "gpt-4o";

/**
 * Generates content using OpenAI's API.
 */
async function generateContentWithHistory(chatHistory, currentUserQuery, systemPromptText = null, options = {}) {
    if (!OPENAI_API_KEY) {
        throw new Error("OpenAI API key is missing in .env.");
    }

    const modelToUse = options.model || DEFAULT_OPENAI_MODEL;

    const messages = [];
    if (systemPromptText) {
        messages.push({ role: 'system', content: systemPromptText });
    }

    const history = (chatHistory || []).map(msg => ({
        role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.parts?.[0]?.text || msg.text || ''
    }));

    messages.push(...history);
    messages.push({ role: 'user', content: currentUserQuery });

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: modelToUse,
            messages: messages,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxOutputTokens || 4096
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.choices && response.data.choices[0]) {
            return response.data.choices[0].message.content;
        } else {
            throw new Error("Invalid response structure from OpenAI API.");
        }
    } catch (error) {
        console.error("OpenAI API Error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.error?.message || "Failed to communicate with OpenAI service.");
    }
}

module.exports = { generateContentWithHistory };

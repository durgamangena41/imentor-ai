// server/services/claudeService.js
const axios = require('axios');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-latest";

/**
 * Generates content using Anthropic's Claude API.
 */
async function generateContentWithHistory(chatHistory, currentUserQuery, systemPromptText = null, options = {}) {
    if (!CLAUDE_API_KEY) {
        throw new Error("Anthropic API key is missing in .env.");
    }

    const modelToUse = options.model || DEFAULT_CLAUDE_MODEL;

    // Convert history to Claude messages format
    const messages = (chatHistory || []).map(msg => ({
        role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.parts?.[0]?.text || msg.text || ''
    }));

    messages.push({ role: 'user', content: currentUserQuery });

    try {
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
            model: modelToUse,
            max_tokens: options.maxOutputTokens || 4096,
            system: systemPromptText || undefined,
            messages: messages,
            temperature: options.temperature || 0.7
        }, {
            headers: {
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            }
        });

        if (response.data && response.data.content && response.data.content[0]) {
            return response.data.content[0].text;
        } else {
            throw new Error("Invalid response structure from Claude API.");
        }
    } catch (error) {
        console.error("Claude API Error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.error?.message || "Failed to communicate with Claude service.");
    }
}

module.exports = { generateContentWithHistory };

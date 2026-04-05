// server/scripts/test_llm_expansion.js
require('dotenv').config();
const { selectLLM } = require('../services/llmRouterService');
const claudeService = require('../services/claudeService');
const mistralService = require('../services/mistralService');
const openaiService = require('../services/openaiService');
const mongoose = require('mongoose');

async function runTests() {
    console.log('--- Phase 1: Service connectivity Tests ---');

    const services = [
        { name: 'Claude', service: claudeService, model: 'claude-3-5-sonnet-latest' },
        { name: 'OpenAI', service: openaiService, model: 'gpt-4o' },
        { name: 'Mistral', service: mistralService, model: 'mistral-large-latest' }
    ];

    for (const s of services) {
        try {
            console.log(`Testing ${s.name} (${s.model})...`);
            const response = await s.service.generateContentWithHistory([], "Hello, say 'Ready'", null, { model: s.model });
            console.log(`[PASS] ${s.name} responded: ${response}`);
        } catch (err) {
            console.log(`[FAIL] ${s.name} connectivity failed: ${err.message}`);
        }
    }

    console.log('\n--- Phase 2: Router Fallback Chain Verification ---');
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/imentor');

        // Mocking a context that would trigger a complex provider
        const context = { user: { preferredLlmProvider: 'claude' } };
        const result = await selectLLM("Solve a complex math problem", context);

        console.log('Router Choice:', result.chosenModel.modelId);
        console.log('Fallback Chain:', result.fallbacks);

        if (result.fallbacks && result.fallbacks.length > 0) {
            console.log('[PASS] Router returned fallback chain.');
            const hasGemini = result.fallbacks.some(f => f.provider === 'gemini');
            const hasOllama = result.fallbacks.some(f => f.provider === 'ollama');
            console.log(`Fallback diversity: Gemini: ${hasGemini}, Ollama: ${hasOllama}`);
            if (hasGemini && hasOllama) console.log('[PASS] Fallback chain has multi-provider diversity.');
        } else {
            console.log('[FAIL] Fallback chain missing.');
        }

    } catch (err) {
        console.error('Verification error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runTests();

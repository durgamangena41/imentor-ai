// server/services/llmRouterService.js
const LLMConfiguration = require('../models/LLMConfiguration');
const { checkOllamaHealth } = require('./ollamaHealthService');
const queryClassifierService = require('./queryClassifierService');
const modelPerformanceAnalyzer = require('./modelPerformanceAnalyzer');

const routingCacheService = require('./routingCacheService');

/**
 * Intelligently selects the best LLM for a given query and context.
 */
async function selectLLM(query, context) {
  // 1. Check Cache (Target: < 5ms)
  const cachedDecision = await routingCacheService.get(query, context);
  if (cachedDecision) return cachedDecision;

  const { subject, user } = context;
  let preferredProvider = user?.preferredLlmProvider || 'gemini';

  // 2. Perform Analysis (Category + Complexity)
  const analysis = queryClassifierService.analyze(query);
  const { category, complexity } = analysis;
  console.log(`[LLMRouter] Analysis: ${category} | Complexity: ${complexity}`);

  // 3. Health Check for Ollama
  if (preferredProvider === 'ollama') {
    const isOllamaUp = await checkOllamaHealth(user?.ollamaUrl || process.env.OLLAMA_API_BASE_URL);
    if (!isOllamaUp) {
      console.warn('[LLMRouter] Ollama unreachable, falling back to Gemini.');
      preferredProvider = 'gemini';
    }
  }

  const baseFilter = { provider: preferredProvider };
  let decision = null;

  // PRIORITY 1: Subject-Specific Fine-Tuned Model
  if (subject) {
    const fineTunedModel = await LLMConfiguration.findOne({ provider: 'fine-tuned', subjectFocus: subject });
    if (fineTunedModel) {
      decision = { chosenModel: fineTunedModel, logic: 'subject_match_finetuned', queryCategory: category, isABTest: false };
    }
  }

  if (!decision) {
    // PRIORITY 2: Intelligent Routing (Complexity-Aware)
    // Map complexity to tiers
    const tieredModels = await LLMConfiguration.find({
      ...baseFilter,
      strengths: category === 'general' ? { $exists: true } : category
    });

    if (tieredModels.length > 0) {
      // Filter by complexity tiers: High -> Pro/Opus, Medium -> Sonnet/Flash, Low -> Flash/Ollama
      let filtered = tieredModels;
      if (complexity === 'high') {
        filtered = tieredModels.filter(m => /pro|opus|large|4o/i.test(m.modelId));
      } else if (complexity === 'low') {
        filtered = tieredModels.filter(m => /flash|mini|sonnet|small|qwen|phi/i.test(m.modelId));
      }

      if (filtered.length > 0) {
        // Load Balancing: Weighted random selection
        const selected = filtered[Math.floor(Math.random() * filtered.length)];
        decision = {
          chosenModel: selected,
          logic: `intelligent_${category}_${complexity}`,
          queryCategory: category,
          isABTest: false,
          fallbacks: await getFallbackModels(selected, category)
        };
      }
    }
  }

  // PRIORITY 3: Performance Analyzer Fallback (MAB)
  if (!decision) {
    const bestModelId = await modelPerformanceAnalyzer.getBestModelForCategory(category);
    if (bestModelId) {
      const recommendedModel = await LLMConfiguration.findOne({ ...baseFilter, modelId: bestModelId });
      if (recommendedModel) {
        decision = {
          chosenModel: recommendedModel,
          logic: `intelligent_mab_${category}`,
          queryCategory: category,
          isABTest: false,
          fallbacks: await getFallbackModels(recommendedModel, category)
        };
      }
    }
  }

  // PRIORITY 4: Final Defaults
  if (!decision) {
    const defaultModel = await LLMConfiguration.findOne({ ...baseFilter, isDefault: true }) ||
      await LLMConfiguration.findOne({ isDefault: true });

    decision = {
      chosenModel: defaultModel,
      logic: 'system_default_fallback',
      queryCategory: category,
      isABTest: false,
      fallbacks: []
    };
  }

  // 4. Update Cache (Async)
  routingCacheService.set(query, context, decision).catch(() => { });

  return decision;
}

/**
 * Gets prioritized fallback models for a given primary choice and category.
 * @param {object} primaryModel - The initially chosen LLM configuration.
 * @param {string} category - The classified query category.
 * @returns {Promise<Array<{modelId: string, provider: string}>>} - An array of fallback models in priority order.
 */
async function getFallbackModels(primaryModel, category) {
  const fallbacks = [];

  // 1. Same provider, different capability (if applicable)
  // 2. Different provider, same capability (Gemini is usually the rock-solid fallback)
  const backupFilter = {
    modelId: { $ne: primaryModel.modelId },
    isDefault: true // Stick to defaults for fallbacks for stability
  };

  // If primary isn't Gemini, Gemini is always first fallback
  if (primaryModel.provider !== 'gemini') {
    const geminiFallback = await LLMConfiguration.findOne({ provider: 'gemini', isDefault: true });
    if (geminiFallback) fallbacks.push(geminiFallback);
  }

  // If primary isn't Ollama, Ollama is second fallback
  if (primaryModel.provider !== 'ollama') {
    const ollamaFallback = await LLMConfiguration.findOne({ provider: 'ollama', isDefault: true });
    if (ollamaFallback) fallbacks.push(ollamaFallback);
  }

  return fallbacks.map(m => ({ modelId: m.modelId, provider: m.provider }));
}

module.exports = { selectLLM };
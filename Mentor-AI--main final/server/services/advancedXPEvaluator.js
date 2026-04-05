// server/services/advancedXPEvaluator.js
const { selectLLM } = require('./llmRouterService');
const geminiService = require('./geminiService');
const { logger } = require('../utils/logger');

/**
 * Advanced XP Evaluation based on multiple quality dimensions
 * @param {string} userMessage - User's question/message
 * @param {string} aiResponse - AI's response
 * @param {object} context - User context (level, topic, etc.)
 * @returns {Promise<Object>} - Detailed XP breakdown
 */
async function evaluateMessageQuality(userMessage, aiResponse, context = {}) {
    try {
        const { user, topic = 'general', userLevel = 1 } = context;

        const prompt = `Analyze this student's message quality across multiple dimensions:

**Student Message:** "${userMessage}"

**Student Level:** ${userLevel} (1=Beginner, 5+=Intermediate, 10+=Advanced, 15+=Expert)

Evaluate on these criteria (0-10 each):

1. **Question Quality** - Is it clear, specific, well-thought-out?
   - Poor: "what is this?", "help"
   - Good: "What is the difference between X and Y?"
   - Excellent: "How would I implement X in scenario Y considering constraint Z?"

2. **Sentence Structure** - Grammar, punctuation, coherence
   - Poor: "how do i make code work"
   - Good: "How do I make this code work?"
   - Excellent: "Could you explain why this implementation fails and suggest improvements?"

3. **Vocabulary Level** - Use of technical terms, appropriate complexity
   - Basic: "make program fast"
   - Good: "optimize performance"
   - Excellent: "reduce time complexity from O(n²) to O(n log n)"

4. **Topic Depth** - Understanding level demonstrated
   - Surface: "What is X?" (remembering)
   - Moderate: "Why does X work?" (understanding)
   - Deep: "How can I apply X to solve Y?" (application/analysis)

5. **Clarity** - How easy is it to understand what they're asking?
   - Poor: Vague, ambiguous, missing context
   - Good: Clear intent, provides context
   - Excellent: Precise, well-framed, anticipates follow-ups

6. **Effort** - Evidence of prior thinking/research
   - Low: No context, first resort
   - Medium: Some context provided
   - High: Shows what they've tried, specific sticking point

Return JSON:
{
  "questionQuality": <0-10>,
  "sentenceStructure": <0-10>,
  "vocabularyLevel": <0-10>,
  "topicDepth": <0-10>,
  "clarity": <0-10>,
  "effort": <0-10>,
  "overallScore": <average of above>,
  "xpAward": <calculated XP 1-20>,
  "reasoning": "Brief explanation (1 sentence)",
  "feedback": "Constructive tip to improve question quality (optional)"
}

**XP Calculation Formula:**
- Base XP = overallScore (0-10)
- Bonus for high vocabulary (+5 if vocabularyLevel >= 8)
- Bonus for depth (+5 if topicDepth >= 8)
- Penalty for poor structure (-2 if sentenceStructure < 4)
- Level adjustment: Multiply by (1 + userLevel/20) to reward advanced students
- Final XP: Round to integer, min 1, max 20`;

        // Use LLM to evaluate
        const { chosenModel } = await selectLLM(prompt, { user, subject: topic });

        let evaluationText;
        let generationSuccess = false;

        // Try Ollama first
        if (chosenModel.provider === 'ollama') {
            try {
                logger.info('[AdvancedXPEvaluator] 🚀 Attempting XP evaluation with Ollama...');
                const ollamaService = require('./ollamaService');
                evaluationText = await ollamaService.generateContentWithHistory(
                    [],      // empty chat history
                    prompt,  // the evaluation prompt
                    null,    // no system prompt
                    { 
                        model: chosenModel.modelId,
                        ollamaUrl: process.env.OLLAMA_API_BASE_URL,
                        temperature: 0.3 
                    }
                );
                generationSuccess = true;
                logger.info('[AdvancedXPEvaluator] ✅ Ollama evaluation successful');
            } catch (ollamaError) {
                logger.warn('[AdvancedXPEvaluator] ⚠️ Ollama failed:', ollamaError.message);
                logger.info('[AdvancedXPEvaluator] 🔄 Falling back to Gemini API...');
            }
        }

        // Fallback to Gemini if Ollama failed or if Gemini was selected
        if (!generationSuccess) {
            try {
                logger.info('[AdvancedXPEvaluator] 🚀 Attempting XP evaluation with Gemini...');
                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) {
                    logger.error('[AdvancedXPEvaluator] ❌ GEMINI_API_KEY not found in environment');
                    return getFallbackEvaluation(userMessage, userLevel);
                }
                evaluationText = await geminiService.generateContentWithHistory(
                    [],      // empty chat history
                    prompt,  // the evaluation prompt
                    null,    // no system prompt
                    { temperature: 0.3, apiKey, maxOutputTokens: 300 }  // options with API key
                );
                generationSuccess = true;
                logger.info('[AdvancedXPEvaluator] ✅ Gemini evaluation successful');
            } catch (geminiError) {
                logger.error('[AdvancedXPEvaluator] ❌ Gemini also failed:', geminiError.message);
                return getFallbackEvaluation(userMessage, userLevel);
            }
        }

        // Parse JSON response
        const jsonMatch = evaluationText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.warn('[AdvancedXPEvaluator] Failed to parse AI response, using fallback');
            return getFallbackEvaluation(userMessage, userLevel);
        }

        const evaluation = JSON.parse(jsonMatch[0]);

        // Validate scores
        evaluation.questionQuality = clamp(evaluation.questionQuality || 5, 0, 10);
        evaluation.sentenceStructure = clamp(evaluation.sentenceStructure || 5, 0, 10);
        evaluation.vocabularyLevel = clamp(evaluation.vocabularyLevel || 5, 0, 10);
        evaluation.topicDepth = clamp(evaluation.topicDepth || 5, 0, 10);
        evaluation.clarity = clamp(evaluation.clarity || 5, 0, 10);
        evaluation.effort = clamp(evaluation.effort || 5, 0, 10);

        // Recalculate overall score
        evaluation.overallScore = (
            evaluation.questionQuality +
            evaluation.sentenceStructure +
            evaluation.vocabularyLevel +
            evaluation.topicDepth +
            evaluation.clarity +
            evaluation.effort
        ) / 6;

        // Recalculate XP with our formula
        evaluation.xpAward = calculateXP(evaluation, userLevel);

        // Enhanced logging with Bloom's taxonomy level
        const bloomsLevel = getBloomsLevel(evaluation.topicDepth);
        evaluation.reasoning = bloomsLevel.toLowerCase().replace('/', '_');
        logger.info(`[AdvancedXPEvaluator] ✅ Evaluated message: ${evaluation.xpAward} XP (Bloom's: ${bloomsLevel})`);
        logger.debug('[AdvancedXPEvaluator] Score breakdown:', {
            questionQuality: evaluation.questionQuality,
            topicDepth: evaluation.topicDepth,
            vocabularyLevel: evaluation.vocabularyLevel,
            reasoning: evaluation.reasoning
        });

        return evaluation;

    } catch (error) {
        logger.error('[AdvancedXPEvaluator] Error:', error);
        return getFallbackEvaluation(userMessage, context.userLevel || 1);
    }
}

/**
 * Get Bloom's taxonomy level from topic depth score
 */
function getBloomsLevel(topicDepth) {
    if (topicDepth <= 3) return 'Remembering';
    if (topicDepth <= 5) return 'Understanding';
    if (topicDepth <= 7) return 'Applying';
    if (topicDepth <= 9) return 'Analyzing';
    return 'Evaluating/Creating';
}

/**
 * Calculate XP from evaluation scores
 */
function calculateXP(evaluation, userLevel) {
    let xp = evaluation.overallScore; // Base: 0-10

    // Bonuses
    if (evaluation.vocabularyLevel >= 8) xp += 5;
    if (evaluation.topicDepth >= 8) xp += 5;
    if (evaluation.effort >= 8) xp += 3;

    // Penalties
    if (evaluation.sentenceStructure < 4) xp -= 2;
    if (evaluation.clarity < 4) xp -= 2;

    // Level adjustment (reward higher-level students for quality)
    const levelMultiplier = 1 + (userLevel / 20);
    xp *= levelMultiplier;

    // Clamp to range
    xp = Math.round(clamp(xp, 1, 20));

    return xp;
}

/**
 * Keyword-based fallback when AI fails
 */
function getFallbackEvaluation(message, userLevel) {
    const msg = message.toLowerCase();

    logger.info('[AdvancedXPEvaluator] 🔄 Using fallback evaluation for Bloom\'s taxonomy');

    // Analyze basic patterns
    let questionQuality = 5;
    let sentenceStructure = 5;
    let vocabularyLevel = 5;
    let topicDepth = 4; // Default to Understanding level
    let clarity = 5;
    let effort = 5;

    // Question quality indicators (Bloom's Taxonomy Analysis)
    if (msg.includes('what is') || msg.includes('define') || msg.includes('list') || msg.includes('name')) {
        questionQuality += 1;
        topicDepth = 3; // Remembering
    }
    
    if (msg.includes('how') || msg.includes('why') || msg.includes('explain') || msg.includes('describe')) {
        questionQuality += 2;
        topicDepth = 5; // Understanding
    }
    
    if (msg.includes('implement') || msg.includes('code') || msg.includes('example') || msg.includes('use') || msg.includes('apply')) {
        questionQuality += 3;
        topicDepth = 7; // Applying
    }
    
    if (msg.includes('compare') || msg.includes('analyze') || msg.includes('difference') || msg.includes('vs') || msg.includes('break down')) {
        questionQuality += 4;
        topicDepth = 8; // Analyzing
    }
    
    if (msg.includes('optimize') || msg.includes('design') || msg.includes('create') || msg.includes('improve') || msg.includes('evaluate')) {
        questionQuality += 5;
        topicDepth = 10; // Evaluating/Creating
    }

    // Sentence structure
    const hasProperCapitalization = message[0] === message[0].toUpperCase();
    const hasQuestionMark = message.includes('?');
    if (hasProperCapitalization) sentenceStructure += 1;
    if (hasQuestionMark) sentenceStructure += 1;
    if (message.split(' ').length >= 10) sentenceStructure += 1; // Longer = more thought

    // Vocabulary level - Enhanced technical term detection
    const technicalTerms = [
        'algorithm', 'complexity', 'optimization', 'implement', 'architecture',
        'paradigm', 'abstraction', 'polymorphism', 'recursion', 'asynchronous',
        'inheritance', 'encapsulation', 'scalability', 'framework', 'library',
        'database', 'query', 'function', 'variable', 'loop', 'condition',
        'object-oriented', 'functional', 'declarative', 'imperative'
    ];
    const technicalCount = technicalTerms.filter(term => msg.includes(term)).length;
    vocabularyLevel += Math.min(technicalCount * 2, 4);

    // Clarity
    if (message.length < 10) clarity -= 2;
    if (message.length > 100) clarity += 2;

    // Effort
    if (msg.includes('tried') || msg.includes('attempted') || msg.includes('error')) {
        effort += 3;
    }

    // Clamp all scores
    questionQuality = clamp(questionQuality, 0, 10);
    sentenceStructure = clamp(sentenceStructure, 0, 10);
    vocabularyLevel = clamp(vocabularyLevel, 0, 10);
    topicDepth = clamp(topicDepth, 0, 10);
    clarity = clamp(clarity, 0, 10);
    effort = clamp(effort, 0, 10);

    const overallScore = (questionQuality + sentenceStructure + vocabularyLevel + topicDepth + clarity + effort) / 6;

    const evaluation = {
        questionQuality,
        sentenceStructure,
        vocabularyLevel,
        topicDepth,
        clarity,
        effort,
        overallScore,
        xpAward: calculateXP({
            overallScore,
            vocabularyLevel,
            topicDepth,
            sentenceStructure,
            clarity,
            effort
        }, userLevel),
        reasoning: getBloomsLevel(topicDepth).toLowerCase().replace('/', '_'),
        feedback: generateFeedback(topicDepth, vocabularyLevel, questionQuality)
    };

    const bloomsLevel = getBloomsLevel(topicDepth);
    logger.info(`[AdvancedXPEvaluator] ✅ Fallback evaluation: ${evaluation.xpAward} XP (Bloom's: ${bloomsLevel})`);
    logger.debug('[AdvancedXPEvaluator] Fallback breakdown:', {
        topicDepth,
        vocabularyLevel, 
        questionQuality,
        bloomsLevel
    });

    return evaluation;
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Generate constructive feedback for question improvement
 */
function generateFeedback(topicDepth, vocabularyLevel, questionQuality) {
    if (topicDepth <= 4 && questionQuality <= 6) {
        return "Try asking 'how' or 'why' questions to deepen your understanding.";
    }
    if (vocabularyLevel <= 5) {
        return "Using more technical terminology can help you get more precise answers.";
    }
    if (topicDepth >= 8) {
        return "Excellent analytical thinking! Keep exploring complex relationships.";
    }
    return null;
}

/**
 * Get user's learning progression data
 * Used to adjust XP based on improvement over time
 */
async function getUserProgressionMultiplier(userId) {
    try {
        const GamificationProfile = require('../models/GamificationProfile');
        const profile = await GamificationProfile.findOne({ userId });

        if (!profile) return 1.0;

        // Reward improvement: If user's recent messages are better quality
        const recentXP = profile.xpHistory.slice(-10);
        if (recentXP.length < 5) return 1.0;

        const oldAvg = recentXP.slice(0, 5).reduce((a, b) => a + b.amount, 0) / 5;
        const newAvg = recentXP.slice(-5).reduce((a, b) => a + b.amount, 0) / 5;

        // If improving, small bonus
        if (newAvg > oldAvg * 1.2) {
            return 1.1; // 10% bonus for improvement
        }

        return 1.0;

    } catch (error) {
        logger.error('[AdvancedXPEvaluator] Error calculating progression:', error);
        return 1.0;
    }
}

module.exports = {
    evaluateMessageQuality,
    getUserProgressionMultiplier
};

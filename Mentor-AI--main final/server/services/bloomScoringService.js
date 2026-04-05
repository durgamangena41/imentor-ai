const UserScore = require('../models/UserScore');

const BLOOM_LEVELS = {
    REMEMBER: 1,
    UNDERSTAND: 2,
    APPLY: 3,
    ANALYZE: 4,
    EVALUATE: 5,
    CREATE: 6
};

// Keyword mapping for heuristic analysis
const KEYWORD_MAP = {
    [BLOOM_LEVELS.REMEMBER]: ['what is', 'define', 'list', 'recall', 'who', 'when', 'where', 'describe', 'identify'],
    [BLOOM_LEVELS.UNDERSTAND]: ['explain', 'summarize', 'interpret', 'classify', 'compare', 'contrast', 'outline', 'predict'],
    [BLOOM_LEVELS.APPLY]: ['how to', 'apply', 'use', 'demonstrate', 'solve', 'implement', 'calculate', 'build', 'show me'],
    [BLOOM_LEVELS.ANALYZE]: ['analyze', 'why', 'examine', 'break down', 'differentiate', 'investigate', 'relationship between'],
    [BLOOM_LEVELS.EVALUATE]: ['evaluate', 'critique', 'assess', 'justify', 'defend', 'judge', 'best way to', 'pros and cons'],
    [BLOOM_LEVELS.CREATE]: ['create', 'design', 'compose', 'generate', 'invent', 'propose', 'plan', 'develop a new']
};

/**
 * Analyzes the query depth based on Bloom's Taxonomy.
 * Returns a level (1-6) and the category name.
 */
function analyzeQueryDepth(query) {
    const lowerQuery = query.toLowerCase();

    // Iterate from highest complexity to lowest
    for (let level = 6; level >= 1; level--) {
        const keywords = KEYWORD_MAP[level];
        if (keywords.some(k => lowerQuery.includes(k))) {
            return { level, category: getCategoryName(level) };
        }
    }

    // Default to Understand (Level 2) if unclear, or Remember (Level 1)
    return { level: 1, category: 'remember' };
}

function getCategoryName(level) {
    const names = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
    return names[level - 1];
}

/**
 * Updates the user's score based on the query complexity.
 */
async function updateUserScore(userId, query) {
    try {
        const { level, category } = analyzeQueryDepth(query);

        // XP Calculation: Base + (Level * Multiplier)
        const xpReward = 10 + (level * 5);

        const userScore = await UserScore.findOneAndUpdate(
            { userId },
            {
                $inc: {
                    totalXP: xpReward,
                    [`cognitiveProfile.${category}`]: 1 // Increment specific cognitive skill
                },
                $set: { lastActive: new Date() }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`[BloomScoring] User ${userId} | Query Level: ${level} (${category}) | +${xpReward} XP`);
        return userScore;
    } catch (error) {
        console.error('[BloomScoring] Failed to update score:', error);
        return null;
    }
}

module.exports = {
    analyzeQueryDepth,
    updateUserScore,
    BLOOM_LEVELS
};

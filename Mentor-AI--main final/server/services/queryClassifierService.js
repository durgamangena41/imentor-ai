// server/services/queryClassifierService.js

/**
 * Lightweight service for classifying user queries without heavy ML inference.
 * Target Latency: < 5ms
 */
const queryClassifierService = {
    /**
     * Categories: 'technical', 'code', 'creative', 'multilingual', 'research', 'general'
     */
    classify(query) {
        if (!query || typeof query !== 'string') return 'general';

        const text = query.toLowerCase().trim();

        // --- 1. CODE & DATA STRUCTURES ---
        const codePatterns = [
            /```/, /function\s+\w+/, /const\s+\w+\s+=/, /def\s+\w+\(/, /import\s+/,
            /package\s+/, /console\.log/, /print\(/, /debug/, /refactor/, /fix the bug/,
            /class\s+\w+/, /json/
        ];
        if (codePatterns.some(p => p.test(text))) return 'code';

        // --- 2. TECHNICAL / MATH / SCIENCE ---
        const technicalPatterns = [
            /calculate/, /solve/, /equation/, /theorem/, /derivation/, /proof/, /formula/,
            /algorithm/, /complexity/, /big o/, /integral/, /derivative/, /matrix/, /vector/,
            /\d+[\+\-\*\/]\d+/, /\$\$/ // LaTeX markers
        ];
        if (technicalPatterns.some(p => p.test(text))) return 'technical';

        // --- 3. CREATIVE / ROLEPLAY / STORY ---
        const creativePatterns = [
            /write a story/, /imagine/, /once upon a time/, /act as/, /roleplay/,
            /creative writing/, /compose a poem/, /lyrics/, /metaphor/, /prose/
        ];
        if (creativePatterns.some(p => p.test(text))) return 'creative';

        // --- 4. MULTILINGUAL ---
        const multilingualPatterns = [
            /translate/, /in spanish/, /in french/, /in german/, /in chinese/,
            /how do you say/, /meaning of/, /translation/
        ];
        if (multilingualPatterns.some(p => p.test(text))) return 'multilingual';

        // --- 5. RESEARCH / DEEP ANALYSIS ---
        const researchPatterns = [
            /research/, /summarize paper/, /academic/, /sources/, /cite/,
            /literature review/, /detailed analysis/, /compare and contrast/,
            /tell me about/, /what is/, /who is/, /how does/
        ];
        if (researchPatterns.some(p => p.test(text))) return 'research';

        // --- 6. DEFAULT ---
        return 'general';
    },

    /**
     * Estimates query complexity: 'low', 'medium', 'high'
     */
    calculateComplexity(query) {
        if (!query || typeof query !== 'string') return 'low';
        const text = query.trim();
        const words = text.split(/\s+/).length;

        // Factors increasing complexity
        const hasCodeBlock = /```/.test(text);
        const hasTechnicalTerms = /(algorithm|optimization|architecture|implement|design|refactor|debug)/i.test(text);
        const hasComplexPunctuation = /[{}\[\]();]/.test(text) && words < 50; // Dense code snippets
        const longQuery = words > 100;

        if (hasCodeBlock || (hasTechnicalTerms && words > 30) || longQuery) return 'high';
        if (words > 15 || hasTechnicalTerms || hasComplexPunctuation) return 'medium';
        return 'low';
    },

    /**
     * Full analysis suite
     */
    analyze(query) {
        return {
            category: this.classify(query),
            complexity: this.calculateComplexity(query)
        };
    }
};

module.exports = queryClassifierService;

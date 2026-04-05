// server/services/sourceCredibilityService.js
// LLM-driven source quality scoring service for deep research.
// Uses a tiered domain reputation map + LLM fallback for unknown domains.

const { selectLLM } = require('./llmRouterService');

// --- Pre-built Domain Reputation Map ---
// Tier 1: Academic/authoritative (0.9-1.0)
// Tier 2: Educational/governmental (0.7-0.89)
// Tier 3: Reputable general sources (0.5-0.69)
// Tier 4: Unknown/low-quality (0.0-0.49)

const DOMAIN_REPUTATION = {
    // Tier 1 — Academic & Research
    'arxiv.org': 0.95,
    'pubmed.ncbi.nlm.nih.gov': 0.95,
    'ncbi.nlm.nih.gov': 0.95,
    'ieee.org': 0.95,
    'ieeexplore.ieee.org': 0.95,
    'acm.org': 0.93,
    'dl.acm.org': 0.93,
    'nature.com': 0.95,
    'science.org': 0.95,
    'sciencedirect.com': 0.92,
    'springer.com': 0.92,
    'link.springer.com': 0.92,
    'wiley.com': 0.90,
    'semanticscholar.org': 0.92,
    'scholar.google.com': 0.90,
    'jstor.org': 0.93,
    'researchgate.net': 0.85,
    'plos.org': 0.90,
    'frontiersin.org': 0.88,
    'mdpi.com': 0.80,
    'biorxiv.org': 0.88,
    'medrxiv.org': 0.88,
    'ssrn.com': 0.85,

    // Tier 2 — Educational & Governmental
    'mit.edu': 0.90,
    'stanford.edu': 0.90,
    'harvard.edu': 0.90,
    'cam.ac.uk': 0.90,
    'ox.ac.uk': 0.90,
    'nasa.gov': 0.92,
    'nih.gov': 0.92,
    'cdc.gov': 0.90,
    'who.int': 0.90,
    'nist.gov': 0.90,
    'khanacademy.org': 0.80,
    'coursera.org': 0.78,
    'edx.org': 0.78,

    // Tier 3 — Reputable General
    'wikipedia.org': 0.65,
    'en.wikipedia.org': 0.65,
    'britannica.com': 0.75,
    'medium.com': 0.50,
    'stackoverflow.com': 0.70,
    'geeksforgeeks.org': 0.65,
    'tutorialspoint.com': 0.60,
    'w3schools.com': 0.55,
    'dev.to': 0.55,
    'towardsdatascience.com': 0.60,
    'bbc.com': 0.70,
    'reuters.com': 0.75,
    'nytimes.com': 0.72,
};

/**
 * Extract the domain from a URL.
 */
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

/**
 * Check if a domain matches any pattern in the reputation map.
 * Supports partial matching (e.g., any .edu domain gets a base score).
 */
function getDomainScore(domain) {
    if (!domain) return null;

    // Exact match
    if (DOMAIN_REPUTATION[domain] !== undefined) {
        return DOMAIN_REPUTATION[domain];
    }

    // Partial match — check if domain ends with a known suffix
    for (const [knownDomain, score] of Object.entries(DOMAIN_REPUTATION)) {
        if (domain.endsWith(`.${knownDomain}`) || domain === knownDomain) {
            return score;
        }
    }

    // TLD-based heuristics
    if (domain.endsWith('.edu') || domain.endsWith('.ac.uk') || domain.endsWith('.ac.in')) return 0.80;
    if (domain.endsWith('.gov') || domain.endsWith('.gov.in')) return 0.82;
    if (domain.endsWith('.org')) return 0.55;
    if (domain.endsWith('.io')) return 0.45;

    return null; // Unknown — needs LLM evaluation
}

/**
 * Score a single source's credibility.
 * Uses domain reputation map first, falls back to content-based heuristics.
 * @param {Object} source - { title, url, content, sourceType, authors, publishedDate }
 * @returns {Object} - { credibilityScore, tier, reasoning }
 */
async function scoreSource(source) {
    const startTime = Date.now();

    // 1. Domain-based scoring (fast path)
    const domain = extractDomain(source.url);
    let domainScore = getDomainScore(domain);

    // 2. Source type bonus
    let typeBonus = 0;
    if (source.sourceType === 'arxiv' || source.sourceType === 'pubmed') typeBonus = 0.05;
    if (source.sourceType === 'semantic_scholar') typeBonus = 0.03;
    if (source.sourceType === 'academic') typeBonus = 0.02;
    if (source.sourceType === 'local') typeBonus = 0.10; // User's own docs are highly relevant

    // 3. Content quality heuristics (fast, no LLM needed)
    let contentBonus = 0;
    if (source.content) {
        const content = source.content;
        // Has citations/references
        if (/\[\d+\]|\(\d{4}\)|\bet al\b/i.test(content)) contentBonus += 0.05;
        // Has structured sections (academic style)
        if (/\b(abstract|introduction|methodology|conclusion|results|discussion)\b/i.test(content)) contentBonus += 0.05;
        // Minimum content length (substantive)
        if (content.length > 500) contentBonus += 0.03;
        if (content.length > 2000) contentBonus += 0.02;
        // Has author information
        if (source.authors && source.authors.length > 0) contentBonus += 0.03;
    }

    // 4. Compute final score
    let finalScore;
    let tier;
    let reasoning;

    if (domainScore !== null) {
        finalScore = Math.min(1.0, domainScore + typeBonus + contentBonus);
        reasoning = `Domain '${domain}' has reputation score ${domainScore}`;
    } else {
        // Unknown domain — use heuristic baseline
        const baselineScore = 0.40;
        finalScore = Math.min(1.0, baselineScore + typeBonus + contentBonus);
        reasoning = `Unknown domain '${domain}', scored via content heuristics`;
    }

    // Determine tier
    if (finalScore >= 0.90) tier = 'tier1_authoritative';
    else if (finalScore >= 0.70) tier = 'tier2_educational';
    else if (finalScore >= 0.50) tier = 'tier3_reputable';
    else tier = 'tier4_unverified';

    return {
        credibilityScore: Math.round(finalScore * 100) / 100,
        tier,
        domain: domain || 'unknown',
        reasoning,
        evaluationTimeMs: Date.now() - startTime,
    };
}

/**
 * Batch-score multiple sources.
 * @param {Array} sources - Array of source objects
 * @returns {Array} - Sources with credibility scores attached
 */
async function scoreSources(sources) {
    const scoredSources = await Promise.all(
        sources.map(async (source) => {
            const evaluation = await scoreSource(source);
            return {
                ...source,
                credibilityScore: evaluation.credibilityScore,
                credibilityTier: evaluation.tier,
                credibilityReasoning: evaluation.reasoning,
            };
        })
    );

    // Sort by credibility score descending
    return scoredSources.sort((a, b) => b.credibilityScore - a.credibilityScore);
}

/**
 * LLM-based deep content evaluation for critical research.
 * Only called for deep research mode on high-priority sources.
 * @param {Object} source - Source with content
 * @returns {Object} - LLM evaluation result
 */
async function deepEvaluateContent(source) {
    try {
        const { generateResponse } = require('./geminiService');

        const prompt = `You are an academic quality evaluator. Analyze this source and rate its quality on a scale of 0.0 to 1.0.

Source Title: ${source.title}
Source URL: ${source.url || 'N/A'}
Content Snippet (first 1500 chars):
${(source.content || '').substring(0, 1500)}

Evaluate based on:
1. Factual accuracy indicators (citations, data, specificity)
2. Academic rigor (methodology, peer review indicators)
3. Objectivity (neutral tone vs opinion/bias)
4. Depth (surface vs comprehensive coverage)
5. Currency (recent vs outdated information)

Respond in JSON format ONLY:
{"score": 0.X, "strengths": ["..."], "weaknesses": ["..."], "recommendation": "use|caution|avoid"}`;

        const result = await generateResponse(prompt, null);
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { score: 0.5, strengths: [], weaknesses: ['Could not parse LLM evaluation'], recommendation: 'caution' };
    } catch (error) {
        console.error('[SourceCredibility] LLM evaluation failed:', error.message);
        return { score: 0.5, strengths: [], weaknesses: ['LLM evaluation unavailable'], recommendation: 'caution' };
    }
}

module.exports = {
    scoreSource,
    scoreSources,
    deepEvaluateContent,
    extractDomain,
    getDomainScore,
    DOMAIN_REPUTATION,
};

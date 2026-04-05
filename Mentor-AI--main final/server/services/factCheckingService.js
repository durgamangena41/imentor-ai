// server/services/factCheckingService.js
// LLM-driven fact-checking service for deep research.
// Cross-references claims against multiple sources and flags unreliable information.

const { generateResponse } = require('./geminiService');

/**
 * Extract key claims from a synthesized research result.
 * @param {string} text - Synthesized research text
 * @param {string} query - Original research query
 * @returns {Array} - Array of extracted claims
 */
async function extractClaims(text, query) {
    if (!text || text.length < 50) return [];

    const prompt = `You are a fact extraction agent. Extract the key factual claims from this research synthesis about "${query}".

TEXT:
${text.substring(0, 3000)}

Extract specific, verifiable claims. Respond in JSON format ONLY:
{
    "claims": [
        {"text": "The exact factual claim", "citations": [1, 2], "category": "statistic|definition|finding|methodology|historical", "verifiable": true}
    ]
}`;

    try {
        const result = await generateResponse(prompt, null);
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.claims || [];
        }
    } catch (error) {
        console.error('[FactCheck] Claim extraction failed:', error.message);
    }
    return [];
}

/**
 * Cross-reference claims against their source materials.
 * Verifies whether each claim is well-supported by the cited sources.
 * @param {Array} claims - Extracted claims
 * @param {Array} sources - Original research sources
 * @returns {Object} - { verifiedClaims, flaggedClaims, overallReliability }
 */
async function crossReferenceClaims(claims, sources) {
    if (!claims || claims.length === 0) {
        return { verifiedClaims: [], flaggedClaims: [], overallReliability: 1.0 };
    }

    const sourceSnippets = sources.map((s, i) =>
        `[Source ${i + 1}] "${s.title}" (${s.sourceType}, credibility: ${s.credibilityScore || 'N/A'}):
${(s.content || '').substring(0, 600)}`
    ).join('\n\n');

    const claimList = claims.map((c, i) =>
        `Claim ${i + 1}: "${c.text}" [cites: ${(c.citations || []).join(', ')}]`
    ).join('\n');

    const verifyPrompt = `You are a rigorous academic fact-checker. Cross-reference these claims against their source materials.

## CLAIMS TO VERIFY
${claimList}

## SOURCE MATERIALS
${sourceSnippets}

For each claim, determine:
1. Is the claim supported by its cited source(s)?
2. Is there any exaggeration, misrepresentation, or unsupported extrapolation?
3. What is the confidence level?

Respond in JSON format ONLY:
{
    "results": [
        {
            "claimIndex": 0,
            "claimText": "The claim",
            "status": "verified|partially_supported|unsupported|exaggerated|unverifiable",
            "confidence": 0.85,
            "reasoning": "Why this status was assigned",
            "suggestedCorrection": null
        }
    ],
    "overallReliability": 0.85,
    "summary": "Brief summary of fact-check results"
}`;

    try {
        const result = await generateResponse(verifyPrompt, null);
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const results = parsed.results || [];

            const verified = results.filter(r => r.status === 'verified' || r.status === 'partially_supported');
            const flagged = results.filter(r => r.status === 'unsupported' || r.status === 'exaggerated' || r.status === 'unverifiable');

            return {
                verifiedClaims: verified,
                flaggedClaims: flagged,
                overallReliability: parsed.overallReliability || (verified.length / Math.max(results.length, 1)),
                summary: parsed.summary || '',
                totalClaims: results.length,
                verifiedCount: verified.length,
                flaggedCount: flagged.length,
            };
        }
    } catch (error) {
        console.error('[FactCheck] Cross-referencing failed:', error.message);
    }

    return {
        verifiedClaims: [],
        flaggedClaims: [],
        overallReliability: 0.5,
        summary: 'Fact-checking could not be completed automatically.',
        totalClaims: claims.length,
        verifiedCount: 0,
        flaggedCount: 0,
    };
}

/**
 * Full fact-check pipeline: extract claims → cross-reference → report.
 * @param {string} synthesizedText - The research synthesis to fact-check
 * @param {Array} sources - Original research sources
 * @param {string} query - Original research query
 * @returns {Object} - Complete fact-check report
 */
async function factCheckResearch(synthesizedText, sources, query) {
    const startTime = Date.now();

    // Step 1: Extract claims
    const claims = await extractClaims(synthesizedText, query);
    console.log(`[FactCheck] Extracted ${claims.length} claims from synthesis`);

    if (claims.length === 0) {
        return {
            claims: [],
            verifiedClaims: [],
            flaggedClaims: [],
            overallReliability: 1.0,
            summary: 'No verifiable claims found to check.',
            checkDurationMs: Date.now() - startTime,
        };
    }

    // Step 2: Cross-reference against sources
    const verification = await crossReferenceClaims(claims, sources);

    return {
        claims,
        ...verification,
        checkDurationMs: Date.now() - startTime,
    };
}

module.exports = {
    extractClaims,
    crossReferenceClaims,
    factCheckResearch,
};

// server/services/deepResearchOrchestrator.js
// The core LLM-driven agent that orchestrates deep research.
// Flow: PLAN → SEARCH → FILTER → SYNTHESIZE → REPORT → FACT-CHECK → CACHE
// Follows "guided learning" principle — the LLM plans its own research strategy.

const crypto = require('crypto');
const { multiSourceSearch } = require('./webCrawlerService');
const { searchLocalKnowledge } = require('./localKnowledgeBase');
const { scoreSources } = require('./sourceCredibilityService');
const ResearchCache = require('../models/ResearchCache');
const { selectLLM } = require('./llmRouterService');
const { generateResponse } = require('./geminiService');
const { generateResearchReport } = require('./researchSynthesisService');
const { factCheckResearch } = require('./factCheckingService');

// -------------------------------------------------------------------
// STEP 1: PLAN — LLM analyzes query and generates research strategy
// -------------------------------------------------------------------

/**
 * Use the LLM to plan a research strategy: which sources to query,
 * keywords to use, and depth level required.
 * @param {string} query - User's research query
 * @param {Object} context - { subject, userDocCount, conversationHistory }
 * @returns {Object} - Research plan
 */
async function planResearchStrategy(query, context = {}) {
    const planPrompt = `You are a research planning agent for an academic tutoring system. Analyze the user's query and create a research strategy.

USER QUERY: "${query}"

CONTEXT:
- Detected Subject: ${context.subject || 'general'}
- User has ${context.userDocCount || 0} uploaded documents in their knowledge base
- Conversation context: ${context.conversationHistory ? 'Available' : 'None'}

Create a research plan. Respond in JSON format ONLY:
{
    "depthLevel": "quick|standard|deep",
    "searchKeywords": ["keyword1", "keyword2", "keyword3"],
    "academicKeywords": ["refined academic keyword1", "keyword2"],
    "shouldSearchLocal": true,
    "shouldSearchAcademic": true,
    "shouldSearchPubMed": true,
    "shouldSearchWeb": true,
    "maxSourcesNeeded": 10,
    "reasoning": "Brief explanation of strategy",
    "expectedSourceTypes": ["academic papers", "textbooks", "web articles"]
}

Guidelines:
- Use "quick" for simple factual queries, "standard" for conceptual queries, "deep" for research-intensive
- PubMed is only useful for biomedical/health/scientific topics
- Academic search (arXiv, Semantic Scholar) is best for CS, math, physics, engineering papers
- Web search fills gaps for general/applied topics
- Local knowledge is always highest priority if user has documents`;

    try {
        const result = await generateResponse(planPrompt, null);
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const plan = JSON.parse(jsonMatch[0]);
            console.log(`[DeepResearch] Strategy planned: ${plan.depthLevel} depth, ${plan.searchKeywords?.length || 0} keywords`);
            return plan;
        }
    } catch (error) {
        console.error('[DeepResearch] Strategy planning failed, using defaults:', error.message);
    }

    // Fallback plan if LLM fails
    return {
        depthLevel: 'standard',
        searchKeywords: [query],
        academicKeywords: [query],
        shouldSearchLocal: true,
        shouldSearchAcademic: true,
        shouldSearchPubMed: false,
        shouldSearchWeb: true,
        maxSourcesNeeded: 10,
        reasoning: 'Fallback strategy — LLM planning unavailable',
        expectedSourceTypes: ['web articles', 'academic papers'],
    };
}

// -------------------------------------------------------------------
// STEP 2: SEARCH — Execute parallel multi-source searches
// -------------------------------------------------------------------

/**
 * Execute the research plan by searching all designated sources in parallel.
 * @param {string} query - Original query
 * @param {string} userId - User ID for local search
 * @param {Object} plan - Research plan from Step 1
 * @returns {Object} - All collected sources
 */
async function executeSearchPlan(query, userId, plan) {
    const startTime = Date.now();

    // Build optimized search queries from LLM-generated keywords
    const primaryQuery = plan.searchKeywords?.join(' ') || query;
    const academicQuery = plan.academicKeywords?.join(' ') || query;

    // Execute parallel searches
    const [localResults, onlineResults] = await Promise.all([
        // Local search (always run if user has documents)
        plan.shouldSearchLocal
            ? searchLocalKnowledge(query, userId, { limit: 7 })
            : Promise.resolve({ results: [], totalCount: 0 }),

        // Online multi-source search
        multiSourceSearch(academicQuery, userId, {
            includeLocal: false, // Already searched above
            includeAcademic: plan.shouldSearchAcademic !== false,
            includePubMed: plan.shouldSearchPubMed === true,
            includeWeb: plan.shouldSearchWeb !== false,
            maxPerSource: Math.ceil((plan.maxSourcesNeeded || 10) / 3),
        }),
    ]);

    const allSources = [
        ...localResults.results,
        ...(onlineResults.academic || []),
        ...(onlineResults.pubmed || []),
        ...(onlineResults.web || []),
    ];

    console.log(`[DeepResearch] Search complete: ${allSources.length} total sources in ${Date.now() - startTime}ms`);
    console.log(`  └─ Local: ${localResults.results.length}, Academic: ${(onlineResults.academic || []).length}, PubMed: ${(onlineResults.pubmed || []).length}, Web: ${(onlineResults.web || []).length}`);

    return {
        allSources,
        localCount: localResults.results.length,
        onlineCount: allSources.length - localResults.results.length,
        searchDurationMs: Date.now() - startTime,
        subject: localResults.subject,
    };
}

// -------------------------------------------------------------------
// STEP 3: FILTER — Score credibility, deduplicate, rank by relevance
// -------------------------------------------------------------------

/**
 * Filter, score, and rank all collected sources.
 * @param {Array} sources - Raw sources from search
 * @param {number} maxSources - Maximum sources to keep
 * @returns {Array} - Filtered, scored, and ranked sources
 */
async function filterAndRankSources(sources, maxSources = 15) {
    if (!sources || sources.length === 0) return [];

    // 1. Deduplicate by URL and title
    const seen = new Set();
    const unique = sources.filter(source => {
        const key = (source.url || '') + '|' + (source.title || '').toLowerCase().substring(0, 50);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // 2. Filter out sources with no useful content
    const withContent = unique.filter(source =>
        source.content && source.content.trim().length > 30
    );

    // Also keep sources that have no content but are from known reliable sources
    const reliableWithoutContent = unique.filter(source =>
        (!source.content || source.content.trim().length <= 30) &&
        (source.sourceType === 'arxiv' || source.sourceType === 'pubmed' || source.sourceType === 'semantic_scholar')
    );

    const candidates = [...withContent, ...reliableWithoutContent];

    // 3. Score credibility
    const scored = await scoreSources(candidates);

    // 4. Final ranking: credibility * 0.6 + relevance * 0.4
    const ranked = scored.map(source => ({
        ...source,
        finalScore: (source.credibilityScore || 0.5) * 0.6 + (source.relevanceScore || 0.5) * 0.4,
    }));

    ranked.sort((a, b) => b.finalScore - a.finalScore);

    return ranked.slice(0, maxSources);
}

// -------------------------------------------------------------------
// STEP 4: SYNTHESIZE — LLM generates cited research response
// -------------------------------------------------------------------

/**
 * Use the LLM to synthesize a comprehensive, cited research response.
 * @param {string} query - Original query
 * @param {Array} sources - Filtered and ranked sources
 * @param {Object} context - Additional context
 * @returns {string} - Synthesized research response with citations
 */
async function synthesizeFindings(query, sources, context = {}) {
    if (!sources || sources.length === 0) {
        return 'No sources were found for this research query. Please try refining your question or uploading relevant documents to your knowledge base.';
    }

    // Build source reference block for the LLM
    const sourceBlock = sources.map((source, i) => {
        const contentSnippet = (source.content || 'No content available').substring(0, 800);
        return `[${i + 1}] "${source.title}" (${source.sourceType}, credibility: ${source.credibilityScore})
URL: ${source.url || 'N/A'}
Authors: ${(source.authors || []).join(', ') || 'N/A'}
Content: ${contentSnippet}`;
    }).join('\n\n');

    const synthesisPrompt = `You are a research synthesis agent for an academic tutoring platform. Your role is to provide comprehensive, well-cited answers that guide the student's understanding.

## RESEARCH QUERY
"${query}"

## SOURCES FOUND (${sources.length} sources)
${sourceBlock}

## INSTRUCTIONS
1. **Synthesize** information from multiple sources into a coherent, educational response
2. **Cite sources** using [1], [2], etc. inline — every key claim must have a citation
3. **Structure** your response with clear headings and logical flow
4. **Explain** concepts at a university student level — be thorough but accessible
5. **Identify gaps** — note if important aspects of the query aren't covered by the sources
6. **Compare perspectives** — if sources disagree, present both sides with analysis
7. **Guide learning** — end with suggested follow-up questions or areas to explore

## RESPONSE FORMAT
Use markdown formatting. Include a "## References" section at the end listing all cited sources with their URLs.

Respond with the synthesized research:`;

    try {
        const result = await generateResponse(synthesisPrompt, null);
        return result;
    } catch (error) {
        console.error('[DeepResearch] Synthesis failed:', error.message);
        // Fallback: return a structured list of sources
        return `## Research Sources Found\n\n${sources.map((s, i) =>
            `${i + 1}. **${s.title}** (${s.sourceType})\n   ${s.url || 'No URL'}\n   ${(s.content || '').substring(0, 200)}...`
        ).join('\n\n')}`;
    }
}

// -------------------------------------------------------------------
// MAIN ENTRY POINT: conductResearch
// -------------------------------------------------------------------

/**
 * Main entry point for the deep research orchestrator.
 * Implements the full PLAN → SEARCH → FILTER → SYNTHESIZE → CACHE pipeline.
 * 
 * @param {string} query - User's research query
 * @param {string} userId - User ID
 * @param {Object} context - { conversationHistory, subject, depthOverride }
 * @returns {Object} - Complete research result
 */
async function conductResearch(query, userId, context = {}) {
    const startTime = Date.now();
    const queryHash = crypto.createHash('md5').update(`${query}:${userId}`).digest('hex');

    console.log(`[DeepResearch] Starting research for: "${query.substring(0, 80)}..." (hash: ${queryHash})`);

    // --- Check cache first ---
    try {
        const cached = await ResearchCache.findOne({ queryHash, userId });
        if (cached && cached.expiresAt > new Date()) {
            console.log(`[DeepResearch] Cache HIT for hash: ${queryHash}`);
            return {
                synthesizedResult: cached.synthesizedResult,
                sources: cached.sources,
                sourceBreakdown: cached.sourceBreakdown,
                metadata: { ...cached.metadata, fromCache: true, totalDurationMs: Date.now() - startTime },
                researchStrategy: cached.researchStrategy,
            };
        }
    } catch (cacheError) {
        console.warn('[DeepResearch] Cache lookup failed:', cacheError.message);
    }

    // --- STEP 1: PLAN ---
    const localPreview = await searchLocalKnowledge(query, userId, { limit: 1 });
    const plan = await planResearchStrategy(query, {
        subject: localPreview.subject,
        userDocCount: localPreview.totalCount,
        conversationHistory: context.conversationHistory,
    });

    // Allow depth override from caller
    if (context.depthOverride) {
        plan.depthLevel = context.depthOverride;
    }

    // --- STEP 2: SEARCH ---
    const searchResults = await executeSearchPlan(query, userId, plan);

    // --- STEP 3: FILTER ---
    const maxSources = plan.depthLevel === 'deep' ? 20 : plan.depthLevel === 'quick' ? 8 : 15;
    const rankedSources = await filterAndRankSources(searchResults.allSources, maxSources);

    // --- STEP 4: SYNTHESIZE ---
    const synthesizedResult = await synthesizeFindings(query, rankedSources, context);

    // --- Compute source breakdown ---
    const localCount = rankedSources.filter(s => s.sourceType === 'local').length;
    const onlineCount = rankedSources.length - localCount;
    const sourceBreakdown = {
        localCount,
        onlineCount,
        totalCount: rankedSources.length,
        localPercentage: rankedSources.length > 0
            ? Math.round((localCount / rankedSources.length) * 100)
            : 0,
    };

    // --- Determine cache TTL ---
    const hasAcademic = rankedSources.some(s => ['arxiv', 'pubmed', 'semantic_scholar'].includes(s.sourceType));
    const ttlMs = hasAcademic
        ? 7 * 24 * 60 * 60 * 1000  // 7 days for academic-heavy results
        : 24 * 60 * 60 * 1000;      // 24 hours for web-heavy results

    // --- STEP 5: CACHE ---
    const researchResult = {
        synthesizedResult,
        sources: rankedSources.map(s => ({
            title: s.title,
            url: s.url,
            content: (s.content || '').substring(0, 500), // Trim for storage
            sourceType: s.sourceType,
            credibilityScore: s.credibilityScore,
            authors: s.authors || [],
            publishedDate: s.publishedDate || null,
            relevanceScore: s.relevanceScore || 0,
        })),
        sourceBreakdown,
        researchStrategy: plan,
        metadata: {
            searchDurationMs: searchResults.searchDurationMs,
            totalDurationMs: Date.now() - startTime,
            modelUsed: 'gemini', // From selectLLM
            depthLevel: plan.depthLevel,
            fromCache: false,
        },
    };

    // Save to cache (async, don't block response)
    ResearchCache.create({
        queryHash,
        query,
        userId,
        sources: researchResult.sources,
        synthesizedResult,
        researchStrategy: plan,
        sourceBreakdown,
        metadata: researchResult.metadata,
        expiresAt: new Date(Date.now() + ttlMs),
    }).catch(err => console.warn('[DeepResearch] Cache write failed:', err.message));

    console.log(`[DeepResearch] Research complete in ${Date.now() - startTime}ms — ${rankedSources.length} sources, ${sourceBreakdown.localPercentage}% local`);

    return researchResult;
}

// -------------------------------------------------------------------
// ENHANCED ENTRY POINT: conductDeepResearch (Task 1.3.2)
// -------------------------------------------------------------------

/**
 * Enhanced deep research with intelligent synthesis, fact-checking, and report generation.
 * Extends conductResearch with: multi-doc summarization, citation graph,
 * contradiction detection, and automated fact-checking.
 * 
 * @param {string} query - User's research query
 * @param {string} userId - User ID
 * @param {Object} context - { conversationHistory, subject, depthOverride, includeFactCheck, reportStyle }
 * @returns {Object} - Complete research result with report, fact-check, and citation graph
 */
async function conductDeepResearch(query, userId, context = {}) {
    const startTime = Date.now();
    const {
        includeFactCheck = true,
        reportStyle = 'academic',
    } = context;

    // Step 1-5: Run base research pipeline
    const baseResult = await conductResearch(query, userId, context);

    // If cached result, skip synthesis (it already has everything)
    if (baseResult.metadata?.fromCache && baseResult.report) {
        return baseResult;
    }

    console.log(`[DeepResearch] Enhancing with intelligent synthesis (Task 1.3.2)...`);

    // Step 6: Generate research report (multi-doc summary + citation graph + contradictions)
    const report = await generateResearchReport(query, baseResult.sources, {
        includeGraph: true,
        includeContradictions: true,
        reportStyle,
    });

    // Step 7: Fact-check the synthesis (optional, for deep mode)
    let factCheck = null;
    const shouldFactCheck = includeFactCheck &&
        (baseResult.metadata?.depthLevel === 'deep' || baseResult.metadata?.depthLevel === 'standard');

    if (shouldFactCheck && baseResult.synthesizedResult) {
        factCheck = await factCheckResearch(baseResult.synthesizedResult, baseResult.sources, query);
        console.log(`[DeepResearch] Fact-check: ${factCheck.verifiedCount}/${factCheck.totalClaims} claims verified, reliability: ${factCheck.overallReliability}`);
    }

    const enhancedResult = {
        ...baseResult,
        report: {
            markdown: report.reportMarkdown,
            synthesis: report.synthesis,
            citationGraph: report.citationGraph,
            contradictions: report.contradictions,
            references: report.references,
        },
        factCheck: factCheck ? {
            overallReliability: factCheck.overallReliability,
            summary: factCheck.summary,
            totalClaims: factCheck.totalClaims,
            verifiedCount: factCheck.verifiedCount,
            flaggedCount: factCheck.flaggedCount,
            flaggedClaims: factCheck.flaggedClaims,
        } : null,
        metadata: {
            ...baseResult.metadata,
            totalDurationMs: Date.now() - startTime,
            hasReport: true,
            hasFactCheck: !!factCheck,
            reportGenerationTimeMs: report.metadata?.generationTimeMs || 0,
            factCheckTimeMs: factCheck?.checkDurationMs || 0,
        },
    };

    console.log(`[DeepResearch] Enhanced research complete in ${Date.now() - startTime}ms`);
    return enhancedResult;
}

module.exports = {
    conductResearch,
    conductDeepResearch,
    planResearchStrategy,
    executeSearchPlan,
    filterAndRankSources,
    synthesizeFindings,
};

// server/routes/deepResearch.js
// Express route for the deep research orchestrator.
// Exposes research functionality via REST API.
// Protected by authMiddleware (mounted in server.js).

const express = require('express');
const router = express.Router();
const { conductResearch, conductDeepResearch } = require('../services/deepResearchOrchestrator');
const { factCheckResearch } = require('../services/factCheckingService');
const ResearchCache = require('../models/ResearchCache');

/**
 * POST /api/deep-research/search
 * Basic deep research endpoint (Task 1.3.1).
 * Body: { query, depthLevel?, conversationHistory? }
 */
router.post('/search', async (req, res) => {
    const { query, depthLevel, conversationHistory } = req.body;
    const userId = req.user?._id || req.user?.userId;

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
        return res.status(400).json({
            success: false,
            message: 'A research query of at least 3 characters is required.',
        });
    }

    try {
        console.log(`[DeepResearch Route] Research request from user ${userId}: "${query.substring(0, 80)}..."`);

        const result = await conductResearch(query.trim(), userId, {
            depthOverride: depthLevel,
            conversationHistory,
        });

        return res.status(200).json({
            success: true,
            data: {
                synthesizedResult: result.synthesizedResult,
                sources: result.sources,
                sourceBreakdown: result.sourceBreakdown,
                metadata: result.metadata,
            },
        });
    } catch (error) {
        console.error('[DeepResearch Route] Research failed:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Deep research encountered an error.',
            error: error.message,
        });
    }
});

/**
 * POST /api/deep-research/report
 * Enhanced research with full report generation (Task 1.3.2).
 * Returns: synthesis, citation graph, contradictions, fact-check, markdown report.
 * Body: { query, depthLevel?, reportStyle?, includeFactCheck?, conversationHistory? }
 */
router.post('/report', async (req, res) => {
    const { query, depthLevel, reportStyle, includeFactCheck, conversationHistory } = req.body;
    const userId = req.user?._id || req.user?.userId;

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
        return res.status(400).json({
            success: false,
            message: 'A research query of at least 3 characters is required.',
        });
    }

    try {
        console.log(`[DeepResearch Route] Enhanced report request from user ${userId}: "${query.substring(0, 80)}..."`);

        const result = await conductDeepResearch(query.trim(), userId, {
            depthOverride: depthLevel || 'deep',
            reportStyle: reportStyle || 'academic',
            includeFactCheck: includeFactCheck !== false,
            conversationHistory,
        });

        return res.status(200).json({
            success: true,
            data: {
                synthesizedResult: result.synthesizedResult,
                report: result.report,
                factCheck: result.factCheck,
                sources: result.sources,
                sourceBreakdown: result.sourceBreakdown,
                metadata: result.metadata,
            },
        });
    } catch (error) {
        console.error('[DeepResearch Route] Enhanced report failed:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Enhanced research report encountered an error.',
            error: error.message,
        });
    }
});

/**
 * POST /api/deep-research/fact-check
 * Standalone fact-check endpoint for any text against sources.
 * Body: { text, sources?, query? }
 */
router.post('/fact-check', async (req, res) => {
    const { text, sources, query } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
        return res.status(400).json({
            success: false,
            message: 'Text of at least 10 characters is required for fact-checking.',
        });
    }

    try {
        const result = await factCheckResearch(text.trim(), sources || [], query || 'General fact check');

        return res.status(200).json({
            success: true,
            data: {
                overallReliability: result.overallReliability,
                summary: result.summary,
                totalClaims: result.totalClaims,
                verifiedCount: result.verifiedCount,
                flaggedCount: result.flaggedCount,
                claims: result.claims,
                flaggedClaims: result.flaggedClaims,
                checkDurationMs: result.checkDurationMs,
            },
        });
    } catch (error) {
        console.error('[DeepResearch Route] Fact-check failed:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Fact-checking encountered an error.',
            error: error.message,
        });
    }
});

/**
 * GET /api/deep-research/history
 * Get user's recent research history.
 */
router.get('/history', async (req, res) => {
    const userId = req.user?._id || req.user?.userId;

    try {
        const history = await ResearchCache.find({ userId })
            .select('query sourceBreakdown metadata createdAt')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        return res.status(200).json({
            success: true,
            data: history.map(h => ({
                query: h.query,
                sourceBreakdown: h.sourceBreakdown,
                depthLevel: h.metadata?.depthLevel || 'standard',
                createdAt: h.createdAt,
            })),
        });
    } catch (error) {
        console.error('[DeepResearch Route] History fetch failed:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch research history.' });
    }
});

/**
 * GET /api/deep-research/cache/:queryHash
 * Retrieve a specific cached research result.
 */
router.get('/cache/:queryHash', async (req, res) => {
    const userId = req.user?._id || req.user?.userId;
    const { queryHash } = req.params;

    try {
        const cached = await ResearchCache.findOne({ queryHash, userId }).lean();
        if (!cached) {
            return res.status(404).json({ success: false, message: 'Research result not found in cache.' });
        }

        return res.status(200).json({
            success: true,
            data: {
                query: cached.query,
                synthesizedResult: cached.synthesizedResult,
                sources: cached.sources,
                sourceBreakdown: cached.sourceBreakdown,
                metadata: { ...cached.metadata, fromCache: true },
            },
        });
    } catch (error) {
        console.error('[DeepResearch Route] Cache retrieval failed:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to retrieve cached result.' });
    }
});

module.exports = router;

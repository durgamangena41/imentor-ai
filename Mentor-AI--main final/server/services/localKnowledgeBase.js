// server/services/localKnowledgeBase.js
// Local knowledge base service that interfaces with Qdrant and user documents.
// Provides curated academic knowledge retrieval and user document search.

const axios = require('axios');
const KnowledgeSource = require('../models/KnowledgeSource');

const PYTHON_RAG_URL = process.env.PYTHON_RAG_SERVICE_URL;
const REQUEST_TIMEOUT = 20000;

// Subject-to-collection mapping for curated knowledge
const SUBJECT_COLLECTIONS = {
    'computer_science': ['data structures', 'algorithms', 'operating systems', 'databases', 'networking', 'compiler design', 'machine learning', 'artificial intelligence', 'web development', 'software engineering'],
    'mathematics': ['calculus', 'linear algebra', 'probability', 'statistics', 'discrete mathematics', 'numerical methods', 'differential equations'],
    'physics': ['mechanics', 'thermodynamics', 'electromagnetism', 'quantum mechanics', 'optics', 'relativity'],
    'chemistry': ['organic chemistry', 'inorganic chemistry', 'physical chemistry', 'biochemistry'],
    'electrical': ['circuit theory', 'signals and systems', 'digital electronics', 'power systems', 'control systems'],
    'general': ['research methodology', 'technical writing', 'critical thinking'],
};

/**
 * Detect the most relevant subject for a query based on keyword matching.
 * @param {string} query - Search query
 * @returns {string} - Subject identifier
 */
function detectSubject(query) {
    const lowerQuery = query.toLowerCase();

    for (const [subject, keywords] of Object.entries(SUBJECT_COLLECTIONS)) {
        for (const keyword of keywords) {
            if (lowerQuery.includes(keyword)) {
                return subject;
            }
        }
    }
    return 'general';
}

/**
 * Search user's uploaded documents via Qdrant vector similarity.
 * @param {string} query - Search query
 * @param {string} userId - User ID for scoped search
 * @param {number} limit - Max results
 * @returns {Array} - Array of relevant document chunks
 */
async function searchUserDocuments(query, userId, limit = 5) {
    if (!PYTHON_RAG_URL || !userId) return [];

    try {
        const response = await axios.post(
            `${PYTHON_RAG_URL}/search_qdrant`,
            { query, user_id: userId, limit },
            { timeout: REQUEST_TIMEOUT }
        );

        if (response.data?.success && Array.isArray(response.data.results)) {
            return response.data.results.map(doc => ({
                title: doc.document_name || 'User Document',
                content: doc.text || doc.content || '',
                sourceType: 'local',
                relevanceScore: doc.score || 0,
                url: `local://user/${userId}/${doc.document_name || 'document'}`,
                metadata: doc.metadata || {},
            }));
        }
        return [];
    } catch (error) {
        console.error('[LocalKB] User document search failed:', error.message);
        return [];
    }
}

/**
 * Get metadata about user's available knowledge sources.
 * @param {string} userId - User ID
 * @returns {Array} - List of user's knowledge sources
 */
async function getUserKnowledgeSources(userId) {
    try {
        const sources = await KnowledgeSource.find({
            userId,
            status: 'completed',
        }).select('title sourceType sourceUrl createdAt').lean();

        return sources.map(s => ({
            title: s.title,
            type: s.sourceType,
            url: s.sourceUrl || null,
            addedAt: s.createdAt,
        }));
    } catch (error) {
        console.error('[LocalKB] Failed to fetch user knowledge sources:', error.message);
        return [];
    }
}

/**
 * Combined local knowledge search: user documents + curated knowledge.
 * Implements the "local" part of the 70/30 hybrid strategy.
 * @param {string} query - Search query
 * @param {string} userId - User ID
 * @param {Object} options - Search options
 * @returns {Object} - { results: [], subject, userDocCount, totalCount }
 */
async function searchLocalKnowledge(query, userId, options = {}) {
    const { limit = 7 } = options;
    const startTime = Date.now();
    const subject = detectSubject(query);

    // Parallel search: user docs
    const [userResults] = await Promise.all([
        searchUserDocuments(query, userId, limit),
    ]);

    // Combine and deduplicate
    const allResults = [...userResults];
    const seen = new Set();
    const deduped = allResults.filter(r => {
        const key = (r.title + (r.content || '').substring(0, 50)).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort by relevance
    deduped.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return {
        results: deduped.slice(0, limit),
        subject,
        userDocCount: userResults.length,
        totalCount: deduped.length,
        searchDurationMs: Date.now() - startTime,
    };
}

module.exports = {
    detectSubject,
    searchUserDocuments,
    getUserKnowledgeSources,
    searchLocalKnowledge,
    SUBJECT_COLLECTIONS,
};

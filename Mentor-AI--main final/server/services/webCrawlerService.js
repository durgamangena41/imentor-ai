// server/services/webCrawlerService.js
// Enhanced web crawling service for deep research.
// Wraps existing Python RAG endpoints + adds PubMed integration.
// Does NOT modify any existing services — only calls them.

const axios = require('axios');

const PYTHON_RAG_URL = process.env.PYTHON_RAG_SERVICE_URL;
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Search academic sources via existing Python RAG `/academic_search` endpoint.
 * Returns results from arXiv + Semantic Scholar.
 * @param {string} query - Search query
 * @param {number} maxResults - Max results per API (default: 5)
 * @returns {Array} - Array of source objects
 */
async function searchAcademic(query, maxResults = 5) {
    if (!PYTHON_RAG_URL) {
        console.warn('[WebCrawler] PYTHON_RAG_SERVICE_URL not set, academic search disabled.');
        return [];
    }

    try {
        const response = await axios.post(
            `${PYTHON_RAG_URL}/academic_search`,
            { query, max_results: maxResults },
            { timeout: REQUEST_TIMEOUT }
        );

        if (response.data?.success && Array.isArray(response.data.results)) {
            return response.data.results.map(paper => ({
                title: paper.title || 'Untitled',
                url: paper.url || '',
                content: paper.summary || '',
                sourceType: (paper.source || '').toLowerCase().includes('arxiv') ? 'arxiv' : 'semantic_scholar',
                authors: paper.authors || [],
                publishedDate: paper.published || null,
            }));
        }
        return [];
    } catch (error) {
        console.error('[WebCrawler] Academic search failed:', error.message);
        return [];
    }
}

/**
 * Search PubMed via NCBI E-utilities API (free, no API key required).
 * Searches biomedical and life sciences literature.
 * @param {string} query - Search query
 * @param {number} maxResults - Max results (default: 5)
 * @returns {Array} - Array of source objects
 */
async function searchPubMed(query, maxResults = 5) {
    const PUBMED_SEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
    const PUBMED_FETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

    try {
        // Step 1: Search for PubMed IDs
        const searchResponse = await axios.get(PUBMED_SEARCH_URL, {
            params: {
                db: 'pubmed',
                term: query,
                retmax: maxResults,
                retmode: 'json',
                sort: 'relevance',
            },
            timeout: 15000,
        });

        const idList = searchResponse.data?.esearchresult?.idlist;
        if (!idList || idList.length === 0) {
            console.log('[WebCrawler] PubMed returned no results for:', query);
            return [];
        }

        // Step 2: Fetch article summaries
        const fetchResponse = await axios.get(PUBMED_FETCH_URL, {
            params: {
                db: 'pubmed',
                id: idList.join(','),
                retmode: 'json',
            },
            timeout: 15000,
        });

        const result = fetchResponse.data?.result;
        if (!result) return [];

        const papers = [];
        for (const pmid of idList) {
            const article = result[pmid];
            if (!article || article.error) continue;

            const authors = (article.authors || []).map(a => a.name).filter(Boolean);
            papers.push({
                title: article.title || 'Untitled PubMed Article',
                url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                content: article.title || '', // PubMed summary API doesn't return abstracts directly
                sourceType: 'pubmed',
                authors,
                publishedDate: article.pubdate || null,
                pmid,
            });
        }

        console.log(`[WebCrawler] PubMed found ${papers.length} results for: "${query}"`);
        return papers;
    } catch (error) {
        console.error('[WebCrawler] PubMed search failed:', error.message);
        return [];
    }
}

/**
 * Fetch PubMed abstracts for a list of PMIDs.
 * Uses the efetch API to get full abstract text.
 * @param {Array<string>} pmids - Array of PubMed IDs
 * @returns {Object} - Map of pmid -> abstract text
 */
async function fetchPubMedAbstracts(pmids) {
    if (!pmids || pmids.length === 0) return {};

    const PUBMED_EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

    try {
        const response = await axios.get(PUBMED_EFETCH_URL, {
            params: {
                db: 'pubmed',
                id: pmids.join(','),
                retmode: 'xml',
                rettype: 'abstract',
            },
            timeout: 15000,
        });

        // Simple XML parsing for abstracts
        const abstracts = {};
        const xmlText = response.data;

        for (const pmid of pmids) {
            // Extract abstract text between <AbstractText> tags
            const abstractRegex = new RegExp(
                `<PMID[^>]*>${pmid}</PMID>[\\s\\S]*?<Abstract>([\\s\\S]*?)</Abstract>`,
                'i'
            );
            const match = xmlText.match(abstractRegex);
            if (match) {
                // Strip XML tags from abstract
                abstracts[pmid] = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }
        }

        return abstracts;
    } catch (error) {
        console.error('[WebCrawler] PubMed abstract fetch failed:', error.message);
        return {};
    }
}

/**
 * Search the web via existing Python RAG `/web_search` endpoint (DuckDuckGo).
 * @param {string} query - Search query
 * @param {number} maxResults - Max results (default: 5)
 * @returns {Array} - Array of source objects
 */
async function searchWeb(query, maxResults = 5) {
    if (!PYTHON_RAG_URL) {
        console.warn('[WebCrawler] PYTHON_RAG_SERVICE_URL not set, web search disabled.');
        return [];
    }

    try {
        const response = await axios.post(
            `${PYTHON_RAG_URL}/web_search`,
            { query },
            { timeout: REQUEST_TIMEOUT }
        );

        if (Array.isArray(response.data)) {
            return response.data.slice(0, maxResults).map(result => ({
                title: result.title || 'Untitled',
                url: result.url || '',
                content: result.content || '',
                sourceType: 'web',
                authors: [],
                publishedDate: null,
            }));
        }
        return [];
    } catch (error) {
        console.error('[WebCrawler] Web search failed:', error.message);
        return [];
    }
}

/**
 * Search local Qdrant vector database via existing `/search_qdrant` endpoint.
 * @param {string} query - Search query
 * @param {string} userId - User ID for scoped search
 * @param {number} limit - Max results (default: 5)
 * @returns {Array} - Array of source objects
 */
async function searchLocal(query, userId, limit = 5) {
    if (!PYTHON_RAG_URL) {
        console.warn('[WebCrawler] PYTHON_RAG_SERVICE_URL not set, local search disabled.');
        return [];
    }

    try {
        const response = await axios.post(
            `${PYTHON_RAG_URL}/search_qdrant`,
            { query, user_id: userId, limit },
            { timeout: REQUEST_TIMEOUT }
        );

        if (response.data?.success && Array.isArray(response.data.results)) {
            return response.data.results.map(doc => ({
                title: doc.document_name || doc.metadata?.documentName || 'Local Document',
                url: `local://${doc.document_name || 'document'}`,
                content: doc.text || doc.content || '',
                sourceType: 'local',
                authors: [],
                publishedDate: null,
                relevanceScore: doc.score || 0,
            }));
        }
        return [];
    } catch (error) {
        console.error('[WebCrawler] Local Qdrant search failed:', error.message);
        return [];
    }
}

/**
 * NEW: Crawl a specific URL and extract text content.
 * @param {string} url - The URL to crawl
 * @returns {Object} - { text, title, success }
 */
async function crawlUrl(url) {
    try {
        console.log(`[WebCrawler] Crawling URL: ${url}`);
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Basic HTML cleaning via Regex (since we don't have cheerio)
        let html = response.data;

        // Remove scripts, styles, and tags
        let text = html
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
            .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
            .replace(/<[^>]+>/gm, ' ')
            .replace(/\s+/gm, ' ')
            .trim();

        // Extract title if possible
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1] : url;

        return {
            success: true,
            title,
            text: text.substring(0, 5000), // Limit to 5k chars for LLM context
            url
        };
    } catch (error) {
        console.error(`[WebCrawler] Crawl failed for ${url}: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Execute a parallel multi-source search across all available sources.
 * This is the main entry point for the research orchestrator.
 * @param {string} query - Search query
 * @param {string} userId - User ID for local search scoping
 * @param {Object} options - { includeLocal, includeAcademic, includePubMed, includeWeb, maxPerSource }
 * @returns {Object} - { local: [], academic: [], pubmed: [], web: [], totalCount, searchDurationMs }
 */
async function multiSourceSearch(query, userId, options = {}) {
    const {
        includeLocal = true,
        includeAcademic = true,
        includePubMed = true,
        includeWeb = true,
        maxPerSource = 5,
    } = options;

    const startTime = Date.now();
    const searchPromises = [];
    const sourceLabels = [];

    if (includeLocal && userId) {
        searchPromises.push(searchLocal(query, userId, maxPerSource));
        sourceLabels.push('local');
    }
    if (includeAcademic) {
        searchPromises.push(searchAcademic(query, maxPerSource));
        sourceLabels.push('academic');
    }
    if (includePubMed) {
        searchPromises.push(searchPubMed(query, maxPerSource));
        sourceLabels.push('pubmed');
    }
    if (includeWeb) {
        searchPromises.push(searchWeb(query, maxPerSource));
        sourceLabels.push('web');
    }

    const results = await Promise.allSettled(searchPromises);

    const searchResults = { local: [], academic: [], pubmed: [], web: [] };
    let totalCount = 0;

    results.forEach((result, index) => {
        const label = sourceLabels[index];
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            searchResults[label] = result.value;
            totalCount += result.value.length;
            console.log(`[WebCrawler] ${label}: ${result.value.length} results`);
        } else {
            console.warn(`[WebCrawler] ${label} search failed:`, result.reason?.message || 'Unknown error');
        }
    });

    // Enrich PubMed results with abstracts
    const pubmedWithPmids = searchResults.pubmed.filter(p => p.pmid);
    if (pubmedWithPmids.length > 0) {
        const abstracts = await fetchPubMedAbstracts(pubmedWithPmids.map(p => p.pmid));
        searchResults.pubmed = searchResults.pubmed.map(paper => {
            if (paper.pmid && abstracts[paper.pmid]) {
                return { ...paper, content: abstracts[paper.pmid] };
            }
            return paper;
        });
    }

    return {
        ...searchResults,
        totalCount,
        searchDurationMs: Date.now() - startTime,
    };
}

module.exports = {
    searchAcademic,
    searchPubMed,
    searchWeb,
    searchLocal,
    multiSourceSearch,
    fetchPubMedAbstracts,
    crawlUrl,
};

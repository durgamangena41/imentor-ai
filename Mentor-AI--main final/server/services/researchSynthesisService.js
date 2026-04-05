// server/services/researchSynthesisService.js
// LLM-driven intelligent research synthesis engine.
// Provides: multi-document summarization, citation graph construction,
// contradiction detection, and structured research report generation.

const { generateResponse } = require('./geminiService');
const { scoreSources } = require('./sourceCredibilityService');

// ===================================================================
// 1. MULTI-DOCUMENT SUMMARIZATION
// ===================================================================

/**
 * Generate a structured summary from multiple research sources.
 * Uses hierarchical summarization: individual → group → final synthesis.
 * @param {Array} sources - Array of { title, content, sourceType, credibilityScore, url, authors }
 * @param {string} query - Original research query for focus
 * @param {Object} options - { maxLength, style }
 * @returns {Object} - { summary, keyFindings, methodology, gaps }
 */
async function multiDocumentSummarize(sources, query, options = {}) {
    const { maxLength = 2000, style = 'academic' } = options;

    if (!sources || sources.length === 0) {
        return { summary: 'No sources available for summarization.', keyFindings: [], methodology: '', gaps: [] };
    }

    // Phase 1: Build individual source summaries (in batch to save LLM calls)
    const sourceBlock = sources.map((s, i) => {
        const snippet = (s.content || '').substring(0, 1200);
        return `[SOURCE ${i + 1}] "${s.title}" (${s.sourceType}, credibility: ${s.credibilityScore || 'N/A'})
Authors: ${(s.authors || []).join(', ') || 'N/A'}
URL: ${s.url || 'N/A'}
Content:
${snippet}`;
    }).join('\n\n---\n\n');

    const synthesisPrompt = `You are an expert research synthesis agent. Analyze these ${sources.length} sources about "${query}" and produce a structured synthesis.

## SOURCES
${sourceBlock}

## TASK
Create a comprehensive research synthesis. Respond in JSON format ONLY:
{
    "summary": "A ${maxLength}-character max ${style} summary synthesizing all sources. Use inline citations like [1], [2]. Identify themes, compare findings, and note consensus/disagreement.",
    "keyFindings": [
        {"finding": "Key finding 1", "supportedBy": [1, 2], "confidence": "high|medium|low"},
        {"finding": "Key finding 2", "supportedBy": [3], "confidence": "high|medium|low"}
    ],
    "methodology": "Brief description of research methodologies mentioned across sources",
    "gaps": ["Knowledge gap 1 not covered by any source", "Gap 2"],
    "themes": [
        {"theme": "Theme name", "sources": [1, 3], "description": "Brief description"}
    ],
    "consensusAreas": ["Areas where sources agree"],
    "contradictions": [
        {"claim1": "Source says X", "source1": 1, "claim2": "Source says Y", "source2": 3, "analysis": "Why they differ"}
    ]
}`;

    try {
        const result = await generateResponse(synthesisPrompt, null);
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                summary: parsed.summary || '',
                keyFindings: parsed.keyFindings || [],
                methodology: parsed.methodology || '',
                gaps: parsed.gaps || [],
                themes: parsed.themes || [],
                consensusAreas: parsed.consensusAreas || [],
                contradictions: parsed.contradictions || [],
                sourceCount: sources.length,
            };
        }
    } catch (error) {
        console.error('[ResearchSynthesis] Multi-doc summarization failed:', error.message);
    }

    // Fallback: basic concatenation
    return {
        summary: sources.map((s, i) => `[${i + 1}] ${s.title}: ${(s.content || '').substring(0, 300)}`).join('\n\n'),
        keyFindings: [],
        methodology: 'Automated extraction failed — manual review recommended.',
        gaps: ['LLM synthesis unavailable'],
        themes: [],
        consensusAreas: [],
        contradictions: [],
        sourceCount: sources.length,
    };
}

// ===================================================================
// 2. CITATION GRAPH CONSTRUCTION
// ===================================================================

/**
 * Build a citation/relationship graph from research sources.
 * Maps which sources reference similar concepts, creating an adjacency structure.
 * @param {Array} sources - Research sources
 * @param {string} query - Research query
 * @returns {Object} - { nodes, edges, clusters }
 */
async function buildCitationGraph(sources, query) {
    if (!sources || sources.length < 2) {
        return { nodes: sources?.map((s, i) => ({ id: i, label: s.title })) || [], edges: [], clusters: [] };
    }

    const sourceList = sources.map((s, i) =>
        `[${i}] "${s.title}" (${s.sourceType}) — ${(s.content || '').substring(0, 400)}`
    ).join('\n');

    const graphPrompt = `Analyze these research sources and identify relationships between them. Which sources discuss similar topics, cite similar work, or build on each other's findings?

QUERY: "${query}"

SOURCES:
${sourceList}

Respond in JSON format ONLY:
{
    "edges": [
        {"from": 0, "to": 1, "relationship": "discusses_same_topic|builds_upon|contradicts|complements", "strength": 0.8, "description": "Brief description of relationship"}
    ],
    "clusters": [
        {"name": "Cluster name", "sourceIds": [0, 1], "theme": "Shared theme"}
    ]
}`;

    try {
        const result = await generateResponse(graphPrompt, null);
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                nodes: sources.map((s, i) => ({
                    id: i,
                    label: s.title,
                    type: s.sourceType,
                    credibility: s.credibilityScore || 0.5,
                    url: s.url,
                })),
                edges: (parsed.edges || []).map(e => ({
                    from: e.from,
                    to: e.to,
                    relationship: e.relationship || 'related',
                    strength: e.strength || 0.5,
                    description: e.description || '',
                })),
                clusters: parsed.clusters || [],
            };
        }
    } catch (error) {
        console.error('[ResearchSynthesis] Citation graph construction failed:', error.message);
    }

    // Fallback: flat node list
    return {
        nodes: sources.map((s, i) => ({ id: i, label: s.title, type: s.sourceType, credibility: s.credibilityScore || 0.5 })),
        edges: [],
        clusters: [],
    };
}

// ===================================================================
// 3. CONTRADICTION DETECTION
// ===================================================================

/**
 * Detect contradictions and conflicting claims across sources.
 * @param {Array} sources - Research sources with content
 * @param {string} query - Research query
 * @returns {Object} - { contradictions, agreementLevel, conflictingSources }
 */
async function detectContradictions(sources, query) {
    if (!sources || sources.length < 2) {
        return { contradictions: [], agreementLevel: 'unanimous', conflictingSources: [] };
    }

    const sourceData = sources.map((s, i) =>
        `[Source ${i + 1}] "${s.title}" (${s.sourceType}, credibility: ${s.credibilityScore || 'N/A'}):\n${(s.content || '').substring(0, 800)}`
    ).join('\n\n');

    const contradictionPrompt = `You are a fact-checking agent. Analyze these sources about "${query}" and identify contradictions, conflicting claims, or inconsistencies.

${sourceData}

Respond in JSON format ONLY:
{
    "contradictions": [
        {
            "topic": "What the contradiction is about",
            "claim_a": {"text": "What source A claims", "sourceIndex": 1, "sourceTitle": "Title"},
            "claim_b": {"text": "What source B claims", "sourceIndex": 3, "sourceTitle": "Title"},
            "severity": "critical|moderate|minor",
            "analysis": "Why they might differ (methodology, date, scope, interpretation)",
            "recommendation": "Which claim is more credible and why"
        }
    ],
    "agreementLevel": "unanimous|strong_consensus|moderate_consensus|divided|contradictory",
    "factualConcerns": ["Any claims that seem potentially inaccurate based on cross-referencing"]
}`;

    try {
        const result = await generateResponse(contradictionPrompt, null);
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                contradictions: parsed.contradictions || [],
                agreementLevel: parsed.agreementLevel || 'unknown',
                factualConcerns: parsed.factualConcerns || [],
                conflictingSources: (parsed.contradictions || []).flatMap(c =>
                    [c.claim_a?.sourceIndex, c.claim_b?.sourceIndex]
                ).filter(Boolean),
            };
        }
    } catch (error) {
        console.error('[ResearchSynthesis] Contradiction detection failed:', error.message);
    }

    return { contradictions: [], agreementLevel: 'unknown', factualConcerns: [], conflictingSources: [] };
}

// ===================================================================
// 4. RESEARCH REPORT GENERATION
// ===================================================================

/**
 * Generate a complete, structured research report with citations.
 * Combines summarization, citation graph, and contradiction detection.
 * @param {string} query - Research query
 * @param {Array} sources - Filtered and ranked sources
 * @param {Object} options - { includeGraph, includeContradictions, reportStyle }
 * @returns {Object} - Complete research report
 */
async function generateResearchReport(query, sources, options = {}) {
    const {
        includeGraph = true,
        includeContradictions = true,
        reportStyle = 'academic',
    } = options;

    const startTime = Date.now();

    // Run synthesis phases in parallel where possible
    const [synthesis, citationGraph, contradictions] = await Promise.all([
        multiDocumentSummarize(sources, query, { style: reportStyle }),
        includeGraph ? buildCitationGraph(sources, query) : Promise.resolve(null),
        includeContradictions ? detectContradictions(sources, query) : Promise.resolve(null),
    ]);

    // Build references list
    const references = sources.map((s, i) => ({
        number: i + 1,
        title: s.title,
        url: s.url || 'N/A',
        sourceType: s.sourceType,
        authors: s.authors || [],
        credibilityScore: s.credibilityScore || 0,
        publishedDate: s.publishedDate || null,
    }));

    // Build the final report markdown
    const reportMarkdown = buildReportMarkdown(query, synthesis, references, contradictions);

    return {
        query,
        reportMarkdown,
        synthesis,
        citationGraph,
        contradictions,
        references,
        metadata: {
            sourceCount: sources.length,
            reportStyle,
            generationTimeMs: Date.now() - startTime,
            agreementLevel: contradictions?.agreementLevel || 'unknown',
            contradictionCount: contradictions?.contradictions?.length || 0,
            themeCount: synthesis.themes?.length || 0,
        },
    };
}

/**
 * Build a formatted markdown research report.
 */
function buildReportMarkdown(query, synthesis, references, contradictions) {
    let md = `# Research Report: ${query}\n\n`;

    // Executive Summary
    md += `## Executive Summary\n\n${synthesis.summary}\n\n`;

    // Key Findings
    if (synthesis.keyFindings && synthesis.keyFindings.length > 0) {
        md += `## Key Findings\n\n`;
        synthesis.keyFindings.forEach((f, i) => {
            const citations = (f.supportedBy || []).map(n => `[${n}]`).join('');
            const confidence = f.confidence === 'high' ? '🟢' : f.confidence === 'medium' ? '🟡' : '🔴';
            md += `${i + 1}. ${confidence} **${f.finding}** ${citations}\n`;
        });
        md += '\n';
    }

    // Themes
    if (synthesis.themes && synthesis.themes.length > 0) {
        md += `## Identified Themes\n\n`;
        synthesis.themes.forEach(t => {
            const srcRefs = (t.sources || []).map(n => `[${n}]`).join(', ');
            md += `### ${t.theme}\n${t.description} *(Sources: ${srcRefs})*\n\n`;
        });
    }

    // Contradictions
    if (contradictions && contradictions.contradictions && contradictions.contradictions.length > 0) {
        md += `## ⚠️ Contradictions Detected\n\n`;
        md += `**Agreement Level:** ${contradictions.agreementLevel}\n\n`;
        contradictions.contradictions.forEach((c, i) => {
            md += `### Contradiction ${i + 1}: ${c.topic}\n`;
            md += `- **Claim A** [${c.claim_a?.sourceIndex}]: ${c.claim_a?.text}\n`;
            md += `- **Claim B** [${c.claim_b?.sourceIndex}]: ${c.claim_b?.text}\n`;
            md += `- **Severity:** ${c.severity} | **Analysis:** ${c.analysis}\n`;
            md += `- **Recommendation:** ${c.recommendation}\n\n`;
        });
    }

    // Knowledge Gaps
    if (synthesis.gaps && synthesis.gaps.length > 0) {
        md += `## Knowledge Gaps\n\n`;
        synthesis.gaps.forEach(g => { md += `- ${g}\n`; });
        md += '\n';
    }

    // Methodology
    if (synthesis.methodology) {
        md += `## Methodology Overview\n\n${synthesis.methodology}\n\n`;
    }

    // References
    md += `## References\n\n`;
    references.forEach(r => {
        const authors = (r.authors || []).join(', ');
        md += `[${r.number}] ${r.title}${authors ? ` — ${authors}` : ''}. ${r.url !== 'N/A' ? r.url : ''} *(${r.sourceType}, credibility: ${r.credibilityScore})*\n\n`;
    });

    return md;
}

module.exports = {
    multiDocumentSummarize,
    buildCitationGraph,
    detectContradictions,
    generateResearchReport,
    buildReportMarkdown,
};

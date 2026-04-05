// server/services/toolRegistry.js
const { performWebSearch } = require('./webSearchService.js');
const { queryPythonRagService, queryKgService } = require('./toolExecutionService.js');
const { crawlUrl, multiSourceSearch } = require('./webCrawlerService.js');
const { synthesizeMultiDocResearch } = require('./researchSynthesisService.js');
const axios = require('axios');

async function queryAcademicService(query) {
  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
  if (!pythonServiceUrl) {
    throw new Error("Academic search service is not configured on the server.");
  }
  const searchUrl = `${pythonServiceUrl}/academic_search`;

  try {
    console.log(`[toolRegistry] Calling Python academic search at ${searchUrl} for query: "${query}"`);
    const response = await axios.post(searchUrl, { query }, { timeout: 45000 });
    const papers = response.data?.results || [];

    const toolOutput = papers.length > 0
      ? "Found the following relevant academic papers:\n\n" + papers.map((p, index) =>
        `[${index + 1}] **${p.title || 'Untitled Paper'}**\n` +
        `   - Source: ${p.source || 'Unknown'}\n` +
        `   - URL: ${p.url || '#'}\n` +
        `   - Summary: ${p.summary ? p.summary.substring(0, 300) + '...' : 'No summary.'}`
      ).join('\n\n')
      : "No relevant academic papers were found for this query.";

    const references = papers.map((p, index) => ({
      number: index + 1,
      source: `${p.title || 'Untitled Paper'} (${p.source || 'N/A'})`,
      url: p.url || '#',
    }));

    return { references, toolOutput };

  } catch (error) {
    const errorMsg = error.response?.data?.error || `Academic Service Error: ${error.message}`;
    throw new Error(errorMsg);
  }
}

const availableTools = {
  web_search: {
    description: "Searches the internet for real-time, up-to-date information on current events, public figures, or general knowledge.",
    execute: async (params) => {
      const { toolOutput, references } = await performWebSearch(params.query);
      return { references, toolOutput: toolOutput || "No results found from web search." };
    },
    requiredParams: ['query'],
  },
  web_crawl: {
    description: "Deep dive: Extracts full text content from a specific URL. Use this after web_search if you find a highly relevant link that needs more detailed analysis.",
    execute: async (params) => {
      const result = await crawlUrl(params.url);
      if (!result.success) return { toolOutput: `Failed to crawl URL: ${result.error}`, references: [] };
      return {
        toolOutput: `[Content from ${result.title}]\n${result.text}`,
        references: [{ source: result.title, url: result.url, number: 1 }]
      };
    },
    requiredParams: ['url'],
  },
  multi_search: {
    description: "Executes a high-powered parallel search across Web, Academic, PubMed, and Local Knowledge Base simultaneously. Best for complex research tasks.",
    execute: async (params, context) => {
      const results = await multiSourceSearch(params.query, context.userId);
      let toolOutput = `Multi-Source Search Results for "${params.query}":\n\n`;
      const references = [];

      ['web', 'academic', 'pubmed', 'local'].forEach(type => {
        const items = results[type] || [];
        if (items.length > 0) {
          toolOutput += `\n--- ${type.toUpperCase()} SOURCES ---\n`;
          items.forEach((item, idx) => {
            const refNum = references.length + 1;
            toolOutput += `[${refNum}] ${item.title} (${item.url})\n`;
            references.push({ number: refNum, source: item.title, url: item.url });
          });
        }
      });

      return { toolOutput, references };
    },
    requiredParams: ['query'],
  },
  rag_search: {
    description: "Searches the content of a specific, user-provided document to answer questions based on its text.",
    execute: async (params, context) => {
      return await queryPythonRagService(
        params.query,
        context.documentContextName,
        context.userId,
        context.criticalThinkingEnabled,
        context.filter
      );
    },
    requiredParams: ['query'],
  },
  kg_search: {
    description: "Finds structured facts and relationships within a document's pre-built knowledge graph. Use this to complement RAG search.",
    execute: async (params, context) => {
      const facts = await queryKgService(params.query, context.documentContextName, context.userId);
      return { references: [], toolOutput: facts };
    },
    requiredParams: ['query'],
  },
  academic_search: {
    description: "Finds academic papers, research articles, and scholarly publications from scientific databases.",
    execute: async (params) => {
      return await queryAcademicService(params.query);
    },
    requiredParams: ['query'],
  },
  research_synthesis: {
    description: "Synthesizes multiple gathered research sources into a structured report with citation mapping and contradiction detection. Use this as a final step for complex research.",
    execute: async (params) => {
      const report = await synthesizeMultiDocResearch(params.topic, params.sources);
      return { toolOutput: report.markdownReport, references: report.citationGraph || [] };
    },
    requiredParams: ['topic', 'sources'],
  },
  generate_document: {
    description: "Generates a document file (like a PPTX or DOCX) on a given topic using internal knowledge. Use this when the user explicitly asks to 'create', 'make', 'build', or 'generate' a file. You must infer the 'topic' and 'doc_type' from the user's query.",
    execute: async (params) => {
      return {
        toolOutput: `Successfully initiated document generation for topic '${params.topic}' as a .${params.doc_type} file.`,
        references: []
      };
    },
    requiredParams: ['topic', 'doc_type'],
  }
};

module.exports = { availableTools };
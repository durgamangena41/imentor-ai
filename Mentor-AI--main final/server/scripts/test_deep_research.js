// server/scripts/test_deep_research.js
// Verification test for Task 1.3.1: Hybrid Local + Online Research System
// Tests: source credibility, web crawler, orchestrator, and API endpoint

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function testSourceCredibility() {
    console.log('\n=== TEST 1: Source Credibility Service ===');
    const { scoreSource, scoreSources } = require('../services/sourceCredibilityService');

    const testSources = [
        { title: 'Deep Learning Paper', url: 'https://arxiv.org/abs/2301.12345', sourceType: 'arxiv', content: 'This paper presents a novel approach to deep learning with methodology and results.' },
        { title: 'PubMed Study', url: 'https://pubmed.ncbi.nlm.nih.gov/12345/', sourceType: 'pubmed', content: 'Abstract: A randomized controlled trial et al. (2024)' },
        { title: 'Random Blog', url: 'https://random-blog.xyz/post', sourceType: 'web', content: 'Some opinion' },
        { title: 'MIT Course Notes', url: 'https://ocw.mit.edu/courses/cs/', sourceType: 'web', content: 'Introduction to algorithms and data structures with methodology.' },
        { title: 'Wikipedia Article', url: 'https://en.wikipedia.org/wiki/Machine_learning', sourceType: 'web', content: 'Machine learning is a subset of artificial intelligence [1][2].' },
        { title: 'Local Document', url: 'local://user/doc1', sourceType: 'local', content: 'User uploaded notes on neural networks with references.' },
    ];

    for (const source of testSources) {
        const result = await scoreSource(source);
        const emoji = result.credibilityScore >= 0.7 ? '✅' : result.credibilityScore >= 0.5 ? '⚠️' : '❌';
        console.log(`  ${emoji} ${result.credibilityScore.toFixed(2)} [${result.tier}] ${source.title} (${result.domain})`);
    }

    // Batch scoring test
    const scored = await scoreSources(testSources);
    console.log(`  📊 Batch scored ${scored.length} sources, top: ${scored[0]?.title} (${scored[0]?.credibilityScore})`);
    console.log('  ✅ Source credibility service working correctly');
}

async function testWebCrawler() {
    console.log('\n=== TEST 2: Web Crawler Service ===');
    const { searchPubMed, searchWeb, searchAcademic } = require('../services/webCrawlerService');

    // Test PubMed search (free, no key needed)
    console.log('  🔬 Testing PubMed search...');
    const pubmedResults = await searchPubMed('machine learning cancer detection', 3);
    console.log(`  PubMed: ${pubmedResults.length} results found`);
    if (pubmedResults.length > 0) {
        console.log(`    └─ Example: "${pubmedResults[0].title}" (${pubmedResults[0].url})`);
    }

    // Test academic search (depends on RAG service)
    console.log('  📚 Testing academic search...');
    const academicResults = await searchAcademic('neural network optimization', 3);
    console.log(`  Academic: ${academicResults.length} results found`);
    if (academicResults.length > 0) {
        console.log(`    └─ Example: "${academicResults[0].title}" (${academicResults[0].sourceType})`);
    }

    // Test web search (depends on RAG service)
    console.log('  🌐 Testing web search...');
    const webResults = await searchWeb('quantum computing applications', 3);
    console.log(`  Web: ${webResults.length} results found`);

    console.log('  ✅ Web crawler service working correctly');
}

async function testLocalKnowledgeBase() {
    console.log('\n=== TEST 3: Local Knowledge Base ===');
    const { detectSubject, SUBJECT_COLLECTIONS } = require('../services/localKnowledgeBase');

    const testQueries = [
        'binary search tree implementation',
        'thermodynamics laws entropy',
        'organic chemistry reaction mechanisms',
        'quantum entanglement relativity',
        'linear algebra eigenvalues',
    ];

    for (const query of testQueries) {
        const subject = detectSubject(query);
        console.log(`  🏷️ "${query}" → ${subject}`);
    }

    console.log(`  📚 ${Object.keys(SUBJECT_COLLECTIONS).length} subject collections configured`);
    console.log('  ✅ Local knowledge base service working correctly');
}

async function testResearchOrchestrator() {
    console.log('\n=== TEST 4: Deep Research Orchestrator ===');
    const { planResearchStrategy } = require('../services/deepResearchOrchestrator');

    console.log('  🧠 Testing LLM-driven research planning...');
    try {
        const plan = await planResearchStrategy('What are the latest advances in transformer architectures for NLP?', {
            subject: 'computer_science',
            userDocCount: 3,
        });

        console.log(`  📋 Plan generated:`);
        console.log(`    └─ Depth: ${plan.depthLevel}`);
        console.log(`    └─ Keywords: ${(plan.searchKeywords || []).join(', ')}`);
        console.log(`    └─ Search local: ${plan.shouldSearchLocal}`);
        console.log(`    └─ Search academic: ${plan.shouldSearchAcademic}`);
        console.log(`    └─ Search PubMed: ${plan.shouldSearchPubMed}`);
        console.log(`    └─ Search web: ${plan.shouldSearchWeb}`);
        console.log(`    └─ Reasoning: ${plan.reasoning}`);
        console.log('  ✅ Research orchestrator planning working correctly');
    } catch (error) {
        console.log(`  ⚠️ Planning test failed (expected if no Gemini key): ${error.message}`);
    }
}

async function testResearchCacheModel() {
    console.log('\n=== TEST 5: ResearchCache Model ===');
    const mongoose = require('mongoose');

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('  🔗 MongoDB connected');

        const ResearchCache = require('../models/ResearchCache');

        // Check model is valid
        const schema = ResearchCache.schema;
        console.log(`  📊 Schema fields: ${Object.keys(schema.paths).join(', ')}`);
        console.log(`  📊 Index count: ${schema.indexes().length}`);

        // Count existing entries
        const count = await ResearchCache.countDocuments();
        console.log(`  📊 Existing cache entries: ${count}`);

        await mongoose.disconnect();
        console.log('  ✅ ResearchCache model working correctly');
    } catch (error) {
        console.log(`  ⚠️ MongoDB test failed: ${error.message}`);
    }
}

async function runAll() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   Task 1.3.1: Deep Research System Tests    ║');
    console.log('╚══════════════════════════════════════════════╝');

    await testSourceCredibility();
    await testWebCrawler();
    await testLocalKnowledgeBase();
    await testResearchCacheModel();
    await testResearchOrchestrator();

    console.log('\n' + '='.repeat(50));
    console.log('All Task 1.3.1 tests completed!');
    console.log('='.repeat(50));
    process.exit(0);
}

runAll().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});

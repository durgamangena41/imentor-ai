#!/usr/bin/env node
/**
 * Mock Ollama Service - Simplified Version
 * For development without real Ollama
 */

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = 11434;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// List models
app.get('/api/tags', (req, res) => {
  res.json({
    models: [
      { name: 'qwen2.5:14b-instruct:latest', size: 14000000000, digest: 'qwen-hash', modified_at: '2024-01-01T00:00:00Z' },
      { name: 'llama2:latest', size: 3800000000, digest: 'llama-hash', modified_at: '2024-01-01T00:00:00Z' }
    ]
  });
});

// Chat endpoint - main handler
app.post('/api/chat', (req, res) => {
  const { messages = [] } = req.body;
  
  let responseContent = 'This is a response from mock Ollama.';
  
  // Detect request type from messages and return appropriate JSON
  const fullMessage = messages.map(m => m.content).join(' ').toLowerCase();
  
  if (fullMessage.includes('isspecific') || fullMessage.includes('analyze') && fullMessage.includes('goal')) {
    // Goal analysis response
    responseContent = '{"isSpecific": true}';
  } else if (fullMessage.includes('questions') || fullMessage.includes('clarification')) {
    // Clarification questions response
    responseContent = JSON.stringify({
      "questions": [
        { "questionText": "What aspect?", "type": "text_input" },
        { "questionText": "What level?", "type": "multiple_choice", "options": ["Beginner", "Intermediate", "Advanced"] }
      ]
    });
  } else if (fullMessage.includes('modules') || fullMessage.includes('curriculum') || fullMessage.includes('context:')) {
    // Learning plan response
    responseContent = JSON.stringify({
      "modules": [
        { "title": "Fundamentals", "objective": "Core concepts", "activity": { "type": "direct_answer", "suggestedPrompt": "Explain basics" }, "status": "not_started" },
        { "title": "Practice", "objective": "Hands-on practice", "activity": { "type": "code_executor", "suggestedPrompt": "Show examples" }, "status": "locked" },
        { "title": "Advanced", "objective": "Advanced topics", "activity": { "type": "direct_answer", "suggestedPrompt": "Advanced techniques" }, "status": "locked" }
      ]
    });
  }
  
  res.json({
    model: req.body.model || 'qwen2.5:14b-instruct',
    message: { role: 'assistant', content: responseContent },
    done: true
  });
});

// Generate endpoint
app.post('/api/generate', (req, res) => {
  res.json({
    model: req.body.model || 'qwen2.5:14b-instruct',
    response: 'Mock generation response',
    done: true
  });
});

// Embeddings endpoint
app.post('/api/embeddings', (req, res) => {
  res.json({ embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1) });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎭 Mock Ollama running on port ${PORT}`);
  console.log(`💡 For production: install real Ollama from https://ollama.ai`);
});

process.on('uncaughtException', (err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

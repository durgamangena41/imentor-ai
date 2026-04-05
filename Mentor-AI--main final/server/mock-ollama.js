#!/usr/bin/env node

/**
 * Mock Ollama Service for Development
 * 
 * This service emulates the Ollama API on port 11434 
 * to allow the application to work without installing the actual Ollama.
 * 
 * For production, install the real Ollama from https://ollama.ai
 */

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = 11434;

// Mock responses for different models
const mockResponses = {
  'qwen2.5:14b-instruct': {
    model: 'qwen2.5:14b-instruct',
    response: 'This is a mock response from Qwen 2.5. Install real Ollama for actual LLM capabilities.',
    stop_reason: 'stop'
  },
  'default': {
    model: 'unknown',
    response: 'This is a mock response. Please install real Ollama for actual LLM capabilities.',
    stop_reason: 'stop'
  }
};

// Health check endpoint
app.get('/api/tags', (req, res) => {
  res.json({
    models: [
      {
        name: 'qwen2.5:14b-instruct:latest',
        modified_at: '2024-01-01T00:00:00Z',
        size: 14000000000,
        digest: 'mock-digest-qwen'
      },
      {
        name: 'llama2:latest',
        modified_at: '2024-01-01T00:00:00Z',
        size: 3800000000,
        digest: 'mock-digest-llama'
      }
    ]
  });
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mock-ollama' });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { model, messages, stream } = req.body;
  
  // Check if this is a goal analysis request
  let responseContent = 'This is a mock response from Ollama.';
  
  if (messages && messages.length > 0) {
    const lastMessage = messages[messages.length - 1].content || '';
    
    // If it looks like a goal analysis request, return JSON format
    if (lastMessage.includes('isSpecific') || lastMessage.includes('analyze') || lastMessage.includes('goal')) {
      responseContent = JSON.stringify({ isSpecific: true });
    }
    // If it looks like a clarification questions request, return JSON format
    else if (lastMessage.includes('questions') || lastMessage.includes('clarification')) {
      responseContent = JSON.stringify({
        questions: [
          {
            questionText: "What specific aspect would you like to learn?",
            type: "text_input"
          },
          {
            questionText: "What is your current skill level?",
            type: "multiple_choice",
            options: ["Beginner", "Intermediate", "Advanced"]
          }
        ]
      });
    }
    // If it looks like a plan generation request, return JSON format
    else if (lastMessage.includes('modules') || lastMessage.includes('curriculum') || lastMessage.includes('study plan') || lastMessage.includes('CONTEXT')) {
      responseContent = JSON.stringify({
        modules: [
          {
            title: "Understanding Fundamentals",
            objective: "Master the core concepts and theoretical foundation",
            activity: {
              type: "direct_answer",
              suggestedPrompt: "Explain the fundamental concepts I need to know"
            },
            status: "not_started"
          },
          {
            title: "Practical Implementation",
            objective: "Apply theory through hands-on exercises and coding",
            activity: {
              type: "code_executor",
              suggestedPrompt: "Show me how to implement this in code with examples"
            },
            status: "locked"
          },
          {
            title: "Advanced Concepts",
            objective: "Explore advanced topics and optimization techniques",
            activity: {
              type: "direct_answer",
              suggestedPrompt: "What are the advanced techniques and best practices?"
            },
            status: "locked"
          },
          {
            title: "Real-world Applications",
            objective: "Learn how this is used in production environments",
            activity: {
              type: "web_search",
              suggestedPrompt: "Find examples of this being used in real projects"
            },
            status: "locked"
          }
        ]
      });
    }
  }

  const mockResponse = mockResponses['qwen2.5:14b-instruct'] || mockResponses.default;

  if (stream) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.write(JSON.stringify({
      model: model || 'qwen2.5:14b-instruct',
      message: {
        role: 'assistant',
        content: responseContent
      },
      done: false
    }) + '\n');
    res.write(JSON.stringify({
      model: model || 'qwen2.5:14b-instruct',
      message: {
        role: 'assistant',
        content: ''
      },
      done: true,
      total_duration: 1000,
      load_duration: 500,
      prompt_eval_count: 10,
      prompt_eval_duration: 300,
      eval_count: 20,
      eval_duration: 200
    }) + '\n');
    res.end();
  } else {
    res.json({
      model: model || 'qwen2.5:14b-instruct',
      message: {
        role: 'assistant',
        content: responseContent
      },
      done: true,
      total_duration: 1000,
      load_duration: 500,
      prompt_eval_count: 10,
      prompt_eval_duration: 300,
      eval_count: 20,
      eval_duration: 200
    });
  }
});

// Generate endpoint (alternative to chat)
app.post('/api/generate', async (req, res) => {
  const { model, prompt, stream } = req.body;
  const mockResponse = mockResponses[model] || mockResponses.default;

  if (stream) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.write(JSON.stringify({
      model: model || 'qwen2.5:14b-instruct',
      response: mockResponse.response,
      done: false
    }) + '\n');
    res.write(JSON.stringify({
      model: model || 'qwen2.5:14b-instruct',
      response: '',
      done: true,
      total_duration: 1000,
      load_duration: 500,
      prompt_eval_count: 10,
      prompt_eval_duration: 300,
      eval_count: 20,
      eval_duration: 200
    }) + '\n');
    res.end();
  } else {
    res.json({
      model: model || 'qwen2.5:14b-instruct',
      response: mockResponse.response,
      done: true,
      total_duration: 1000,
      load_duration: 500,
      prompt_eval_count: 10,
      prompt_eval_duration: 300,
      eval_count: 20,
      eval_duration: 200
    });
  }
});

// Embeddings endpoint
app.post('/api/embeddings', async (req, res) => {
  const { model, prompt } = req.body;
  
  // Generate a fake embedding (usually would be 384, 768, or 1536 dimensions)
  const embedding = Array(384).fill(0).map(() => Math.random() * 2 - 1);
  
  res.json({
    embedding: embedding
  });
});

// Pull endpoint (fake pull, just return success)
app.post('/api/pull', async (req, res) => {
  const { name } = req.body;
  res.json({
    status: `Pulling model ${name} (mock - skipped in development)`
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🎭 Mock Ollama Service running on port ${PORT}`);
  console.log(`📌 This is a development mock. For production, install real Ollama from https://ollama.ai`);
  console.log(`✅ Available models: qwen2.5:14b-instruct, llama2`);
  console.log(`🔗 API: http://localhost:${PORT}`);
});

// server/scripts/seedLLMs.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const LLMConfiguration = require('../models/LLMConfiguration');

// --- The Seed Data ---
const llmSeedData = [
  // ===================================================================
  // === GEMINI MODEL (Single standardized model)                  ===
  // ===================================================================

  // 1. Gemini: Standardized single model across project
  {
    modelId: "gemini-2.0-flash",
    provider: "gemini",
    displayName: "Gemini 2.0 Flash (Default)",
    description: "Standardized Gemini model for all Gemini tasks in this project.",
    isDefault: true,
    strengths: ["chat", "creative", "summarization", "code", "technical", "reasoning"],
    subjectFocus: null
  },

  // ===================================================================
  // === OLLAMA MODELS (Each with a specific role)                   ===
  // ===================================================================

  // 5. Ollama: Default & Strong All-Rounder
  {
    modelId: "qwen2.5:3b-instruct",
    provider: "ollama",
    displayName: "Ollama qwen 2.5 14b (Default)",
    description: "A well-rounded model for general chat and creative writing.",
    isDefault: true, // Default for the OLLAMA provider.
    strengths: ["chat", "creative"],
    subjectFocus: null
  },
  // 6. Ollama: Specialized for Code Generation
  {
    modelId: "codellama:7b-instruct",
    provider: "ollama",
    displayName: "Ollama Code Llama 7B",
    description: "A specialized model that excels at code generation.",
    isDefault: false,
    strengths: ["code"],
    subjectFocus: null
  },
  // 7. Ollama: Specialized for Technical & Mathematical Tasks
  {
    modelId: "deepseek-coder:6.7b-instruct",
    provider: "ollama",
    displayName: "Ollama DeepSeek Coder 6.7B",
    description: "A top-tier model for mathematics and complex technical reasoning.",
    isDefault: false,
    strengths: ["technical", "reasoning"],
    subjectFocus: null
  },
  // 8. Ollama: Fast & Efficient Model for Summarization
  {
    modelId: "phi3:instruct",
    provider: "ollama",
    displayName: "Ollama Phi-3 Mini",
    description: "A fast and capable small model for summarization tasks.",
    isDefault: false,
    strengths: ["summarization"],
    subjectFocus: null
  },

  // ===================================================================
  // === CLAUDE MODELS (Anthropic)                                   ===
  // ===================================================================
  {
    modelId: "claude-3-5-sonnet-latest",
    provider: "claude",
    displayName: "Claude 3.5 Sonnet",
    description: "Highly intelligent and fast model from Anthropic, excellent for coding and nuanced reasoning.",
    isDefault: true,
    strengths: ["code", "reasoning", "creative"],
    subjectFocus: null
  },
  {
    modelId: "claude-3-opus-latest",
    provider: "claude",
    displayName: "Claude 3 Opus",
    description: "Anthropic's most powerful model for highly complex tasks.",
    isDefault: false,
    strengths: ["technical", "reasoning"],
    subjectFocus: null
  },

  // ===================================================================
  // === MISTRAL MODELS                                              ===
  // ===================================================================
  {
    modelId: "mistral-large-latest",
    provider: "mistral",
    displayName: "Mistral Large",
    description: "Flagship Mistral model with excellent multilingual support and reasoning capabilities.",
    isDefault: true,
    strengths: ["multilingual", "reasoning"],
    subjectFocus: null
  },

  // ===================================================================
  // === OPENAI MODELS                                              ===
  // ===================================================================
  {
    modelId: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    description: "OpenAI's most advanced multimodal model, superb for general tasks and reasoning.",
    isDefault: true,
    strengths: ["chat", "reasoning", "technical"],
    subjectFocus: null
  },

  // ===================================================================
  // === FINE-TUNED MODELS                                           ===
  // ===================================================================
  {
    modelId: "fine-tuned/physics-v1-on-qwen2",
    provider: "fine-tuned",
    displayName: "Physics Expert (Qwen 2.5 Base)",
    description: "A model fine-tuned specifically on advanced physics textbooks.",
    isDefault: false,
    strengths: ["technical", "reasoning"],
    subjectFocus: "Physics"
  }
];

const seedLLMConfigurations = async () => {
  // ... The rest of this function remains exactly the same and will handle updates correctly ...
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not found in .env file. Aborting.');
    process.exit(1);
  }

  try {
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully.');

    const existingConfigs = await LLMConfiguration.find().select('modelId').lean();
    const existingModelIds = new Set(existingConfigs.map(config => config.modelId));

    const modelsToInsert = llmSeedData.filter(seed => !existingModelIds.has(seed.modelId));
    const modelsToUpdate = llmSeedData.filter(seed => existingModelIds.has(seed.modelId));

    if (modelsToUpdate.length > 0) {
      console.log(`Found ${modelsToUpdate.length} existing LLM configurations to update.`);
      for (const modelData of modelsToUpdate) {
        await LLMConfiguration.updateOne({ modelId: modelData.modelId }, { $set: modelData });
        console.log(`- Updated ${modelData.displayName}`);
      }
    }

    if (modelsToInsert.length === 0) {
      console.log('No new LLM configurations to add.');
    } else {
      console.log(`Found ${modelsToInsert.length} new LLM configurations to add.`);
      const inserted = await LLMConfiguration.insertMany(modelsToInsert);
      console.log('Successfully seeded the following new models:');
      inserted.forEach(doc => console.log(`- ${doc.displayName} (${doc.modelId})`));
    }

  } catch (error) {
    console.error('An error occurred during the seeding process:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nMongoDB connection closed. Seeder finished.');
  }
};

seedLLMConfigurations();
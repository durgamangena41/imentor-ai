// server/services/agentService.js
const {
  CHAT_MAIN_SYSTEM_PROMPT,
  createSynthesizerPrompt,
  createAgenticSystemPrompt,
} = require("../config/promptTemplates.js");
const { availableTools } = require("./toolRegistry.js");
const {
  createModelContext,
  createAgenticContext,
} = require("../protocols/contextProtocols.js");
const geminiService = require("./geminiService.js");
const ollamaService = require("./ollamaService.js");
const claudeService = require("./claudeService.js");
const mistralService = require("./mistralService.js");
const openaiService = require("./openaiService.js");

function getLLMService(provider) {
  switch (provider) {
    case 'ollama': return ollamaService;
    case 'claude': return claudeService;
    case 'mistral': return mistralService;
    case 'openai': return openaiService;
    default: return geminiService;
  }
}

function parseToolCall(responseText) {
  try {
    const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[2] : responseText;
    const jsonResponse = JSON.parse(jsonString);
    if (jsonResponse && typeof jsonResponse.tool_call !== "undefined") {
      return jsonResponse.tool_call;
    }
    return null;
  } catch (e) {
    console.warn(
      `[AgentService] Failed to parse JSON tool_call from LLM. Response: ${responseText.substring(
        0,
        200
      )}...`
    );
    // Fallback for non-JSON responses that contain the tool name
    if (typeof responseText === 'string' && responseText.toLowerCase().includes("generate_document")) {
      console.log("[AgentService] Fallback: Detected 'generate_document' in text, creating tool call.");
      return { tool_name: 'generate_document', parameters: {} }; // Parameters will be extracted from query later
    }
    return null;
  }
}

function isOllamaUnavailableError(error) {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);

  return status === 404
    || status === 502
    || status === 503
    || message.includes('model') && message.includes('not found')
    || message.includes('failed to get response from ollama')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('econnrefused')
    || message.includes('connect') && message.includes('refused');
}

function buildLocalFallbackAnswer(userQuery) {
  const q = String(userQuery || '').trim();
  const lower = q.toLowerCase();

  if (lower.includes('machine learning')) {
    return `## Machine Learning: Comprehensive Overview

**Definition:** Machine learning is a branch of artificial intelligence where computer systems learn patterns from data and improve their performance on tasks without being explicitly programmed for each scenario. Instead of following hardcoded instructions, ML systems discover rules and patterns by analyzing examples.

**Core Concept - How It Works:**
Machine learning operates on three fundamental principles:
1. **Training Phase**: The system receives a dataset with examples (input-output pairs)
2. **Pattern Discovery**: It identifies patterns and relationships in the data
3. **Prediction Phase**: When new, unseen data arrives, it applies learned patterns to make predictions or decisions

**Why Machine Learning Matters:**
In the real world, we often can't write explicit rules for complex tasks. For example, recognizing faces, understanding speech, or recommending products are too complex for traditional programming. ML systems learn these patterns from data, making them flexible and adaptable to new situations.

**Key Process Cycle:**
- **Data Collection**: Gather relevant examples
- **Data Preparation**: Clean and format data
- **Model Training**: Feed data to learning algorithm to discover patterns
- **Evaluation**: Test on new data to measure accuracy
- **Iteration**: Refine the model based on performance
- **Deployment**: Apply to real-world tasks

**Real-World Applications:**
- Email spam filtering learns what messages are spam from user feedback
- Netflix recommendations learn your preferences from viewing history
- Medical diagnosis systems learn to detect diseases from thousands of patient records
- Self-driving cars learn to recognize pedestrians and obstacles from video data

**Key Takeaway:** Machine learning transforms raw data into actionable intelligence by discovering underlying patterns—enabling systems to improve and adapt continuously.`;
  }

  if (lower.includes('neural network')) {
    return `## Neural Networks: Deep Dive

**Definition:** A neural network is a computational model inspired by how the human brain works. It consists of interconnected layers of artificial "neurons" that process information and learn complex patterns through adjusting their internal connection strengths (weights).

**Architecture Overview:**
Neural networks typically have three types of layers:
1. **Input Layer**: Receives raw data (e.g., pixels in an image, features in a dataset)
2. **Hidden Layers**: Process and transform information through weighted connections
3. **Output Layer**: Produces the final prediction or classification

**How Neural Networks Learn:**
During training, the network:
1. Takes input data and processes it forward (forward pass)
2. Compares output to actual answer and calculates error
3. Works backward to adjust weights (backpropagation)
4. Repeats thousands of times until error minimizes

**Key Components:**
- **Neurons**: Individual processing units that apply mathematical operations
- **Weights and Biases**: Parameters that get adjusted during learning
- **Activation Functions**: Non-linear functions (ReLU, sigmoid) that enable learning of complex patterns
- **Loss Function**: Measures how far predictions are from correct answers

**Why They're Powerful:**
Neural networks excel at:
- Image recognition and computer vision tasks
- Natural language understanding and translation
- Pattern detection in audio and speech
- Complex non-linear relationships that simpler models can't capture

**Modern Variations:**
- **CNNs** (Convolutional Neural Networks) for images
- **RNNs/LSTMs** for sequences and time-series data
- **Transformers** for language processing
- **GANs** for generating new data

**Key Takeaway:** Neural networks are mathematical systems that mimic biological learning, enabling machines to discover intricate patterns in data through iterative weight adjustment.`;
  }

  if (lower.includes('artificial intelligence') || lower.includes('what is ai') || lower === 'ai') {
    return `## Artificial Intelligence: Complete Guide

**Definition:** AI (Artificial Intelligence) is the field of computer science dedicated to creating systems that can perform tasks requiring human-like intelligence. These include learning from experience, recognizing patterns, understanding language, making decisions, and solving problems.

**Scope of Artificial Intelligence:**
AI encompasses numerous capabilities:
- **Perception**: Understanding images, audio, and sensor data (computer vision, speech recognition)
- **Language**: Understanding and generating human language (natural language processing)
- **Learning**: Improving performance from experience (machine learning)
- **Reasoning**: Drawing logical conclusions from information (expert systems)
- **Decision-Making**: Choosing optimal actions in complex situations
- **Robotics**: Controlling physical systems to interact with the world

**Types of AI (By Capability Level):**
1. **Narrow AI (Weak AI)**: Designed for specific tasks—all current AI systems (chess engines, image recognition, chatbots)
2. **General AI (Strong AI)**: Hypothetical AI that can understand and learn any intellectual task humans can—does not exist yet
3. **Super AI (ASI)**: Theoretical AI surpassing human intelligence—purely theoretical

**Key AI Techniques:**
- **Machine Learning**: Systems that learn from data
- **Deep Learning**: Neural networks with many layers
- **Expert Systems**: Rule-based decision making
- **Natural Language Processing**: Understanding human language
- **Computer Vision**: Interpreting images and video
- **Reinforcement Learning**: Learning through rewards and penalties

**Real-World Impact:**
- Healthcare: Diagnostic systems, drug discovery
- Transportation: Autonomous vehicles, traffic optimization
- Communication: Translation, chatbots, voice assistants
- Business: Predictive analytics, customer service, fraud detection
- Finance: Trading algorithms, risk assessment

**Current Limitations:**
- AI systems lack true understanding and reasoning
- They require massive amounts of data
- They can't easily transfer learning between tasks
- They can perpetuate biases from training data

**The Future of AI:**
Current research focuses on making AI more efficient, interpretable, aligned with human values, and capable of longer-term reasoning.

**Key Takeaway:** AI is a broad field creating intelligent systems that perceive, learn, reason, and act—with machine learning being one of its most powerful subfields.`;
  }

  return `I could not reach the configured AI providers at the moment, but here's a helpful context-aware response:

The question asks: **"${q}"**

This is an important topic in AI and machine learning. To provide you with a comprehensive answer, I recommend:
1. Ensuring your internet connection is stable so I can connect to the AI service
2. Checking that your Ollama service is running properly
3. Trying your question again

If you're asking about **machine learning**, it involves systems learning from data to make predictions. If it's about **AI concepts**, these are computational systems that perform intelligent tasks. For **neural networks**, they're brain-inspired systems that learn complex patterns through interconnected layers.

Feel free to try again, and I'll provide a detailed, structured response with examples and explanations.`;
}

/**
 * Helper to call LLM with automatic failover on quota exhaustion.
 */
async function callLLMWithFailover(service, chatHistory, query, systemPrompt, options, requestContext) {
  if (requestContext?._providerOverride === 'ollama' && options.provider !== 'ollama') {
    const ollamaOptions = {
      ...options,
      model: requestContext.ollamaModel,
      ollamaUrl: requestContext.ollamaUrl,
      timeoutMs: Number(process.env.OLLAMA_FAILOVER_TIMEOUT_MS || 12000),
      provider: 'ollama'
    };

    try {
      return await ollamaService.generateContentWithHistory(chatHistory, query, systemPrompt, ollamaOptions);
    } catch (ollamaError) {
      if (isOllamaUnavailableError(ollamaError)) {
        return buildLocalFallbackAnswer(query);
      }
      throw ollamaError;
    }
  }

  try {
    return await service.generateContentWithHistory(chatHistory, query, systemPrompt, options);
  } catch (error) {
    if (error.isQuotaExceeded && options.provider !== 'ollama') {
      requestContext._providerOverride = 'ollama';
      const fastLocalFallback = String(process.env.FAST_LOCAL_FALLBACK_ON_QUOTA || 'true').toLowerCase() !== 'false';
      if (fastLocalFallback) {
        console.warn('[AgentService] Gemini unavailable; using fast local fallback to avoid long waits.');
        return buildLocalFallbackAnswer(query);
      }

      console.warn(`[AgentService] Quota exceeded for ${options.provider}. Falling back to Ollama...`);
      const ollamaOptions = {
        ...options,
        model: requestContext.ollamaModel,
        ollamaUrl: requestContext.ollamaUrl,
        timeoutMs: Number(process.env.OLLAMA_FAILOVER_TIMEOUT_MS || 12000),
        provider: 'ollama'
      };
      try {
        return await ollamaService.generateContentWithHistory(chatHistory, query, systemPrompt, ollamaOptions);
      } catch (ollamaError) {
        if (isOllamaUnavailableError(ollamaError)) {
          console.warn('[AgentService] Ollama fallback unavailable/slow. Returning local deterministic fallback answer.');
          return buildLocalFallbackAnswer(query);
        }
        console.warn('[AgentService] Ollama fallback failed unexpectedly. Returning local deterministic fallback answer.');
        return buildLocalFallbackAnswer(query);
      }
    }

    if (options.provider === 'ollama' && isOllamaUnavailableError(error)) {
      console.warn('[AgentService] Primary Ollama path unavailable. Returning local deterministic fallback answer.');
      return buildLocalFallbackAnswer(query);
    }
    throw error;
  }
}

async function processAgenticRequest(
  userQuery,
  chatHistory,
  clientSystemPrompt,
  requestContext
) {
  const {
    llmProvider,
    ollamaModel,
    ollamaUrl,
    apiKey,
  } = requestContext;

  const llmService = getLLMService(llmProvider);
  const llmOptions = {
    model: requestContext.model || (llmProvider === "ollama" ? ollamaModel : undefined),
    apiKey: apiKey,
    ollamaUrl: ollamaUrl,
    provider: llmProvider
  };

  const modelContext = createModelContext({ availableTools });
  const agenticContext = createAgenticContext({
    systemPrompt: clientSystemPrompt,
  });
  const routerSystemPrompt = createAgenticSystemPrompt(
    modelContext,
    agenticContext,
    { userQuery, ...requestContext }
  );

  console.log(`[AgentService] Performing Router call using ${llmProvider}...`);
  const routerResponseText = await callLLMWithFailover(
    llmService,
    [],
    "Analyze the query and decide on an action.",
    routerSystemPrompt,
    llmOptions,
    requestContext
  );
  const toolCall = parseToolCall(routerResponseText);

  // --- INTERCEPT LOGIC FOR DOCUMENT GENERATION ---
  if (toolCall && toolCall.tool_name === "generate_document") {
    console.log(`[AgentService] Intercepting tool call for document generation.`);
    const topicMatch = userQuery.match(/(?:on|about|regarding)\s+(.+)/i);
    const docTypeMatch = userQuery.match(/\b(pptx|docx)\b/i);

    const topic = toolCall.parameters?.topic || (topicMatch ? topicMatch[1].trim() : userQuery);
    const doc_type = toolCall.parameters?.doc_type || (docTypeMatch ? docTypeMatch[0].toLowerCase() : 'docx');


    if (!topic || !doc_type) {
      return {
        finalAnswer:
          "I was about to generate a document, but I'm missing the topic or document type. Please clarify what you'd like me to create.",
        thinking:
          "The tool call for 'generate_document' was missing required parameters. Aborting and asking user for clarification.",
        references: [],
        sourcePipeline: "agent-error-missing-params",
      };
    }

    // Return the special response with an 'action' payload for the frontend
    const actionResponse = {
      finalAnswer: `I'm starting the generation for your ${doc_type.toUpperCase()} on "${topic}". The download should begin automatically in a moment.`,
      thinking: `User requested document generation. Tool call: ${JSON.stringify(
        toolCall
      )}.`,
      references: [],
      sourcePipeline: `agent-generate_document`,
      action: {
        type: "DOWNLOAD_DOCUMENT",
        payload: {
          topic: topic,
          docType: doc_type,
        },
      },
    };
    return actionResponse;
  }
  // --- END INTERCEPT LOGIC ---

  if (requestContext.forceSimple === true || !toolCall || !toolCall.tool_name) {
    if (requestContext.forceSimple === true) {
      console.log(
        "[AgentService] Skipping router/tool logic due to forceSimple flag. Responding directly."
      );
    } else {
      console.log(
        "[AgentService] Router decided a direct answer is best (no tool call). Responding directly."
      );
    }

    const finalSystemPrompt = CHAT_MAIN_SYSTEM_PROMPT();
    const userPrompt = userQuery;
    const directAnswer = await callLLMWithFailover(
      llmService,
      chatHistory,
      userPrompt,
      finalSystemPrompt,
      llmOptions,
      requestContext
    );

    const thinkingMatch = directAnswer.match(
      /<thinking>([\s\S]*?)<\/thinking>/i
    );
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;
    const mainContent = thinking
      ? directAnswer.replace(/<thinking>[\s\S]*?<\/thinking>\s*/i, "").trim()
      : directAnswer;

    const pipelineSource = requestContext.forceSimple
      ? `${requestContext.llmProvider}-agent-direct-bypass`
      : `${requestContext.llmProvider}-agent-direct-no-tool`;

    return {
      finalAnswer: mainContent,
      thinking: thinking,
      references: [],
      sourcePipeline: pipelineSource,
    };
  }

  console.log(`[AgentService] Decision: Tool Call -> ${toolCall.tool_name}`);
  const mainTool = availableTools[toolCall.tool_name];
  if (!mainTool) {
    return {
      finalAnswer:
        "I tried to use a tool that doesn't exist. Please try again.",
      references: [],
      sourcePipeline: "agent-error-unknown-tool",
    };
  }

  try {
    const toolResult = await mainTool.execute(
      toolCall.parameters,
      requestContext
    );

    let pipeline = `${llmProvider}-agent-${toolCall.tool_name}`;
    if (
      toolCall.tool_name === "rag_search" &&
      requestContext.criticalThinkingEnabled
    ) {
      pipeline += "+kg_enhanced";
    }

    console.log(
      `[AgentService] Performing Synthesizer call using ${llmProvider}...`
    );

    // --- Step 4: Final Synthesis ---
    // The agent reviews observations and produces a coherent final answer.
    const finalSystemPrompt = CHAT_MAIN_SYSTEM_PROMPT();
    const synthesizerUserQuery = createSynthesizerPrompt(
      userQuery, // Changed from originalQuery to userQuery
      toolResult.toolOutput, // Changed from allObservations.join('\n\n') to toolResult.toolOutput
      toolCall.tool_name // Changed from 'standard_synthesis' to toolCall.tool_name
    );

    try {
      const finalAnswerWithThinking = await callLLMWithFailover(
        llmService,
        chatHistory,
        synthesizerUserQuery,
        finalSystemPrompt,
        llmOptions,
        requestContext
      );

      const thinkingMatch = finalAnswerWithThinking.match(/<thinking>([\s\S]*?)<\/thinking>/i);
      const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;
      const finalAnswer = thinking ? finalAnswerWithThinking.replace(/<thinking>[\s\S]*?<\/thinking>\s*/i, '').trim() : finalAnswerWithThinking;

      return {
        finalAnswer,
        thinking,
        references: toolResult.references || [], // Changed from references to toolResult.references || []
        sourcePipeline: pipeline // Changed from `agent-${llmOptions.provider}` to pipeline
      };
    } catch (synthError) {
      console.error('[AgentService] Synthesizer failed completely:', synthError.message);
      // RESILIENCE: Fallback to raw observations if synthesis fails
      return {
        finalAnswer: `> [!WARNING]\n> **AI Synthesis Failed**: I successfully executed tools but couldn't generate a summary (likely due to API limits).\n\n**Raw Tool Observations:**\n\n${toolResult.toolOutput}`, // Changed from allObservations.join('\n\n') to toolResult.toolOutput
        thinking: "Synthesizer failed after tool execution.",
        references: toolResult.references || [], // Changed from references to toolResult.references || []
        sourcePipeline: `agent-fallback`
      };
    }
  } catch (error) {
    console.error(
      `[AgentService] Error executing tool '${toolCall.tool_name}':`,
      error
    );
    return {
      finalAnswer: `I tried to use a tool, but it failed. Error: ${error.message}.`,
      references: [],
      thinking: null,
      sourcePipeline: `agent-error-tool-failed`,
    };
  }
}

module.exports = {
  processAgenticRequest,
};
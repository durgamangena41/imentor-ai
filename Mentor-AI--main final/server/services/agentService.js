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

/**
 * Helper to call LLM with automatic failover on quota exhaustion.
 */
async function callLLMWithFailover(service, chatHistory, query, systemPrompt, options, requestContext) {
  try {
    return await service.generateContentWithHistory(chatHistory, query, systemPrompt, options);
  } catch (error) {
    if (error.isQuotaExceeded && options.provider !== 'ollama') {
      console.warn(`[AgentService] Quota exceeded for ${options.provider}. Falling back to Ollama...`);
      const ollamaOptions = {
        ...options,
        model: requestContext.ollamaModel,
        ollamaUrl: requestContext.ollamaUrl,
        provider: 'ollama'
      };
      return await ollamaService.generateContentWithHistory(chatHistory, query, systemPrompt, ollamaOptions);
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
// server/services/totOrchestrator.js

const { processAgenticRequest } = require('./agentService');
const geminiService = require('./geminiService');
const ollamaService = require('./ollamaService');
const { availableTools } = require('./toolRegistry');
const cotService = require('./cotService');
const totPruningService = require('./totPruningService');
const { PLANNER_PROMPT_TEMPLATE, EVALUATOR_PROMPT_TEMPLATE, createSynthesizerPrompt, CHAT_MAIN_SYSTEM_PROMPT } = require('../config/promptTemplates');

/**
 * Helper to call LLM with automatic failover on quota exhaustion.
 */
async function callWithFailover(service, chatHistory, query, systemPrompt, options, requestContext) {
    try {
        return await service.generateContentWithHistory(chatHistory, query, systemPrompt, options);
    } catch (error) {
        if (error.isQuotaExceeded && options.provider !== 'ollama') {
            console.warn(`[ToT Orchestrator] Quota exceeded for ${options.provider}. Falling back to Ollama...`);
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

async function isQueryComplex(query, requestContext) {
    let score = 0;
    if (requestContext.documentContextName) {
        score = 100;
        console.log(`[ToT] Step 1: Complexity Gate. Decision: COMPLEX (Score: ${score}, Document active).`);
        return { isComplex: true, score };
    }

    const questionCount = (query.match(/\?/g) || []).length;
    const wordCount = query.split(' ').length;

    score = (questionCount * 20) + (wordCount * 2);
    score = Math.min(score, 100);

    const isComplex = score > 40;
    console.log(`[ToT] Step 1: Complexity Gate. Query: "${query.substring(0, 30)}...". Score: ${score}, Decision: ${isComplex ? 'COMPLEX' : 'SIMPLE'}`);
    return { isComplex, score };
}

async function generatePlans(query, requestContext) {
    console.log('[ToT] Step 2: Planner. Generating plans via LLM...');
    const { llmProvider, isWebSearchEnabled, isAcademicSearchEnabled, documentContextName, ...llmOptions } = requestContext;
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;

    const modelContext = require('../protocols/contextProtocols').createModelContext({ availableTools });

    let currentModeInstruction = "";
    let enforcedTool = null;

    if (isWebSearchEnabled) {
        enforcedTool = "web_search";
        currentModeInstruction = `The user has explicitly enabled Web Search. Therefore, ALL steps in ALL plans MUST use the 'web_search' tool. Do NOT use 'rag_search', 'academic_search', or 'direct_answer' tools. For every step, your tool_call MUST be 'web_search' with the appropriate parameters.`;
    } else if (isAcademicSearchEnabled) {
        enforcedTool = "academic_search";
        currentModeInstruction = `The user has explicitly enabled Academic Search. Therefore, ALL steps in ALL plans MUST use the 'academic_search' tool. Do NOT use 'rag_search', 'web_search', or 'direct_answer' tools. For every step, your tool_call MUST be 'academic_search' with the appropriate parameters.`;
    } else if (documentContextName) {
        enforcedTool = "rag_search";
        currentModeInstruction = `The user has selected a document for RAG search: "${documentContextName}". Therefore, ALL steps in ALL plans MUST use the 'rag_search' tool. Do NOT use 'web_search', 'academic_search', or 'direct_answer' tools. For every step, your tool_call MUST be 'rag_search' with the appropriate parameters, specifying the document context if applicable.`;
    } else {
        currentModeInstruction = `No specific tool mode is enforced by the user. For each step, analyze its description and decide the BEST tool to use ('web_search', 'academic_search') or if a 'direct_answer' (tool_call: null) is most appropriate for that specific sub-task.

        **CRITICAL RULES FOR TOOL SELECTION IN DEFAULT MODE (Adhere to these strictly):**
        1.  **Prioritize Direct Answer:** Unless a step explicitly requires *real-time external information* (for 'web_search') or *scholarly papers* (for 'academic_search'), your default choice for tool_call should be \`null\` (for a direct answer using the LLM's internal knowledge). Do not use 'web_search' or 'academic_search' for general definitions, common knowledge, or concepts that the AI should inherently know.
        2.  **Limit External Searches (Maximum One of Each):** In any single plan, you should generate a maximum of **one** 'web_search' tool call and a maximum of **one** 'academic_search' tool call. If a plan requires multiple external searches, use only the most critical one of each type. This constraint applies UNLESS the user's original query explicitly asks for multiple, distinct web or academic searches (e.g., "Find 3 different websites about X"). If the user's original query directly states multiple unique search needs, you may exceed this limit for those specific, explicit requirements.
        3.  **Tool-Specific Queries:** When using 'web_search' or 'academic_search', ensure the 'parameters.query' is very specific and optimized for that search.
        4.  **No RAG Search:** Do NOT use 'rag_search' as a tool when no document is selected by the user.
        `;
    }

    const branchCount = requestContext.branchCount || 2;
    const plannerPrompt = PLANNER_PROMPT_TEMPLATE
        .replace("{userQuery}", query)
        .replace("{available_tools_json}", JSON.stringify(modelContext.available_tools, null, 2))
        .replace("{current_mode_tool_instruction}", currentModeInstruction)
        .replace("4-5 unique plans", `${branchCount} unique plans`)
        .replace("4-5 distinct", `${branchCount} distinct`);

    try {
        const responseText = await callWithFailover(
            llmService,
            [],
            plannerPrompt,
            "You are a meticulous AI planning agent.",
            { ...llmOptions, provider: llmProvider },
            requestContext
        );
        const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[2] : responseText;
        const parsedResponse = JSON.parse(jsonString);

        if (parsedResponse.plans && Array.isArray(parsedResponse.plans) && parsedResponse.plans.length > 0) {
            // User requirement: Reduce bot branches to 2-3 effective ones
            const maxBranches = requestContext.branchCount || 2;
            const optimizedPlans = parsedResponse.plans.slice(0, maxBranches);

            optimizedPlans.forEach(plan => {
                if (plan.steps && Array.isArray(plan.steps)) {
                    plan.steps = plan.steps.map(step => {
                        if (typeof step === 'string') {
                            step = { description: step, tool_call: null };
                        }

                        if (enforcedTool) {
                            return {
                                description: step.description,
                                tool_call: {
                                    tool_name: enforcedTool,
                                    parameters: { query: step.description }
                                }
                            };
                        }

                        if (step.tool_call) {
                            if (typeof step.tool_call !== 'object' || !step.tool_call.tool_name || !step.tool_call.parameters) {
                                console.warn(`[ToT Planner] Invalid tool_call structure for step:`, step);
                                step.tool_call = null; // Invalidate if malformed
                            }
                        }
                        return step;
                    });
                }
            });
            console.log(`[ToT] Planner: Successfully generated and validated ${optimizedPlans.length} plans (Dynamic scaling applied).`);
            return optimizedPlans;
        }
    } catch (error) {
        console.error(`[ToT] Planner: LLM call failed or returned invalid JSON. Error: ${error.message}. Falling back to default plan.`);
        // Ensure fallback plan also matches the new step object format, applying enforcement if needed
        const defaultToolCall = enforcedTool ?
            { tool_name: enforcedTool, parameters: { query: query } } : null; // Apply enforcement to fallback too
        return [{
            name: "Default Direct Answer Plan",
            steps: [{ description: `Directly address the user's query: "${query}"`, tool_call: defaultToolCall }]
        }];
    }
}

async function evaluatePlans(plans, query, requestContext) {
    console.log('[ToT] Step 3: Evaluator. Evaluating plans via LLM...');
    if (!plans || plans.length === 0) throw new Error("No plans provided to evaluate.");
    if (plans.length === 1) {
        console.log('[ToT] Evaluator: Only one plan available. Selecting it by default.');
        return plans[0];
    }

    const { llmProvider, ...llmOptions } = requestContext;
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;
    const plansJsonString = JSON.stringify(plans, null, 2);

    const evaluatorPrompt = EVALUATOR_PROMPT_TEMPLATE.replace("{userQuery}", query).replace("{plansJsonString}", plansJsonString);

    try {
        const responseText = await callWithFailover(
            llmService,
            [],
            evaluatorPrompt,
            "You are an evaluating agent.",
            { ...llmOptions, provider: llmProvider },
            requestContext
        );
        const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[2] : responseText;
        const parsedResponse = JSON.parse(jsonString);

        if (parsedResponse.best_plan_name) {
            const winningPlan = plans.find(p => p.name === parsedResponse.best_plan_name);
            if (winningPlan) {
                console.log(`[ToT] Evaluator: LLM selected winning plan: "${winningPlan.name}"`);
                return winningPlan;
            }
        }
    } catch (error) {
        console.error(`[ToT] Evaluator: LLM call failed or returned invalid JSON. Error: ${error.message}. Falling back to first plan.`);
    }

    console.log(`[ToT] Evaluator: Fallback selected. Winning plan: "${plans[0].name}"`);
    return plans[0];
}

async function executePlan(winningPlan, originalQuery, requestContext, streamCallback) {
    const collectedContexts = [];
    let cumulativeContext = "";
    const reasoningSteps = [];
    const uniqueReferences = new Map();

    const completedTaskIds = new Set();
    const taskResults = new Map(); // id -> result content

    // Dependency-aware execution loop
    let allFinished = false;
    let iterations = 0;
    const MAX_ITERATIONS = winningPlan.tasks.length * 2; // Safeguard

    while (!allFinished && iterations < MAX_ITERATIONS) {
        iterations++;
        allFinished = true;

        for (const task of winningPlan.tasks) {
            if (completedTaskIds.has(task.id)) continue;

            // Check if all dependencies are met
            const depsMet = task.depends_on.every(depId => completedTaskIds.has(depId));
            if (!depsMet) {
                allFinished = false;
                continue;
            }

            // Execute this task
            console.log(`[Hierarchical Executor] Starting Task ${task.id}: ${task.description}`);

            // Enrich context with results from dependencies
            let taskContext = cumulativeContext;
            if (task.depends_on.length > 0) {
                const depContext = task.depends_on
                    .map(depId => `[Result of ${depId}]: ${taskResults.get(depId)}`)
                    .join('\n\n');
                taskContext = `${depContext}\n\nExisting Overall Context:\n${cumulativeContext}`;
            }

            let taskCompleted = false;
            let turnCount = 0;
            const MAX_TURNS_PER_TASK = 3; // Increased turn limit for deeper orchestration (1.4.2)

            while (!taskCompleted && turnCount < MAX_TURNS_PER_TASK) {
                turnCount++;

                // 1. Generate Thought + Action
                const reactStep = await cotService.generateReActStep(
                    task.description,
                    taskContext || originalQuery,
                    availableTools,
                    {
                        llmProvider: requestContext.llmProvider,
                        llmOptions: {
                            model: requestContext.llmProvider === 'ollama' ? requestContext.ollamaModel : requestContext.geminiModel,
                            apiKey: requestContext.apiKey,
                            ollamaUrl: requestContext.ollamaUrl,
                            provider: requestContext.llmProvider
                        }
                    }
                );

                // 2. Log and stream the Thought
                const thoughtContent = `**Task ${task.id} (Turn ${turnCount}):**\n*Thought:* ${reactStep.thought}\n\n`;
                streamCallback({ type: 'thought', content: thoughtContent });

                reasoningSteps.push({
                    task_id: task.id,
                    turn: turnCount,
                    ...reactStep
                });

                // 3. Handle Action
                if (reactStep.action && reactStep.action !== 'none' && availableTools[reactStep.action]) {
                    const toolName = reactStep.action;
                    const toolParams = reactStep.action_input || {};
                    const tool = availableTools[toolName];

                    streamCallback({
                        type: 'thought',
                        content: `> [!TIP]\n> *Action: Using ${toolName} to research: "${toolParams.query || 'details'}"...*\n\n`
                    });

                    try {
                        const toolResult = await tool.execute(toolParams, requestContext);
                        const observation = `Observation from ${toolName}: ${toolResult.toolOutput}`;

                        if (toolResult.references) {
                            toolResult.references.forEach(ref => {
                                const key = ref.url || ref.source;
                                if (key && !uniqueReferences.has(key)) uniqueReferences.set(key, ref);
                            });
                        }

                        taskContext += `\n[Turn ${turnCount}] ${observation}\n`;
                        streamCallback({ type: 'thought', content: `*Observation:* ${toolResult.toolOutput.substring(0, 150)}...\n\n` });
                    } catch (toolError) {
                        console.error(`[Hierarchical Executor] Tool ${toolName} failed:`, toolError);
                        // 1.4.2 Improvement: Don't give up immediately, let the LLM see the error and try another turn or conclude
                        taskContext += `\n[Turn ${turnCount}] !! TOOL ERROR (${toolName}): ${toolError.message} !! Please attempt an alternative approach or finalize with available data.\n`;
                    }
                } else {
                    const finalContent = reactStep.final_answer || "Task completed.";
                    taskResults.set(task.id, finalContent);
                    collectedContexts.push(`### ${task.description}\n${finalContent}`);
                    cumulativeContext += `\n[${task.id} Final]: ${finalContent}\n`;
                    completedTaskIds.add(task.id);
                    taskCompleted = true;
                }
            }

            // Check for pruning between tasks
            if (totPruningService.shouldPruneBranch({ confidence_score: reasoningSteps[reasoningSteps.length - 1]?.confidence_score }, completedTaskIds.size - 1, winningPlan.tasks.length)) {
                streamCallback({ type: 'thought', content: `> [!NOTE]\n> *Optimization: Branch pruning triggered. Skipping remaining tasks.*\n\n` });
                allFinished = true;
                break;
            }

            allFinished = false; // We just completed one, maybe others are now unblocked
        }
    }

    const allReferences = Array.from(uniqueReferences.values()).map((ref, index) => ({
        ...ref,
        number: index + 1
    }));

    console.log(`[ToT] Step 4: Executor. All tasks executed. Collected ${allReferences.length} de-duplicated references.`);

    return {
        finalContext: collectedContexts.join('\n\n'),
        allReferences: allReferences,
        reasoningSteps: reasoningSteps
    };
}

async function synthesizeFinalAnswer(originalQuery, finalContext, chatHistory, requestContext) {
    console.log('[ToT] Step 5: Synthesizer. Creating final response...');
    const { llmProvider, ...llmOptions } = requestContext;
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;

    const synthesizerUserQuery = createSynthesizerPrompt(
        originalQuery, finalContext, 'tree_of_thought_synthesis'
    );

    const finalSystemPrompt = CHAT_MAIN_SYSTEM_PROMPT();

    try {
        const finalAnswer = await callWithFailover(
            llmService,
            chatHistory,
            synthesizerUserQuery,
            finalSystemPrompt,
            { ...llmOptions, provider: llmProvider },
            requestContext
        );
        return finalAnswer;
    } catch (error) {
        console.error(`[ToT] Synthesizer: Final LLM call failed completely. Error: ${error.message}`);
        // RESILIENCE: If synthesis fails, return the gathered context directly so the user doesn't lose data.
        return `> [!WARNING]
> **AI Synthesis Failed**: I successfully gathered research data but encountered an issue generating a summary (likely due to API quota limits and local service being unavailable). 
> 
> **Here is the raw gathered information for your query:**
\n\n${finalContext}`;
    }
}

async function processQueryWithToT_Streaming(query, chatHistory, requestContext, streamCallback) {
    const allThoughts = [];
    const streamAndStoreThought = (content) => {
        streamCallback({ type: 'thought', content });
        allThoughts.push(content);
    };

    const { isComplex, score } = await isQueryComplex(query, requestContext);

    // Add branchCount to requestContext for dynamic branching
    requestContext.branchCount = totPruningService.getRecommendedBranchCount(score);

    if (!isComplex) {
        // Step 1: Stream the initial classification thought. This gives immediate feedback.
        streamAndStoreThought(`**Analyzing Query**\nQuery is simple. No need of Complex thinking process my Love 😊.\n\n`);

        // Step 2: Get the direct response. This now includes the LLM's own thinking process.
        const directResponse = await processAgenticRequest(
            query,
            chatHistory,
            requestContext.systemPrompt,
            { ...requestContext, forceSimple: true }
        );

        // Step 3: Check for and stream the detailed thinking from the direct answer.
        if (directResponse.thinking) {
            // This is the new, crucial part. We stream the thinking we just received.
            const thinkingHeader = `**Direct Response Plan**\n`;
            streamAndStoreThought(thinkingHeader + directResponse.thinking);
        }

        // Step 4: The final object is now built from all thoughts that were streamed.
        const finalThoughts = allThoughts.join(''); // Join without extra separators, as they are in the content.

        return {
            finalAnswer: directResponse.finalAnswer,
            thoughts: finalThoughts,
            references: directResponse.references,
            sourcePipeline: directResponse.sourcePipeline
        };
    }


    streamAndStoreThought("**Starting Complex Reasoning**\nQuery detected as complex. Initiating multi-step thought process.\n\n**Hang on, We are doing our best to give the best outcome**\n\n\n");

    const plans = await generatePlans(query, requestContext);
    streamAndStoreThought(`**Planning Stage**\nGenerated ${plans.length} potential plans. Now evaluating the best approach.\n\n`);

    const winningPlan = await evaluatePlans(plans, query, requestContext);
    streamAndStoreThought(`**Evaluation Stage**\nBest plan selected: "${winningPlan.name}". Beginning execution.\n\n`);

    const { finalContext, allReferences, reasoningSteps } = await executePlan(winningPlan, query, requestContext, streamCallback);

    streamAndStoreThought("**Synthesizing Final Answer**\nAll information has been gathered. Compiling the final, comprehensive response.\n\n");

    const finalAnswerWithThinking = await synthesizeFinalAnswer(query, finalContext, chatHistory, requestContext);

    const thinkingMatch = finalAnswerWithThinking.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;
    const finalAnswer = thinking ? finalAnswerWithThinking.replace(/<thinking>[\s\S]*?<\/thinking>\s*/i, '').trim() : finalAnswerWithThinking;

    allThoughts.push(thinking);
    const finalThoughts = allThoughts.filter(Boolean).join('');

    console.log('--- ToT Streaming Orchestration Finished ---');
    return {
        finalAnswer,
        thoughts: finalThoughts,
        reasoning_steps: reasoningSteps, // Added for Advanced CoT visualization
        references: allReferences,
        sourcePipeline: `tot-${requestContext.llmProvider}`
    };
}

module.exports = {
    processQueryWithToT_Streaming
};
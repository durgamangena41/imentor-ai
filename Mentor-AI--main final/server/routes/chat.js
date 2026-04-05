// server/routes/chat.js
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const ChatHistory = require('../models/ChatHistory');
const User = require('../models/User');
const { processQueryWithToT_Streaming } = require('../services/totOrchestrator');
const { analyzeAndRecommend } = require('../services/sessionAnalysisService');
const { processAgenticRequest } = require('../services/agentService');
const { generateCues } = require('../services/criticalThinkingService');
const { decrypt } = require('../utils/crypto');
const { redisClient } = require('../config/redisClient');
const { analyzePrompt } = require('../services/promptCoachService');
const { extractAndStoreKgFromText } = require('../services/kgExtractionService');
const { logger } = require('../utils/logger');
const { auditLog } = require('../utils/logger');
const { selectLLM } = require('../services/llmRouterService');
const LLMPerformanceLog = require('../models/LLMPerformanceLog');
const { processTutorResponse, getTutorSessionState, setTutorSessionState, clearTutorSessionState, startSocraticSession, SOCRATIC_STATES, getTopicContext } = require('../services/socraticTutorService');
const contextManager = require('../services/contextManager');

// Gamification imports
const gamificationService = require('../services/gamificationService');
const streakService = require('../services/streakService');
const energyService = require('../services/energyService');

// Contextual Memory imports
const { injectContextualMemory, analyzeAndUpdateKnowledgeState, triggerPeriodicAnalysis } = require('../middleware/contextualMemoryMiddleware');
const knowledgeStateService = require('../services/knowledgeStateService');

const router = express.Router();


function streamEvent(res, eventData) {
    if (res.writableEnded) {
        console.warn('[Chat Route Stream] Attempted to write to an already closed stream.');
        return;
    }
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
}



function doesQuerySuggestRecall(query) {
    const lowerCaseQuery = query.toLowerCase();
    const recallKeywords = [
        'my name', 'my profession', 'i am', 'i told you',
        'remember', 'recall', 'remind me', 'go back to',
        'previously', 'before', 'we discussed', 'we were talking about',
        'earlier', 'yesterday', 'last session',
        'what did i say', 'what was', 'what were', 'who am i',
        'do you know', 'can you tell me again',
        'continue with', 'let\'s continue', 'pick up where we left off',
    ];
    return recallKeywords.some(keyword => lowerCaseQuery.includes(keyword));
}



router.post('/message', injectContextualMemory, async (req, res) => {
    let {
        query, sessionId, useWebSearch, useAcademicSearch,
        systemPrompt: clientProvidedSystemInstruction, criticalThinkingEnabled,
        documentContextName, filter, bountyId, bountyAnswer
    } = req.body;

    // Robust Tutor Mode detection
    let tutorMode = req.body.tutorMode || req.body.isTutorMode || req.body.tutor_mode;

    // Auto-enable logic
    if (query) {
        const lowerQuery = query.toLowerCase();
        if (lowerQuery.startsWith('tutor:') ||
            lowerQuery.startsWith('teach me') ||
            lowerQuery.startsWith('learn ')) {

            tutorMode = true;
            console.log(`[Chat Route] Tutor Mode auto-enabled via query trigger "${lowerQuery.substring(0, 10)}..."`);
        }
    }

    // FORCE DISABLE CRITICAL THINKING IN TUTOR MODE TO AVOID CONFLICTS
    if (tutorMode) {
        if (criticalThinkingEnabled) {
            console.log('[Chat Route] ⚠️  Tutor Mode active: Forcing criticalThinkingEnabled = FALSE');
            criticalThinkingEnabled = false;
        }
    }

    console.log('[Chat Route] Request Body Keys:', Object.keys(req.body));
    console.log(`[Chat Route] Tutor Mode Flag: ${tutorMode} (Raw intent: ${req.body.tutorMode})`);

    const userId = req.user._id;

    auditLog(req, 'CHAT_MESSAGE_SENT', {
        queryLength: query.length,
        useWebSearch: !!useWebSearch,
        useAcademicSearch: !!useAcademicSearch,
        criticalThinkingEnabled: !!criticalThinkingEnabled,
        tutorModeEnabled: !!tutorMode,
        documentContext: documentContextName || null,
        llmProvider: req.user?.preferredLlmProvider || 'gemini'
    });


    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: 'Session ID required.' });
    }

    const userMessageForDb = { role: 'user', parts: [{ text: query }], timestamp: new Date() };
    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, CriticalThinking=${criticalThinkingEnabled}, Query: "${query.substring(0, 50)}..."`);
    const startTime = Date.now();

    try {
        // First, check if the session ID exists and who it belongs to.
        // This prevents DuplicateKey errors if an old session ID from another user is used.
        const chatSession = await ChatHistory.findOne({ sessionId: sessionId });

        if (chatSession && chatSession.userId.toString() !== userId.toString()) {
            console.warn(`[Chat Route] Unauthorized access attempt: User ${userId} tried to access session ${sessionId} belonging to user ${chatSession.userId}`);
            return res.status(403).json({ message: 'Unauthorized access to this chat session.' });
        }

        const user = await User.findById(userId).select('+encryptedApiKey preferredLlmProvider ollamaModel ollamaUrl apiKeyRequestStatus').lean();

        if (user?.preferredLlmProvider === 'gemini' && user?.apiKeyRequestStatus === 'pending' && !user?.encryptedApiKey) {
            console.warn(`[Chat Route] Denying chat access for user ${userId} due to pending API key request.`);
            const err = new Error('Your request for an API key is pending approval. You cannot start a conversation until the administrator approves your request.');
            err.status = 403; // Forbidden
            throw err;
        }

        const historyFromDb = chatSession ? chatSession.messages : [];
        const chatContext = { userId, subject: documentContextName, chatHistory: historyFromDb, user: user };
        const { chosenModel, logic: routerLogic, queryCategory, isABTest } = await selectLLM(query.trim(), chatContext);
        const llmConfig = {
            llmProvider: chosenModel.provider,
            geminiModel: chosenModel.provider === 'gemini' ? chosenModel.modelId : null,
            ollamaModel: chosenModel.provider === 'ollama' ? (chosenModel.modelId.includes('/') ? chosenModel.modelId.split('/')[1] : chosenModel.modelId) : null,
            apiKey: user?.encryptedApiKey ? decrypt(user.encryptedApiKey) : null,
            ollamaUrl: user?.ollamaUrl
        };

        const summaryFromDb = chatSession ? chatSession.summary || "" : "";
        const historyForLlm = [];

        if (summaryFromDb && doesQuerySuggestRecall(query.trim())) {
            historyForLlm.push({ role: 'user', parts: [{ text: `CONTEXT (Summary of Past Conversations): """${summaryFromDb}"""` }] });
            historyForLlm.push({ role: 'model', parts: [{ text: "Understood. I will use this context if the user's query is about our past conversations." }] });
        }

        const formattedDbMessages = historyFromDb.map(msg => ({ role: msg.role, parts: msg.parts.map(part => ({ text: part.text || '' })) }));
        historyForLlm.push(...formattedDbMessages);

        // Use contextual memory system prompt if available
        const contextualSystemPrompt = req.contextualMemory?.systemPrompt;
        const finalSystemPrompt = contextualSystemPrompt || clientProvidedSystemInstruction;

        const requestContext = {
            documentContextName, criticalThinkingEnabled, filter,
            userId: userId.toString(),
            systemPrompt: finalSystemPrompt,
            isWebSearchEnabled: !!useWebSearch,
            isAcademicSearchEnabled: !!useAcademicSearch,
            ...llmConfig
        };

        // --- Milestone 1.5.2: Context Window Management ---
        const managedHistory = await contextManager.manageContext(historyForLlm, requestContext);

        let agentResponse;

        // --- TUTOR MODE INTERCEPT (Stream 2: Socratic Reasoning Loop) ---
        if (tutorMode) {
            const tutorState = await getTutorSessionState(sessionId);

            if (tutorState) {
                console.log(`[Chat Route] Tutor Mode active for session ${sessionId}. Processing Socratic loop.`);

                const tutorResult = await processTutorResponse(query.trim(), sessionId, llmConfig, formattedDbMessages, finalSystemPrompt);

                if (tutorResult) {
                    // Trigger real-time knowledge update
                    knowledgeStateService.updateKnowledgeRealTime(userId, sessionId, 'TUTOR_ASSESSMENT', {
                        conceptName: tutorResult.moduleTitle,
                        classification: tutorResult.classification,
                        reasoning: tutorResult.reasoning
                    }, llmConfig);
                    // --- MASTERY HANDLING ---
                    if (tutorResult.isMastered) {
                        console.log(`[Chat Route] *** MASTERY ACHIEVED for module: "${tutorResult.moduleTitle}" ***`);

                        // Clear tutor state so next module can start fresh
                        const { clearTutorSessionState } = require('../services/socraticTutorService');
                        await clearTutorSessionState(sessionId);

                        const masteryReply = {
                            sender: 'bot',
                            role: 'model',
                            text: tutorResult.followUpQuestion,
                            parts: [{ text: tutorResult.followUpQuestion }],
                            timestamp: new Date(),
                            source_pipeline: 'tutor-mastery',
                            socraticState: tutorResult.socraticState,
                            thinking: `Classification: ${tutorResult.classification}. Mastery achieved for "${tutorResult.moduleTitle}".`,
                            criticalThinkingCues: [] // Disabled in tutor mode
                        };

                        // Save to database
                        const aiMessageForDb = {
                            role: 'model',
                            parts: [{ text: tutorResult.followUpQuestion }],
                            timestamp: new Date(),
                            source_pipeline: 'tutor-mastery'
                        };
                        await ChatHistory.findOneAndUpdate(
                            { sessionId, userId },
                            { $push: { messages: { $each: [userMessageForDb, aiMessageForDb] } } },
                            { upsert: true }
                        );

                        // Trigger contextual memory analysis
                        const messageCount = (chatSession?.messages?.length || 0) + 2;
                        triggerPeriodicAnalysis(sessionId, userId, messageCount, llmConfig);

                        return res.status(200).json({ reply: masteryReply });
                    }
                    // --- END MASTERY HANDLING ---

                    console.log(`[Chat Route] Socratic follow-up generated. Classification: ${tutorResult.classification}, Move: ${tutorResult.pedagogicalMove}`);

                    // Create the response in the expected format
                    const socraticReply = {
                        sender: 'bot',
                        role: 'model',
                        text: tutorResult.followUpQuestion,
                        parts: [{ text: tutorResult.followUpQuestion }],
                        timestamp: new Date(),
                        source_pipeline: `tutor-${tutorResult.pedagogicalMove?.toLowerCase() || 'socratic'}`,
                        socraticState: tutorResult.socraticState,
                        thinking: `Classification: ${tutorResult.classification}. Move: ${tutorResult.pedagogicalMove}. ${tutorResult.reasoning || ''}`,
                        criticalThinkingCues: [] // Disabled in tutor mode
                    };

                    // Save to database
                    const aiMessageForDb = {
                        role: 'model',
                        parts: [{ text: tutorResult.followUpQuestion }],
                        timestamp: new Date(),
                        source_pipeline: socraticReply.source_pipeline
                    };
                    await ChatHistory.findOneAndUpdate(
                        { sessionId, userId },
                        { $push: { messages: { $each: [userMessageForDb, aiMessageForDb] } } },
                        { upsert: true }
                    );

                    // Trigger contextual memory analysis
                    const messageCount = (chatSession?.messages?.length || 0) + 2;
                    triggerPeriodicAnalysis(sessionId, userId, messageCount, llmConfig);

                    return res.status(200).json({ reply: socraticReply });
                }
            } else {
                // --- AUTO-INITIALIZE TUTOR SESSION ---
                // First message in Tutor Mode: Extract topic and generate initial Socratic question
                const rawQuery = query.trim();

                // --- TOPIC EXTRACTION ---
                // Remove common filler words to get the clean topic
                let moduleTitle = rawQuery
                    .replace(/^(tell me about|explain|what is|how does|teach me|i want to learn about|describe|what's|who is)\s+/i, '')
                    .replace(/\?$/, '')
                    .trim();

                // Capitalize first letter of each word for better display
                moduleTitle = moduleTitle.split(' ').map(word =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                ).join(' ');

                console.log(`[Chat Route] Tutor Mode: Auto-initializing for topic: "${moduleTitle}" (extracted from "${rawQuery}")`);

                // NEW: Fetch Context from Curriculum Graph & Qdrant
                let ragContext = "";
                try {
                    const topicContext = await getTopicContext("Machine Learning", moduleTitle);

                    if (topicContext && topicContext.qdrant_chunks && topicContext.qdrant_chunks.length > 0) {
                        ragContext = topicContext.qdrant_chunks
                            .map(chunk => chunk.text)
                            .join('\n\n')
                            .slice(0, 1500); // Limit context size

                        console.log(`[Chat Route] Injected ${topicContext.qdrant_chunks.length} RAG chunks for topic "${moduleTitle}"`);
                    }
                } catch (e) {
                    console.warn(`[Chat Route] Failed to fetch topic context: ${e.message}`);
                }

                const initialResponse = await startSocraticSession(moduleTitle, ragContext, llmConfig);

                // Initialize tutor state
                const newTutorState = {
                    moduleTitle,
                    lastQuestion: initialResponse,
                    turnCount: 0,
                    startedAt: new Date().toISOString(),
                    socraticState: SOCRATIC_STATES.INTRODUCTION,
                    consecutiveUnderstands: 0
                };

                await setTutorSessionState(sessionId, newTutorState);

                // Create the initial Socratic response
                const introReply = {
                    sender: 'bot',
                    role: 'model',
                    text: initialResponse,
                    parts: [{ text: initialResponse }],
                    timestamp: new Date(),
                    source_pipeline: 'tutor-introduction',
                    socraticState: SOCRATIC_STATES.INTRODUCTION,
                    thinking: `Tutor Mode initialized for topic: "${moduleTitle}". Starting with personalization + diagnostic questions.`,
                    criticalThinkingCues: [] // Disabled in tutor mode
                };

                // Save to database
                const aiMessageForDb = {
                    role: 'model',
                    parts: [{ text: initialResponse }],
                    timestamp: new Date(),
                    source_pipeline: 'tutor-introduction'
                };
                await ChatHistory.findOneAndUpdate(
                    { sessionId, userId },
                    { $push: { messages: { $each: [userMessageForDb, aiMessageForDb] } } },
                    { upsert: true }
                );

                return res.status(200).json({ reply: introReply });
            }
        }
        // --- END TUTOR MODE INTERCEPT ---

        if (criticalThinkingEnabled) {
            // --- Logic for STREAMING response ---
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const accumulatedThoughts = [];

            // NEW: Prioritize expert acknowledgment for returning users
            const expertAck = req.contextualMemory?.expertAcknowledgment;
            const standardAck = await knowledgeStateService.getAcknowledgmentPrefix(userId, query);

            const ackPrefix = expertAck || standardAck;
            if (ackPrefix) {
                streamEvent(res, { type: 'text', content: ackPrefix });
                logger.info(`[Chat] Sent ${expertAck ? 'expert' : 'standard'} acknowledgment for user ${userId}`);
            }

            const interceptingStreamCallback = (eventData) => {
                if (eventData.type === 'thought') accumulatedThoughts.push(eventData.content);
                streamEvent(res, eventData);
            };

            const totResult = await processQueryWithToT_Streaming(query.trim(), managedHistory, requestContext, interceptingStreamCallback);
            const endTime = Date.now();
            const cues = await generateCues(totResult.finalAnswer, llmConfig);

            agentResponse = { ...totResult, thinking: accumulatedThoughts.join(''), criticalThinkingCues: cues };

            // 1. Create Log Entry AFTER getting the final answer
            const logEntry = new LLMPerformanceLog({
                userId,
                sessionId,
                query: query.trim(),
                response: agentResponse.finalAnswer, // <-- THIS IS THE NEW LINE
                chosenModelId: chosenModel.modelId,
                routerLogic: routerLogic,
                queryCategory: queryCategory,
                isABTest: isABTest,
                responseTimeMs: endTime - startTime
            });
            await logEntry.save();
            // --- END MODIFICATION (Streaming Path) ---

            // 2. Inject logId into the response object
            agentResponse.logId = logEntry._id;

            // ... (rest of the streaming logic remains the same)
            // 3. Prepare message for DB and save it ONCE.
            const aiMessageForDb = {
                ...agentResponse,
                sender: 'bot',
                role: 'model',
                text: agentResponse.finalAnswer,
                parts: [{ text: agentResponse.finalAnswer }],
                timestamp: new Date()
            };
            delete aiMessageForDb.criticalThinkingCues;
            delete aiMessageForDb.sender;
            delete aiMessageForDb.text;
            delete aiMessageForDb.action;

            await ChatHistory.findOneAndUpdate({ sessionId, userId }, { $push: { messages: { $each: [userMessageForDb, aiMessageForDb] } } }, { upsert: true });

            // 4. Trigger KG extraction
            if (agentResponse.finalAnswer) {
                extractAndStoreKgFromText(agentResponse.finalAnswer, sessionId, userId, llmConfig);
            }

            // 5. GAMIFICATION: Evaluate answer quality and award XP (async, don't block response)
            (async () => {
                try {
                    // Update streak on activity
                    const streakUpdate = await streakService.updateStreak(userId);

                    // Get user profile for level-adjusted XP
                    const profile = await gamificationService.getOrCreateProfile(userId);
                    const userLevel = profile?.level || 1;

                    // Evaluate answer quality with advanced multi-dimensional analysis
                    const advancedXPEvaluator = require('../services/advancedXPEvaluator');
                    const evaluation = await advancedXPEvaluator.evaluateMessageQuality(
                        query.trim(),
                        agentResponse.finalAnswer,
                        {
                            user,
                            topic: documentContextName || 'general',
                            userLevel
                        }
                    );

                    // Apply streak multiplier to XP
                    const creditsMultiplier = streakUpdate.multiplier || 1.0;
                    const baseCredits = evaluation.xpAward; // Advanced evaluator returns xpAward (1-20)
                    const finalCredits = Math.round(baseCredits * creditsMultiplier);

                    // Award Learning Credits
                    await gamificationService.awardLearningCredits(
                        userId,
                        finalCredits,
                        evaluation.reasoning,
                        documentContextName || 'general'
                    );

                    // Update topic score for leaderboard
                    if (documentContextName) {
                        const currentScore = profile.topicScores.get(documentContextName) || 0;
                        await gamificationService.updateTopicScore(userId, documentContextName, currentScore + finalCredits);
                    }

                    // Detect fatigue and update energy
                    const { fatigueScore } = await energyService.detectFatigue(userId, sessionId);
                    await energyService.updateEnergyBar(userId, fatigueScore);

                    console.log(`[Gamification] User ${userId} earned ${finalXP} XP (${baseXP} × ${xpMultiplier}) - ${evaluation.reasoning}`);
                    if (evaluation.feedback) {
                        console.log(`[Gamification] Tip: ${evaluation.feedback}`);
                    }
                } catch (gamError) {
                    console.error('[Gamification] Error in background gamification:', gamError);
                }
            })();

            // 5.5 Handle bounty submission if bountyId is provided
            let bountyResult = null;
            if (bountyId && bountyAnswer) {
                try {
                    const bountyService = require('../services/bountyService');
                    bountyResult = await bountyService.submitBountyAnswer(bountyId, userId, bountyAnswer);
                    console.log(`[Bounty] User ${userId} submitted answer for bounty ${bountyId}:`, bountyResult);
                } catch (bountyError) {
                    console.error('[Bounty] Error submitting bounty answer:', bountyError);
                }
            }

            // 6. Send final event and close stream
            const finalAnswerContent = bountyResult ? { ...agentResponse, bountyResult } : agentResponse;
            streamEvent(res, { type: 'final_answer', content: finalAnswerContent });
            res.end();

        } else {
            // --- Logic for STANDARD JSON response ---
            const startTime = Date.now(); // Moved start time here
            agentResponse = await processAgenticRequest(query.trim(), managedHistory, clientProvidedSystemInstruction, requestContext);
            const endTime = Date.now();

            // --- START MODIFICATION (Non-Streaming Path) ---
            // 1. Create the Performance Log Entry with the response
            const logEntry = new LLMPerformanceLog({
                userId,
                sessionId,
                query: query.trim(),
                response: agentResponse.finalAnswer, // <-- THIS IS THE NEW LINE
                chosenModelId: chosenModel.modelId,
                routerLogic: routerLogic,
                queryCategory: queryCategory,
                isABTest: isABTest,
                responseTimeMs: endTime - startTime
            });
            await logEntry.save();
            console.log(`[PerformanceLog] Logged decision for session ${sessionId} with logId: ${logEntry._id}.`);
            // --- END MODIFICATION (Non-Streaming Path) ---

            // 1.5 Handle bounty submission if bountyId is provided
            let bountyResult = null;
            if (bountyId && bountyAnswer) {
                try {
                    const bountyService = require('../services/bountyService');
                    bountyResult = await bountyService.submitBountyAnswer(bountyId, userId, bountyAnswer);
                    console.log(`[Bounty] User ${userId} submitted answer for bounty ${bountyId}:`, bountyResult);
                } catch (bountyError) {
                    console.error('[Bounty] Error submitting bounty answer:', bountyError);
                }
            }

            // 2. Build the FINAL AI message object for both DB and Client
            const finalAiMessage = {
                sender: 'bot',
                role: 'model',
                text: agentResponse.finalAnswer,
                parts: [{ text: agentResponse.finalAnswer }],
                timestamp: new Date(),
                thinking: agentResponse.thinking || null,
                reasoning_steps: agentResponse.reasoning_steps || [],
                references: agentResponse.references || [],
                source_pipeline: agentResponse.sourcePipeline,
                action: agentResponse.action || null,
                logId: logEntry._id, // Attach the log ID
                criticalThinkingCues: await generateCues(agentResponse.finalAnswer, llmConfig)
            };

            // 3. Create a clean version for the database (without frontend-specific fields)
            const messageForDb = { ...finalAiMessage };
            delete messageForDb.sender;
            delete messageForDb.text;
            delete messageForDb.criticalThinkingCues;
            delete messageForDb.action;

            // 4. Save to Database ONCE
            await ChatHistory.findOneAndUpdate(
                { sessionId, userId },
                { $push: { messages: { $each: [userMessageForDb, messageForDb] } } },
                { upsert: true }
            );

            // 5. GAMIFICATION: Background processing (async, non-blocking)
            (async () => {
                try {
                    // Update streak
                    const streakUpdate = await streakService.updateStreak(userId);

                    // Get user profile for level-adjusted XP
                    const profile = await gamificationService.getOrCreateProfile(userId);
                    const userLevel = profile?.level || 1;

                    // Evaluate quality with advanced multi-dimensional analysis
                    const advancedXPEvaluator = require('../services/advancedXPEvaluator');
                    logger.info(`[Chat] 🎯 Starting Bloom's taxonomy evaluation for user ${userId}`);

                    const evaluation = await advancedXPEvaluator.evaluateMessageQuality(
                        query.trim(),
                        agentResponse.finalAnswer,
                        {
                            user,
                            topic: documentContextName || 'general',
                            userLevel
                        }
                    );

                    const creditsMultiplier = streakUpdate.multiplier || 1.0;
                    const baseCredits = evaluation.xpAward; // Advanced evaluator (1-20 XP)
                    const finalCredits = Math.round(baseCredits * creditsMultiplier);

                    logger.info(`[Chat] 💎 Awarding ${finalCredits} Learning Credits (base: ${baseCredits}, multiplier: ${creditsMultiplier}, Bloom's: ${evaluation.reasoning})`);

                    await gamificationService.awardLearningCredits(
                        userId,
                        finalCredits,
                        evaluation.reasoning,
                        documentContextName || 'general'
                    );

                    // Update topic score
                    if (documentContextName) {
                        const currentScore = profile.topicScores.get(documentContextName) || 0;
                        await gamificationService.updateTopicScore(userId, documentContextName, currentScore + finalCredits);
                    }

                    // Energy tracking
                    const { fatigueScore } = await energyService.detectFatigue(userId, sessionId);
                    await energyService.updateEnergyBar(userId, fatigueScore);

                    console.log(`[Gamification] User ${userId} earned ${finalXP} XP (${baseXP} × ${xpMultiplier}) - ${evaluation.reasoning}`);
                    if (evaluation.feedback) {
                        console.log(`[Gamification] Tip: ${evaluation.feedback}`);
                    }
                } catch (gamError) {
                    console.error('[Gamification] Background error:', gamError);
                }
            })();

            // 6. PREPEND ACKNOWLEDGMENT FOR STRUGGLING TOPICS OR EXPERT USERS (Guaranteed to appear!)
            const expertAck = req.contextualMemory?.expertAcknowledgment;
            const standardAck = await knowledgeStateService.getAcknowledgmentPrefix(userId, query);

            const ackPrefix = expertAck || standardAck;
            if (ackPrefix) {
                // Update both text and parts for consistency
                finalAiMessage.text = ackPrefix + finalAiMessage.text;
                if (finalAiMessage.parts && finalAiMessage.parts[0]) {
                    finalAiMessage.parts[0].text = ackPrefix + finalAiMessage.parts[0].text;
                }
                console.log(`✨ [DEBUG] Prepended ${expertAck ? 'expert' : 'standard'} acknowledgment for query: ${query.substring(0, 30)}...`);
            }

            // 7. Send final response to client
            res.status(200).json({ reply: finalAiMessage, bountyResult });

            // 7. Trigger background KG extraction
            if (agentResponse.finalAnswer) {
                extractAndStoreKgFromText(agentResponse.finalAnswer, sessionId, userId, llmConfig);
            }

            // 8. Trigger contextual memory update (background, non-blocking)
            const messageCount = (chatSession?.messages?.length || 0) + 2; // +2 for user and AI message just added
            triggerPeriodicAnalysis(sessionId, userId, messageCount, llmConfig);
        }

        // --- FIX ---
        // The redundant, common DB save logic that was here has been removed.
        // --- END FIX ---

    } catch (error) {
        console.error(`!!! Error processing chat message for Session ${sessionId}:`, error);
        const clientMessage = error.message || "Failed to get response from AI service.";

        if (res.headersSent && !res.writableEnded) {
            streamEvent(res, { type: 'error', content: clientMessage });
            res.end();
        } else if (!res.headersSent) {
            res.status(error.status || 500).json({ message: clientMessage });
        }
    }
});


router.post('/history', async (req, res) => {
    const { previousSessionId, skipAnalysis } = req.body;
    const userId = req.user._id;
    const newSessionId = uuidv4();

    auditLog(req, 'NEW_CHAT_SESSION_CREATED', {
        previousSessionId: previousSessionId || null,
        skipAnalysis: !!skipAnalysis
    });

    // This will hold our final response payload
    const responsePayload = {
        message: 'New session started.',
        newSessionId: newSessionId,
        studyPlanSuggestion: null // Default to null
    };

    try {
        if (previousSessionId && !skipAnalysis) {
            const previousSession = await ChatHistory.findOne({ sessionId: previousSessionId, userId: userId });

            if (previousSession && previousSession.messages?.length > 1) {
                console.log(`[Chat Route] Finalizing previous session '${previousSessionId}'...`);

                const user = await User.findById(userId).select('profile preferredLlmProvider ollamaModel ollamaUrl +encryptedApiKey');
                const llmConfig = {
                    llmProvider: user?.preferredLlmProvider || 'gemini',
                    ollamaModel: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL,
                    apiKey: user?.encryptedApiKey ? decrypt(user.encryptedApiKey) : null,
                    ollamaUrl: user?.ollamaUrl || null
                };

                const { summary, knowledgeGaps, recommendations, keyTopics } = await analyzeAndRecommend(
                    previousSession.messages, previousSession.summary,
                    llmConfig.llmProvider, llmConfig.ollamaModel, llmConfig.apiKey, llmConfig.ollamaUrl
                );

                // [GAMIFICATION] Generate 5 Challenges based on Session Summary
                try {
                    console.log(`[Chat Route] Generating batch of 5 challenges for session ${previousSessionId}...`);
                    const generatedBounties = await gamificationService.generateSessionChallenges(userId, summary, previousSessionId);

                    if (generatedBounties.length === 0 && keyTopics && keyTopics.length > 0) {
                        // Fallback: If summary-based generation failed, try generating based on the main topic
                        console.log(`[Chat Route] Summary-based generation returned 0. Fallback: Generating individual challenges for topic "${keyTopics[0]}"`);
                        // Generate 3-5 challenges for the main topic
                        for (let i = 0; i < 5; i++) {
                            await gamificationService.createChallenge(userId, keyTopics[0]);
                        }
                    } else {
                        console.log(`[Chat Route] Successfully generated ${generatedBounties.length} challenges.`);
                    }

                } catch (genError) {
                    console.error('[Chat Route] Error generating session challenges:', genError);
                }

                await ChatHistory.updateOne(
                    { sessionId: previousSessionId, userId: userId },
                    { $set: { summary: summary } }
                );

                if (knowledgeGaps && knowledgeGaps.size > 0) {
                    user.profile.performanceMetrics.clear();
                    knowledgeGaps.forEach((score, topic) => {
                        user.profile.performanceMetrics.set(topic.replace(/\./g, '-'), score);
                    });
                    await user.save();
                    console.log(`[Chat Route] Updated user performance metrics with ${knowledgeGaps.size} new gaps.`);

                    let mostSignificantGap = null;
                    let lowestScore = 1.1;

                    knowledgeGaps.forEach((score, topic) => {
                        if (score < lowestScore) {
                            lowestScore = score;
                            mostSignificantGap = topic;
                        }
                    });

                    if (mostSignificantGap && lowestScore < 0.6) {
                        console.log(`[Chat Route] SIGNIFICANT KNOWLEDGE GAP DETECTED: "${mostSignificantGap}" (Score: ${lowestScore}). Generating study plan suggestion.`);
                        responsePayload.studyPlanSuggestion = {
                            topic: mostSignificantGap,
                            reason: `Analysis of your last session shows this is a key area for improvement.`
                        };
                    }
                }

                if (keyTopics && keyTopics.length > 0 && !responsePayload.studyPlanSuggestion) {
                    const primaryTopic = keyTopics[0];
                    console.log(`[Chat Route] Focused topic detected: "${primaryTopic}". Generating study plan suggestion.`);
                    responsePayload.studyPlanSuggestion = {
                        topic: primaryTopic,
                        reason: `Your last session focused on ${primaryTopic}. Would you like to create a structured study plan to master it?`
                    };
                }

                if (redisClient && redisClient.isOpen && recommendations && recommendations.length > 0) {
                    const cacheKey = `recommendations:${newSessionId}`;
                    await redisClient.set(cacheKey, JSON.stringify(recommendations), { EX: 3600 });
                    console.log(`[Chat Route] Caching ${recommendations.length} quick recommendations for new session ${newSessionId}.`);
                }
            }
        }

        await ChatHistory.create({ userId, sessionId: newSessionId, messages: [] });
        console.log(`[Chat Route] New session ${newSessionId} created. Sending response to user ${userId}.`);
        res.status(200).json(responsePayload);

    } catch (error) {
        console.error(`Error during finalize-and-create-new process:`, error);
        if (!res.headersSent) {
            try {
                await ChatHistory.create({ userId, sessionId: newSessionId, messages: [] });
                responsePayload.message = 'New session started, but analysis of previous session failed.';
                res.status(200).json(responsePayload);
            } catch (fallbackError) {
                res.status(500).json({ message: 'A critical error occurred while creating a new session.' });
            }
        }
    }
});

router.get('/sessions', async (req, res) => {
    try {
        const sessions = await ChatHistory.find({ userId: req.user._id }).sort({ updatedAt: -1 }).select('sessionId createdAt updatedAt messages').lean();
        const sessionSummaries = sessions.map(session => {
            const firstUserMessage = session.messages?.find(m => m.role === 'user');
            let preview = firstUserMessage?.parts?.[0]?.text?.substring(0, 75) || 'Chat Session';
            if (preview.length === 75) preview += '...';
            return { sessionId: session.sessionId, createdAt: session.createdAt, updatedAt: session.updatedAt, messageCount: session.messages?.length || 0, preview: preview };
        });
        res.status(200).json(sessionSummaries);
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve chat sessions.' });
    }
});

router.get('/session/:sessionId', async (req, res) => {
    try {
        const session = await ChatHistory.findOne({ sessionId: req.params.sessionId, userId: req.user._id }).lean();
        if (!session) return res.status(404).json({ message: 'Chat session not found or access denied.' });

        const messagesForFrontend = (session.messages || []).map(msg => ({
            id: msg._id || uuidv4(),
            sender: msg.role === 'model' ? 'bot' : 'user',
            text: msg.parts?.[0]?.text || '',
            thinking: msg.thinking,
            reasoning_steps: msg.reasoning_steps || [],
            references: msg.references,
            timestamp: msg.timestamp,
            source_pipeline: msg.source_pipeline,
            logId: msg.logId || null
        }));

        res.status(200).json({ ...session, messages: messagesForFrontend });
    } catch (error) {
        console.error(`!!! Error fetching chat session ${req.params.sessionId} for user ${req.user._id}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat session details.' });
    }
});

router.delete('/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user._id;
    try {
        const result = await ChatHistory.deleteOne({ sessionId: sessionId, userId: userId });
        if (redisClient && redisClient.isOpen) {
            const cacheKey = `session:${sessionId}`;
            await redisClient.del(cacheKey);
        }
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Chat session not found.' });
        }
        res.status(200).json({ message: 'Chat session deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting chat session.' });
    }
});


// @route   POST /api/chat/analyze-prompt
// @desc    Analyze a user's prompt and suggest improvements.
// @access  Private
router.post('/analyze-prompt', async (req, res) => {
    const { prompt } = req.body;
    const userId = req.user._id;

    auditLog(req, 'PROMPT_COACH_REQUESTED', {
        promptLength: prompt ? prompt.length : 0
    });


    // --- REVISED VALIDATION ---
    if (!prompt || typeof prompt !== 'string') {
        console.warn(`[API /analyze-prompt] Bad Request from user ${userId}: 'prompt' field is missing or not a string. Received body:`, req.body);
        return res.status(400).json({ message: "'prompt' field is missing or invalid." });
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 3) { // <-- The changed value
        console.warn(`[API /analyze-prompt] Bad Request from user ${userId}: Prompt is too short. Received: "${trimmedPrompt}"`);
        return res.status(400).json({ message: `Prompt must be at least 3 characters long.` }); // <-- The changed message
    }
    // --- END REVISED VALIDATION ---

    try {
        const analysis = await analyzePrompt(userId, trimmedPrompt);
        res.status(200).json(analysis);
    } catch (error) {
        console.error(`[API /analyze-prompt] Error for user ${userId} with prompt "${trimmedPrompt.substring(0, 50)}...":`, error);
        res.status(500).json({ message: error.message || 'Server error during prompt analysis.' });
    }
});

// @route   POST /api/chat/tutor/init
// @desc    Initialize tutor session state for Socratic reasoning loop
// @access  Private
router.post('/tutor/init', async (req, res) => {
    const { sessionId, moduleTitle, initialQuestion } = req.body;

    if (!sessionId || !moduleTitle || !initialQuestion) {
        return res.status(400).json({ message: 'sessionId, moduleTitle, and initialQuestion are required.' });
    }

    try {
        const { setTutorSessionState } = require('../services/socraticTutorService');

        const tutorState = {
            moduleTitle,
            lastQuestion: initialQuestion,
            turnCount: 0,
            startedAt: new Date().toISOString(),
            socraticState: SOCRATIC_STATES.INTRODUCTION
        };

        const success = await setTutorSessionState(sessionId, tutorState);

        if (success) {
            console.log(`[Chat Route] Tutor state initialized for session ${sessionId}, module: "${moduleTitle}"`);
            res.status(200).json({ message: 'Tutor state initialized', sessionId });
        } else {
            console.warn(`[Chat Route] Failed to initialize tutor state (Redis may be unavailable)`);
            res.status(200).json({ message: 'Tutor state initialization skipped (Redis unavailable)', sessionId });
        }
    } catch (error) {
        console.error('[Chat Route] Error initializing tutor state:', error);
        res.status(500).json({ message: 'Failed to initialize tutor state' });
    }
});

// @route   GET /api/chat/knowledge-state
// @desc    Get student's knowledge state (long-term memory profile)
// @access  Private
router.get('/knowledge-state', async (req, res) => {
    const userId = req.user._id;

    try {
        const knowledgeState = await knowledgeStateService.getOrCreateKnowledgeState(userId);

        const summary = knowledgeState.generateQuickSummary();
        const strugglingConcepts = knowledgeState.getStrugglingConcepts();
        const masteredConcepts = knowledgeState.getMasteredConcepts();

        // Flatten the response and match the keys expected by LearningProfile.jsx
        res.status(200).json({
            success: true,
            summary: summary, // Frontend uses this for counts (totalConcepts, mastered, etc)
            textSummary: knowledgeState.knowledgeSummary,
            strugglingConcepts: strugglingConcepts.map(c => ({
                conceptName: c.conceptName,
                masteryScore: c.masteryScore,
                difficulty: c.difficulty,
                misconceptions: c.misconceptions
            })),
            masteredConcepts: masteredConcepts.map(c => ({
                conceptName: c.conceptName,
                masteryScore: c.masteryScore
            })),
            learningProfile: knowledgeState.learningProfile,
            currentFocusAreas: knowledgeState.currentFocusAreas,
            recurringStruggles: knowledgeState.recurringStruggles,
            sessionInsights: knowledgeState.sessionInsights,
            recommendations: knowledgeState.recommendations.filter(r => !r.actedUpon)
        });
    } catch (error) {
        console.error('[Knowledge State] Error retrieving knowledge state:', error);
        res.status(500).json({ message: 'Failed to retrieve knowledge state' });
    }
});

// @route   POST /api/chat/knowledge-state/reset
// @desc    Reset student's knowledge state (privacy control)
// @access  Private
router.post('/knowledge-state/reset', async (req, res) => {
    const userId = req.user._id;

    try {
        const StudentKnowledgeState = require('../models/StudentKnowledgeState');
        await StudentKnowledgeState.findOneAndDelete({ userId });

        console.log(`[Knowledge State] Reset memory for user ${userId}`);
        res.status(200).json({
            success: true,
            message: 'Your learning memory has been reset successfully'
        });
    } catch (error) {
        console.error('[Knowledge State] Error resetting knowledge state:', error);
        res.status(500).json({ message: 'Failed to reset knowledge state' });
    }
});

// @route   GET /api/chat/knowledge-state/export
// @desc    Export student's knowledge state (privacy control)
// @access  Private
router.get('/knowledge-state/export', async (req, res) => {
    const userId = req.user._id;

    try {
        const knowledgeState = await knowledgeStateService.getOrCreateKnowledgeState(userId);

        res.status(200).json({
            success: true,
            data: {
                exportedAt: new Date().toISOString(),
                userId: userId.toString(),
                learningProfile: knowledgeState.learningProfile,
                concepts: knowledgeState.concepts,
                masteredTopics: knowledgeState.masteredTopics,
                recurringStruggles: knowledgeState.recurringStruggles,
                sessionInsights: knowledgeState.sessionInsights,
                engagementMetrics: knowledgeState.engagementMetrics,
                recommendations: knowledgeState.recommendations
            }
        });
    } catch (error) {
        console.error('[Knowledge State] Error exporting knowledge state:', error);
        res.status(500).json({ message: 'Failed to export knowledge state' });
    }
});

module.exports = router;
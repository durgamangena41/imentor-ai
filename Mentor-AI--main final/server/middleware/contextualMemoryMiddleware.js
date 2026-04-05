// server/middleware/contextualMemoryMiddleware.js

const knowledgeStateService = require('../services/knowledgeStateService');
const { generateTutorSystemPrompt } = require('../prompts/tutorSystemPrompt');
const { logger } = require('../utils/logger');

/**
 * Middleware to inject contextual memory into chat requests
 * This enriches the request with student's knowledge state for personalized tutoring
 */
async function injectContextualMemory(req, res, next) {
    console.log('🔥 [DEBUG] Contextual Memory Middleware RUNNING!');
    try {
        const userId = req.user?._id || req.user?.id;
        const { query, tutorMode } = req.body;

        if (!userId) {
            // No user context, skip memory injection
            console.log('⚠️ [DEBUG] No userId found, skipping memory');
            req.contextualMemory = {
                knowledgeContext: null,
                systemPrompt: generateTutorSystemPrompt(null, tutorMode),
                hasMemory: false
            };
            return next();
        }

        console.log(`🧠 [DEBUG] Loading memory for user: ${userId}`);

        // Check if user has opted out of contextual memory
        const StudentKnowledgeState = require('../models/StudentKnowledgeState');
        const userKnowledgeState = await StudentKnowledgeState.findOne({ userId }).select('memoryOptOut');

        if (userKnowledgeState?.memoryOptOut === true) {
            logger.info(`[ContextualMemory] User ${userId} has opted out of contextual memory`);
            console.log('🚫 [DEBUG] User has opted out of contextual memory');
            req.contextualMemory = {
                knowledgeContext: null,
                systemPrompt: generateTutorSystemPrompt(null, tutorMode),
                hasMemory: false,
                optedOut: true
            };
            return next();
        }

        // Get student's knowledge state context
        const knowledgeContext = await knowledgeStateService.getContextualMemory(userId, query);

        // NEW: Check user's expertise level for adaptive responses
        const advancedRecognition = require('../services/advancedUserRecognitionService');
        const userExpertise = await advancedRecognition.checkUserExpertiseLevel(userId, query);

        // Generate system prompt with contextual memory AND expertise awareness
        let systemPrompt = generateTutorSystemPrompt(knowledgeContext, tutorMode);

        // Enhance system prompt for returning experts
        if (userExpertise.isReturningExpert) {
            systemPrompt = advancedRecognition.generateExpertiseAwareSystemPrompt(systemPrompt, userExpertise);
            logger.info(`[ContextualMemory] Enhanced prompt for ${userExpertise.expertiseLevel} user ${userId}`);
        }

        // Generate acknowledgment prefix if user is asking about mastered topics
        const expertAcknowledgment = advancedRecognition.generateExpertAcknowledgment(userExpertise, query);

        // Attach to request for use in chat handler
        req.contextualMemory = {
            knowledgeContext,
            systemPrompt,
            hasMemory: !!knowledgeContext,
            optedOut: false,
            userExpertise, // NEW: Include expertise data
            expertAcknowledgment // NEW: Include acknowledgment prefix
        };

        logger.info(`[ContextualMemory] Injected memory for user ${userId} (hasMemory: ${!!knowledgeContext}, expertiseLevel: ${userExpertise.expertiseLevel})`);
        console.log(`✅ [DEBUG] Memory injected successfully (hasMemory: ${!!knowledgeContext})`);

        // Debug: Show what's in the knowledge context
        if (knowledgeContext) {
            console.log(`📊 [DEBUG] Knowledge context preview (first 500 chars):`);
            console.log(knowledgeContext.substring(0, 500));
        }


        next();
    } catch (error) {
        console.error('❌ [DEBUG] Error in contextual memory middleware:', error);
        logger.error('[ContextualMemory] Error injecting contextual memory:', error);

        // CRITICAL: Don't block the request, just proceed without memory (graceful degradation)
        req.contextualMemory = {
            knowledgeContext: null,
            systemPrompt: generateTutorSystemPrompt(null, req.body?.tutorMode),
            hasMemory: false,
            error: true
        };
        next();
    }
}

/**
 * Background task to analyze session and update knowledge state
 * Call this after a chat response is sent (non-blocking)
 */
async function analyzeAndUpdateKnowledgeState(sessionId, userId, llmConfig) {
    try {
        logger.info(`[ContextualMemory] Starting background analysis for session ${sessionId}`);

        // This runs asynchronously and doesn't block the response
        await knowledgeStateService.processSessionEnd(sessionId, userId, llmConfig);

        logger.info(`[ContextualMemory] Completed background analysis for session ${sessionId}`);
    } catch (error) {
        logger.error(`[ContextualMemory] Error in background analysis for session ${sessionId}:`, error);
    }
}

/**
 * Update session metadata in ChatHistory
 */
async function updateSessionMetadata(sessionId, metadata) {
    try {
        const ChatHistory = require('../models/ChatHistory');

        await ChatHistory.findOneAndUpdate(
            { sessionId },
            {
                $set: {
                    'sessionMetadata.tutorModeActive': metadata.tutorMode || false,
                    'sessionMetadata.sessionDuration': metadata.duration || 0,
                    updatedAt: new Date()
                }
            }
        );

        logger.info(`[ContextualMemory] Updated session metadata for ${sessionId}`);
    } catch (error) {
        logger.error(`[ContextualMemory] Error updating session metadata:`, error);
    }
}

/**
 * Trigger knowledge state analysis after N messages
 * This allows real-time updates during long sessions
 */
async function triggerPeriodicAnalysis(sessionId, userId, messageCount, llmConfig) {
    // Analyze every 3 messages to keep knowledge state fresh (reduced from 5 to save API quota)
    if (messageCount % 3 === 0) {
        logger.info(`[ContextualMemory] Triggering periodic analysis at message ${messageCount}`);

        // Run in background
        setImmediate(() => {
            analyzeAndUpdateKnowledgeState(sessionId, userId, llmConfig);
        });
    }
}

module.exports = {
    injectContextualMemory,
    analyzeAndUpdateKnowledgeState,
    updateSessionMetadata,
    triggerPeriodicAnalysis
};

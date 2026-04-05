// server/services/knowledgeStateService.js

const StudentKnowledgeState = require('../models/StudentKnowledgeState');
const ChatHistory = require('../models/ChatHistory');
const { logger } = require('../utils/logger');
const geminiService = require('./geminiService');
const ollamaService = require('./ollamaService');
const neo4j = require('../config/neo4j');

/**
 * Knowledge State Service
 * Manages student's long-term knowledge profile across sessions
 */
class KnowledgeStateService {
    constructor() {
        this.updateQueue = new Map(); // Queue updates to avoid race conditions
    }

    /**
     * Get or create student knowledge state
     * @param {ObjectId} userId - Student's user ID
     * @returns {Promise<StudentKnowledgeState>}
     */
    async getOrCreateKnowledgeState(userId) {
        try {
            let knowledgeState = await StudentKnowledgeState.findOne({ userId });

            if (!knowledgeState) {
                logger.info(`[KnowledgeState] Creating new knowledge state for user ${userId}`);
                knowledgeState = new StudentKnowledgeState({
                    userId,
                    knowledgeSummary: 'New student - no learning history yet.',
                    engagementMetrics: {
                        lastActiveDate: new Date()
                    }
                });
                await knowledgeState.save();

                // Initialize in Neo4j
                try {
                    await neo4j.runQuery(
                        'MERGE (s:Student {id: $userId}) SET s.lastUpdated = datetime()',
                        { userId: userId.toString() }
                    );
                } catch (e) {
                    logger.warn(`[KnowledgeState] Failed to initialize student in Neo4j: ${e.message}`);
                }
            }

            return knowledgeState;
        } catch (error) {
            logger.error(`[KnowledgeState] Error getting/creating knowledge state for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Analyze a conversation and extract knowledge insights
     * @param {string} sessionId - Chat session ID
     * @param {ObjectId} userId - Student's user ID
     * @param {Array} messages - Chat messages
     * @param {Object} llmConfig - LLM configuration
     * @returns {Promise<Object>} Extracted insights
     */
    async analyzeConversationForInsights(sessionId, userId, messages, llmConfig) {
        try {
            if (!messages || messages.length < 2) {
                return null; // Not enough conversation to analyze
            }

            // Format conversation for analysis
            const conversationText = messages.map(msg => {
                const role = msg.role === 'user' ? 'Student' : 'Tutor';
                const text = msg.parts?.[0]?.text || '';
                return `${role}: ${text}`;
            }).join('\n\n');

            const analysisPrompt = `You are an expert educational psychologist and knowledge engineer. Analyze the following tutoring session to track the student's mastery of specific, granular concepts.

CRITICAL RULES:
1. Concepts must be granular (e.g., "recursion.base_case", "recursion.recursive_step", "gradient_descent.learning_rate")
2. mastery MUST be 0-100 (integers only, NO negative values)
3. difficulty MUST be exactly one of: "low", "medium", "high" (NO other values like "N/A")
4. inferredLearningStyle MUST be exactly one of: "visual", "auditory", "kinesthetic", "reading_writing", "mixed", "unknown"

Analyze the following conversation and extract:
1. **Concepts Discussed**: List granular concepts mentioned
2. **Mastery Score**: A score from 0 to 100 representing their current understanding (0 if not exposed, 100 if mastered).
3. **Difficulty**: Assessed difficulty for THIS student - MUST be "low", "medium", or "high" ONLY.
4. **Strengths**: Specific aspects they grasped well.
5. **Weaknesses**: Specific aspects they struggled with.
6. **Misconceptions**: Any incorrect beliefs detected.
7. **Learning Style Inferred**: How they seem to learn best - MUST be one of: "visual", "auditory", "kinesthetic", "reading_writing", "mixed", "unknown"

CONVERSATION:
${conversationText}

Respond with a JSON object in this exact format (NO deviations):
{
  "concepts": [
    {
      "name": "string (granular.name)",
      "mastery": number (0-100, NO negatives),
      "difficulty": "low|medium|high" (ONLY these 3 values),
      "evidence": "brief reasoning",
      "misconceptions": ["string"],
      "strengths": ["string"],
      "weaknesses": ["string"]
    }
  ],
  "inferredLearningStyle": "visual|auditory|kinesthetic|reading_writing|mixed|unknown" (ONLY these 6 values),
  "summary": "2-3 sentence summary of progress",
  "overallEngagement": "low|medium|high"
}`;

            let response;
            if (llmConfig.llmProvider === 'ollama') {
                response = await ollamaService.generateText(
                    analysisPrompt,
                    [],
                    llmConfig.ollamaModel,
                    llmConfig.ollamaUrl
                );
            } else {
                response = await geminiService.generateText(
                    analysisPrompt,
                    [],
                    llmConfig.apiKey,
                    llmConfig.geminiModel || 'gemini-2.0-flash-exp'
                );
            }

            // Parse JSON response
            const insights = this.parseJSON(response);

            // Sanitize and validate insights
            if (insights && insights.concepts) {
                insights.concepts = insights.concepts.map(c => {
                    // Ensure mastery is 0-100
                    c.mastery = Math.max(0, Math.min(100, parseInt(c.mastery) || 0));

                    // Ensure difficulty is valid enum
                    if (!['low', 'medium', 'high'].includes(c.difficulty)) {
                        c.difficulty = 'medium'; // Default
                    }

                    return c;
                });

                // Ensure learning style is valid enum
                const validStyles = ['visual', 'auditory', 'kinesthetic', 'reading_writing', 'mixed', 'unknown'];
                if (!validStyles.includes(insights.inferredLearningStyle)) {
                    insights.inferredLearningStyle = 'mixed'; // Default
                }
            }

            logger.info(`[KnowledgeState] Extracted insights for session ${sessionId}: ${insights.concepts?.length || 0} concepts`);

            return insights;
        } catch (error) {
            logger.error(`[KnowledgeState] Error analyzing conversation for session ${sessionId}:`, error);
            return null;
        }
    }

    /**
     * Update student knowledge state based on session insights
     * @param {ObjectId} userId - Student's user ID
     * @param {string} sessionId - Chat session ID
     * @param {Object} insights - Extracted insights from conversation
     * @returns {Promise<StudentKnowledgeState>}
     */
    async updateKnowledgeStateFromInsights(userId, sessionId, insights) {
        try {
            if (!insights) {
                logger.warn(`[KnowledgeState] No insights provided for user ${userId}, session ${sessionId}`);
                return null;
            }

            const knowledgeState = await this.getOrCreateKnowledgeState(userId);
            const now = new Date();

            // Cache old mastery scores for velocity calculation
            const oldMasteryMap = new Map();
            knowledgeState.concepts.forEach(c => oldMasteryMap.set(c.conceptName, c.masteryScore));

            // Update concepts
            if (insights.concepts && Array.isArray(insights.concepts)) {
                for (const conceptInsight of insights.concepts) {
                    // Validate concept insight data
                    if (!conceptInsight.name || typeof conceptInsight.name !== 'string') {
                        logger.warn(`[KnowledgeState] Invalid concept name in insights, skipping`);
                        continue;
                    }

                    const existingConcept = knowledgeState.getConcept(conceptInsight.name);
                    const newMastery = Math.max(0, Math.min(100, parseInt(conceptInsight.mastery) || 0));

                    if (existingConcept) {
                        // Calculate velocity: (New - Old) / Interactions
                        const oldMastery = existingConcept.masteryScore;
                        const interactions = existingConcept.totalInteractions + 1;
                        existingConcept.learningVelocity = (newMastery - oldMastery) / interactions;

                        // Update fields
                        existingConcept.masteryScore = newMastery;
                        existingConcept.difficulty = conceptInsight.difficulty || existingConcept.difficulty;
                        existingConcept.totalInteractions = interactions;
                        existingConcept.lastInteractionDate = now;

                        // Map mastery to understanding level
                        if (newMastery >= 90) existingConcept.understandingLevel = 'mastered';
                        else if (newMastery >= 70) existingConcept.understandingLevel = 'comfortable';
                        else if (newMastery >= 40) existingConcept.understandingLevel = 'learning';
                        else existingConcept.understandingLevel = 'struggling';

                        existingConcept.confidenceScore = newMastery / 100;

                        // CRITICAL: Prevent contradictory states
                        // Rule 1: Mastered concepts cannot have high difficulty
                        if (existingConcept.understandingLevel === 'mastered' && existingConcept.difficulty === 'high') {
                            existingConcept.difficulty = 'low';
                            logger.info(`[KnowledgeState] Auto-corrected: ${conceptInsight.name} is mastered, difficulty changed from high to low`);
                        }

                        // Rule 2: Struggling concepts with low mastery should have at least medium difficulty
                        if (existingConcept.understandingLevel === 'struggling' && existingConcept.difficulty === 'low' && newMastery < 40) {
                            existingConcept.difficulty = 'medium';
                            logger.info(`[KnowledgeState] Auto-corrected: ${conceptInsight.name} is struggling, difficulty changed from low to medium`);
                        }

                        // Rule 3: High mastery (>80) with high difficulty is contradictory
                        if (newMastery > 80 && existingConcept.difficulty === 'high') {
                            existingConcept.difficulty = 'medium';
                            logger.info(`[KnowledgeState] Auto-corrected: ${conceptInsight.name} has high mastery (${newMastery}), difficulty changed from high to medium`);
                        }

                        // Add strengths/weaknesses if not already present
                        if (conceptInsight.strengths) {
                            conceptInsight.strengths.forEach(s => {
                                if (!existingConcept.strengths.some(ex => ex.aspect === s)) {
                                    existingConcept.strengths.push({ aspect: s, evidence: conceptInsight.evidence, detectedAt: now });
                                }
                            });
                        }

                        if (conceptInsight.weaknesses) {
                            conceptInsight.weaknesses.forEach(w => {
                                if (!existingConcept.weaknesses.some(ex => ex.aspect === w)) {
                                    existingConcept.weaknesses.push({ aspect: w, evidence: conceptInsight.evidence, detectedAt: now });

                                    // Track recurring struggles
                                    this.updateRecurringStruggles(knowledgeState, w, conceptInsight.name);
                                }
                            });
                        }

                        // Add misconceptions
                        if (conceptInsight.misconceptions) {
                            conceptInsight.misconceptions.forEach(m => {
                                if (!existingConcept.misconceptions.some(ex => ex.description === m && ex.stillPresent)) {
                                    existingConcept.misconceptions.push({ description: m, stillPresent: true });
                                }
                            });
                        }

                        if (conceptInsight.evidence) {
                            existingConcept.tutorNotes.push({
                                note: conceptInsight.evidence,
                                sessionId,
                                timestamp: now
                            });
                        }
                    } else {
                        // Add new concept
                        let understandingLevel = 'learning';
                        if (newMastery >= 90) understandingLevel = 'mastered';
                        else if (newMastery >= 70) understandingLevel = 'comfortable';
                        else if (newMastery < 40) understandingLevel = 'struggling';

                        knowledgeState.concepts.push({
                            conceptName: conceptInsight.name,
                            understandingLevel,
                            masteryScore: newMastery,
                            difficulty: conceptInsight.difficulty || 'medium',
                            learningVelocity: newMastery / 1, // First jump
                            confidenceScore: newMastery / 100,
                            totalInteractions: 1,
                            lastInteractionDate: now,
                            firstExposureDate: now,
                            strengths: conceptInsight.strengths?.map(s => ({ aspect: s, evidence: conceptInsight.evidence, detectedAt: now })) || [],
                            weaknesses: conceptInsight.weaknesses?.map(w => ({ aspect: w, evidence: conceptInsight.evidence, detectedAt: now })) || [],
                            misconceptions: conceptInsight.misconceptions?.map(m => ({ description: m, stillPresent: true })) || [],
                            tutorNotes: conceptInsight.evidence ? [{
                                note: conceptInsight.evidence,
                                sessionId,
                                timestamp: now
                            }] : []
                        });

                        if (conceptInsight.weaknesses) {
                            conceptInsight.weaknesses.forEach(w => this.updateRecurringStruggles(knowledgeState, w, conceptInsight.name));
                        }
                    }

                    // SYNC TO NEO4J
                    await this.syncConceptToNeo4j(userId, conceptInsight);
                }
            }

            // Update overall learning velocity
            const totalMastery = knowledgeState.concepts.reduce((sum, c) => sum + c.masteryScore, 0);
            const avgMastery = knowledgeState.concepts.length > 0 ? totalMastery / knowledgeState.concepts.length : 0;
            knowledgeState.engagementMetrics.learningVelocity = avgMastery / (knowledgeState.engagementMetrics.totalSessions + 1);

            // Update learning profile
            if (insights.inferredLearningStyle) {
                knowledgeState.learningProfile.dominantLearningStyle = insights.inferredLearningStyle;
            }

            // Session insights
            knowledgeState.sessionInsights.push({
                sessionId,
                date: now,
                keyObservations: [insights.summary].filter(Boolean),
                conceptsCovered: insights.concepts?.map(c => c.name) || [],
                struggledWith: insights.concepts?.flatMap(c => c.weaknesses || []) || []
            });

            knowledgeState.engagementMetrics.totalSessions += 1;
            knowledgeState.engagementMetrics.lastActiveDate = now;
            knowledgeState.knowledgeSummary = insights.summary || knowledgeState.knowledgeSummary;

            await knowledgeState.save();
            return knowledgeState;
        } catch (error) {
            logger.error(`[KnowledgeState] Error updating knowledge state for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Update recurring struggles tracker
     */
    updateRecurringStruggles(knowledgeState, pattern, conceptName) {
        const existingStruggle = knowledgeState.recurringStruggles.find(s =>
            s.pattern.toLowerCase().includes(pattern.toLowerCase()) ||
            pattern.toLowerCase().includes(s.pattern.toLowerCase())
        );

        if (existingStruggle) {
            existingStruggle.occurrences += 1;
            existingStruggle.lastDetected = new Date();
            if (!existingStruggle.examples.includes(conceptName)) {
                existingStruggle.examples.push(conceptName);
            }
        } else {
            knowledgeState.recurringStruggles.push({
                pattern,
                occurrences: 1,
                firstDetected: new Date(),
                lastDetected: new Date(),
                examples: [conceptName]
            });
        }
    }

    /**
     * Sync a concept mastery to Neo4j
     */
    async syncConceptToNeo4j(userId, conceptInsight) {
        try {
            const relationshipType =
                conceptInsight.mastery >= 80 ? 'MASTERED' :
                    conceptInsight.mastery >= 40 ? 'IMPROVING_IN' : 'STRUGGLES_WITH';

            // Delete old relationships of these types to avoid contradictions
            await neo4j.runQuery(`
                MATCH (s:Student {id: $userId})-[r:MASTERED|IMPROVING_IN|STRUGGLES_WITH]->(c:Concept {name: $conceptName})
                DELETE r
            `, { userId: userId.toString(), conceptName: conceptInsight.name });

            // Create new relationship
            await neo4j.runQuery(`
                MERGE (s:Student {id: $userId})
                MERGE (c:Concept {name: $conceptName})
                MERGE (s)-[r:${relationshipType}]->(c)
                SET r.mastery = $mastery,
                    r.difficulty = $difficulty,
                    r.lastUpdated = timestamp()
            `, {
                userId: userId.toString(),
                conceptName: conceptInsight.name,
                mastery: conceptInsight.mastery,
                difficulty: conceptInsight.difficulty || 'medium'
            });
        } catch (error) {
            logger.warn(`[KnowledgeState] Neo4j sync failed for concept ${conceptInsight.name}:`, error.message);
        }
    }

    /**
     * Get prerequisites for a concept from Neo4j
     */
    async getPrerequisites(conceptName) {
        try {
            const result = await neo4j.runQuery(`
                MATCH (c:Concept {name: $conceptName})-[:REQUIRES]->(pre:Concept)
                RETURN pre.name as name
            `, { conceptName });

            return result.records.map(record => record.get('name'));
        } catch (error) {
            logger.warn(`[KnowledgeState] Error fetching prerequisites for ${conceptName}:`, error);
            return [];
        }
    }

    /**
     * Check if a student has mastered prerequisites for a concept
     */
    async checkPrerequisitesMastery(userId, conceptName) {
        const prerequisites = await this.getPrerequisites(conceptName);
        if (prerequisites.length === 0) return { allMastered: true, missing: [] };

        const knowledgeState = await StudentKnowledgeState.findOne({ userId });
        if (!knowledgeState) return { allMastered: false, missing: prerequisites };

        const missing = [];
        for (const pre of prerequisites) {
            const concept = knowledgeState.concepts.find(c => c.conceptName.toLowerCase() === pre.toLowerCase());
            if (!concept || concept.masteryScore < 60) {
                missing.push(pre);
            }
        }

        return {
            allMastered: missing.length === 0,
            missing: missing
        };
    }

    /**
     * Get contextual memory for a student
     * @param {ObjectId} userId - Student's user ID
     * @returns {Promise<string>} Formatted context string
     */
    async getContextualMemory(userId) {
        try {
            const knowledgeState = await StudentKnowledgeState.findOne({ userId });

            if (!knowledgeState || knowledgeState.concepts.length === 0) {
                return null;
            }

            const struggling = knowledgeState.concepts.filter(c => c.difficulty === 'high' || c.masteryScore < 70);
            const mastered = knowledgeState.concepts.filter(c => c.masteryScore >= 85);
            const learningPace = knowledgeState.learningProfile.learningPace;

            let context = `=== STUDENT CONTEXTUAL MEMORY ===\n`;
            context += `Overall Learning Velocity: ${knowledgeState.engagementMetrics.learningVelocity.toFixed(2)} pts/session\n`;
            context += `Preferred Style: ${knowledgeState.learningProfile.dominantLearningStyle}\n\n`;

            if (mastered.length > 0) {
                context += `STRENGTHS (Skip basics, move faster):\n`;
                mastered.slice(0, 5).forEach(c => {
                    context += `- ${c.conceptName} (Mastered)\n`;
                });
                context += '\n';

                // Add explicit acknowledgment instruction for mastered topics
                context += `IMPORTANT INSTRUCTION FOR MASTERED TOPICS:\n`;
                context += `If the student asks about any of these topics (${mastered.slice(0, 3).map(c => c.conceptName).join(', ')}), \n`;
                context += `START your response by acknowledging their competence. Examples:\n`;
                context += `- "Since you're already comfortable with ${mastered[0]?.conceptName}, let me give you a quick refresher and then we can explore advanced concepts..."\n`;
                context += `- "I know you understand ${mastered[0]?.conceptName} well, so I'll keep this brief and focus on more complex applications..."\n`;
                context += `Keep the acknowledgment brief (1 sentence), then provide a concise explanation or move to advanced topics.\n\n`;
            }

            if (struggling.length > 0) {
                context += `WEAKNESSES (Slow down, use simpler analogies, check understanding early):\n`;
                struggling.slice(0, 5).forEach(c => {
                    context += `- ${c.conceptName} (Difficulty: ${c.difficulty}, Mastery: ${c.masteryScore}%)\n`;
                    if (c.misconceptions.filter(m => m.stillPresent).length > 0) {
                        context += `  Misconception: ${c.misconceptions.find(m => m.stillPresent).description}\n`;
                    }
                });
                context += '\n';

                // Add explicit acknowledgment instruction
                context += `\n=== CRITICAL INSTRUCTION - MUST FOLLOW ===\n`;
                context += `STRUGGLING TOPICS: ${struggling.slice(0, 5).map(c => c.conceptName).join(', ')}\n\n`;
                context += `MANDATORY RULE: If the student's question is about ANY of these topics, you MUST:\n`;
                context += `1. START your response with ONE of these acknowledgment patterns:\n`;
                context += `   - "I remember you found [topic] challenging before, so let me explain it differently..."\n`;
                context += `   - "Since [topic] was confusing in our previous conversations, let me break it down more simply..."\n`;
                context += `   - "I know [topic] has been difficult for you, so let's approach it step-by-step..."\n\n`;
                context += `2. Then provide a SIMPLER, MORE DETAILED explanation than usual.\n`;
                context += `3. Use MORE EXAMPLES and SIMPLER LANGUAGE.\n\n`;
                context += `Example for "${struggling[0]?.conceptName}":\n`;
                context += `"I remember you found ${struggling[0]?.conceptName} challenging before, so let me explain it differently...\n\n`;
                context += `[Then provide simple explanation with examples]"\n`;
                context += `=== END CRITICAL INSTRUCTION ===\n\n`;
            }

            if (knowledgeState.recurringStruggles.length > 0) {
                const topStruggle = knowledgeState.recurringStruggles.sort((a, b) => b.occurrences - a.occurrences)[0];
                context += `CRITICAL PATTERN: Student frequently ${topStruggle.pattern}\n\n`;
            }

            context += `=== END CONTEXT ===\n`;
            return context;
        } catch (error) {
            logger.error(`[KnowledgeState] Error reading memory for ${userId}:`, error);
            return null;
        }
    }

    /**
     * Update knowledge real-time during session
     */
    async updateKnowledgeRealTime(userId, sessionId, eventType, data, llmConfig) {
        logger.info(`[KnowledgeState] Real-time update trigger: ${eventType} for ${userId}`);

        if (eventType === 'TUTOR_ASSESSMENT') {
            const { conceptName, classification, reasoning } = data;
            if (!conceptName || !classification) return;

            try {
                const knowledgeState = await this.getOrCreateKnowledgeState(userId);
                const now = new Date();

                // Map classification to mastery change
                // CORRECT: +15, PARTIAL: +5, MISCONCEPTION: -10, VAGUE: 0
                const masteryAdjustments = {
                    'CORRECT': 15,
                    'PARTIAL': 5,
                    'MISCONCEPTION': -10,
                    'VAGUE': 0
                };

                const adjustment = masteryAdjustments[classification] || 0;
                let existingConcept = knowledgeState.getConcept(conceptName);

                if (existingConcept) {
                    // Update existing
                    const oldMastery = existingConcept.masteryScore;
                    existingConcept.masteryScore = Math.max(0, Math.min(100, oldMastery + adjustment));
                    existingConcept.totalInteractions += 1;
                    existingConcept.lastInteractionDate = now;

                    // Update understanding level
                    if (existingConcept.masteryScore >= 90) existingConcept.understandingLevel = 'mastered';
                    else if (existingConcept.masteryScore >= 70) existingConcept.understandingLevel = 'comfortable';
                    else if (existingConcept.masteryScore >= 40) existingConcept.understandingLevel = 'learning';
                    else existingConcept.understandingLevel = 'struggling';

                    existingConcept.tutorNotes.push({
                        note: `Real-time assessment: ${classification}. Reasoning: ${reasoning}`,
                        sessionId,
                        timestamp: now
                    });
                } else {
                    // Add new
                    const initialMastery = Math.max(0, adjustment);
                    knowledgeState.concepts.push({
                        conceptName,
                        understandingLevel: initialMastery >= 40 ? 'learning' : 'struggling',
                        masteryScore: initialMastery,
                        difficulty: 'medium',
                        totalInteractions: 1,
                        lastInteractionDate: now,
                        firstExposureDate: now,
                        tutorNotes: [{
                            note: `Initial real-time assessment: ${classification}. Reasoning: ${reasoning}`,
                            sessionId,
                            timestamp: now
                        }]
                    });
                }

                await knowledgeState.save();

                // Sync to Neo4j
                await this.syncConceptToNeo4j(userId, {
                    name: conceptName,
                    mastery: existingConcept ? existingConcept.masteryScore : Math.max(0, adjustment),
                    difficulty: 'medium'
                });

                logger.info(`[KnowledgeState] Updated ${conceptName} mastery for user ${userId} via real-time assessment`);
            } catch (error) {
                logger.error(`[KnowledgeState] Error in real-time update:`, error);
            }
        }
    }

    /**
     * Parse JSON from LLM response
     */
    parseJSON(response) {
        try {
            return JSON.parse(response);
        } catch {
            const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (jsonMatch) return JSON.parse(jsonMatch[1]);
            const objectMatch = response.match(/\{[\s\S]*\}/);
            if (objectMatch) return JSON.parse(objectMatch[0]);
            throw new Error('Could not parse JSON');
        }
    }

    /**
     * Process session end
     */
    async processSessionEnd(sessionId, userId, llmConfig) {
        try {
            logger.info(`[KnowledgeState] Finalizing session memory for ${sessionId}`);
            const chatHistory = await ChatHistory.findOne({ sessionId, userId });
            if (!chatHistory || chatHistory.messages.length < 2) return;

            const insights = await this.analyzeConversationForInsights(sessionId, userId, chatHistory.messages, llmConfig);
            if (!insights) return;

            await this.updateKnowledgeStateFromInsights(userId, sessionId, insights);

            // Mark chat history as analyzed
            await ChatHistory.findOneAndUpdate({ sessionId }, {
                $set: {
                    'sessionMetadata.insightsGenerated': true,
                    summary: insights.summary
                }
            });

        } catch (error) {
            logger.error(`[KnowledgeState] Session end failed for ${sessionId}:`, error);
        }
    }

    /**
     * Get struggling topics for a user (for acknowledgment prepending)
     * @param {ObjectId} userId - Student's user ID
     * @returns {Promise<Array>} Array of struggling topics
     */
    async getStrugglingTopics(userId) {
        try {
            const knowledgeState = await StudentKnowledgeState.findOne({ userId });

            if (!knowledgeState || knowledgeState.concepts.length === 0) {
                return [];
            }

            // Return concepts with mastery < 70 or difficulty === 'high'
            const struggling = knowledgeState.concepts.filter(c =>
                c.difficulty === 'high' || c.masteryScore < 70
            );

            return struggling;
        } catch (error) {
            logger.error('[KnowledgeState] Error getting struggling topics:', error);
            return [];
        }
    }
    /**
     * Get a natural language acknowledgment prefix for struggling topics
     * @param {string} userId - User ID
     * @param {string} query - Student query
     * @returns {Promise<string>} Acknowledgment string or empty string
     */
    async getAcknowledgmentPrefix(userId, query) {
        try {
            const strugglingTopics = await this.getStrugglingTopics(userId);
            if (!strugglingTopics || strugglingTopics.length === 0) return '';

            const queryLower = query.toLowerCase();
            for (const topic of strugglingTopics) {
                const topicKeyword = topic.conceptName.split('.')[0].toLowerCase();
                if (queryLower.includes(topicKeyword)) {
                    return `I remember you found ${topicKeyword} challenging before, so let me explain it differently...\n\n`;
                }
            }
        } catch (error) {
            logger.error(`[KnowledgeState] Error generating acknowledgment prefix:`, error);
        }
        return '';
    }
}

module.exports = new KnowledgeStateService();

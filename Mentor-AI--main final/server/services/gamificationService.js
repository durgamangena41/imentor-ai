// server/services/gamificationService.js
const Bounty = require('../models/Bounty');
const UserScore = require('../models/UserScore');
const SkillTreeGame = require('../models/SkillTreeGame'); // Import SkillTreeGame model
const TestResult = require('../models/TestResult'); // For storing quiz results
const axios = require('axios');
const { logger } = require('../utils/logger');
const { selectLLM } = require('./llmRouterService'); // For generating questions
const { GoogleGenerativeAI } = require("@google/generative-ai"); // kept for compatibility but prefer geminiService
// We will use the standard "generate text" method provided by the keys (Decryption needed if using user key)
const { decrypt } = require('../utils/crypto');
const User = require('../models/User');
const geminiService = require('./geminiService');
const ollamaService = require('./ollamaService');
const { checkOllamaHealth } = require('./ollamaHealthService');
const { runWithGeminiKeyRotation } = require('./geminiKeyRotationService');

async function solveBountyInternal(userId, bountyId) {
    try {
        const bounty = await Bounty.findOne({ _id: bountyId, userId: userId });
        if (!bounty) {
            throw new Error('Challenge not found or already completed.');
        }

        if (bounty.isSolved) {
            return { message: 'This challenge has already been completed.', xpEarned: 0 };
        }

        bounty.isSolved = true;
        await bounty.save();

        // Grant XP bonus and Testing Credits
        let userScore = await UserScore.findOne({ userId: userId });
        if (!userScore) {
            userScore = new UserScore({ userId: userId });
        }

        userScore.totalXP += bounty.xpReward;
        userScore.testingCredits += (bounty.xpReward / 2);
        userScore.completedAssessments += 1;
        await userScore.save();

        // Boost proficiency via Python RAG Service
        try {
            const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
            if (pythonServiceUrl) {
                await axios.post(`${pythonServiceUrl}/proficiency`, {
                    userId: userId.toString(),
                    topic: bounty.topic,
                    boost: 0.2
                });
                console.log(`[GamificationService] Proficiency boost sent for "${bounty.topic}"`);
            }
        } catch (e) {
            console.warn('[GamificationService] Failed to notify Python RAG Service:', e.message);
        }

        logger.info(`Challenge Solved: User ${userId} | Bounty ${bountyId} | +${bounty.xpReward} XP`);

        return {
            message: `Challenge Solved! You earned ${bounty.xpReward} XP.`,
            xpEarned: bounty.xpReward,
            newTotalXP: userScore.totalXP
        };

    } catch (error) {
        console.error(`[GamificationService] Error solving bounty ${bountyId}:`, error.message);
        throw error;
    }
}

/**
 * Generates a new challenge (Bounty) for the user based on a topic.
 */
async function createChallenge(userId, topic) {
    try {
        const user = userId ? await User.findById(userId).select('+encryptedApiKey') : null;
        let apiKey = process.env.GEMINI_API_KEY;
        if (user && user.encryptedApiKey) {
            apiKey = decrypt(user.encryptedApiKey);
        }

        if (!apiKey) {
            throw new Error("No API key available to generate challenge.");
        }

        // Choose LLM based on user preference and availability
        const preferredProvider = user?.preferredLlmProvider || 'gemini';
        let generationResultText = null;
        const prompt = `Generate a single, intriguing, intermediate-level interview question or challenge about "${topic}".\nReturn ONLY the question text. Do not include answers or explanations.`;

        if (preferredProvider === 'ollama') {
            const ollamaUrl = user?.ollamaUrl || process.env.OLLAMA_API_BASE_URL;
            const isOllamaUp = await checkOllamaHealth(ollamaUrl);
            if (isOllamaUp) {
                generationResultText = await ollamaService.generateContentWithHistory([], prompt, null, { model: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL, ollamaUrl });
            } else {
                // fallback to gemini
                generationResultText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey: apiKey });
            }
        } else {
            generationResultText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey: apiKey });
        }

        const question = (generationResultText || '').trim();

        const bounty = new Bounty({
            userId,
            topic,
            question,
            difficulty: 'Medium',
            xpReward: 50,
            context: `Generated to test your ${topic} skills.`
        });

        await bounty.save();
        logger.info(`Generated bounty for user ${userId} on topic ${topic}`);
        return bounty;

    } catch (error) {
        console.error("Error creating challenge:", error);
        return null;
    }
}

/**
 * Generates a multi-question quiz for a specific topic with sub-topic tagging.
 */
function buildFallbackQuizQuestions(topic) {
    const cleanTopic = String(topic || 'General Concepts').trim() || 'General Concepts';
    return [
        {
            questionText: `Which statement best describes ${cleanTopic}?`,
            options: [
                `${cleanTopic} is unrelated to learning outcomes.`,
                `${cleanTopic} helps structure understanding and practice.`,
                `${cleanTopic} can only be used in theoretical contexts.`,
                `${cleanTopic} has no practical value.`
            ],
            correctIndex: 1,
            subTopic: `${cleanTopic} basics`
        },
        {
            questionText: `What is a practical first step when studying ${cleanTopic}?`,
            options: [
                'Memorize random definitions without context.',
                `Break ${cleanTopic} into smaller concepts and examples.`,
                'Skip fundamentals and start from advanced topics.',
                'Avoid reviewing mistakes.'
            ],
            correctIndex: 1,
            subTopic: `${cleanTopic} strategy`
        },
        {
            questionText: `Which approach improves long-term retention in ${cleanTopic}?`,
            options: [
                'Passive reading only.',
                'One-time cramming before assessment.',
                'Active recall with spaced practice.',
                'Ignoring feedback.'
            ],
            correctIndex: 2,
            subTopic: `${cleanTopic} retention`
        },
        {
            questionText: `What is the best indicator of progress in ${cleanTopic}?`,
            options: [
                'Number of pages read.',
                'Ability to explain and apply concepts clearly.',
                'Avoiding difficult questions.',
                'Watching tutorials at high speed only.'
            ],
            correctIndex: 1,
            subTopic: `${cleanTopic} application`
        },
        {
            questionText: `How should you respond after getting an answer wrong in ${cleanTopic}?`,
            options: [
                'Guess again without reflection.',
                'Stop practicing immediately.',
                'Review why it was wrong and retry with a corrected approach.',
                'Assume the question was invalid.'
            ],
            correctIndex: 2,
            subTopic: `${cleanTopic} improvement`
        }
    ];
}

async function getAdaptiveDifficulty(userId, topic) {
    try {
        const topicRegex = topic ? new RegExp(`^${String(topic).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : null;
        let recent = [];

        if (topicRegex) {
            recent = await TestResult.find({ userId, topic: topicRegex })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('score')
                .lean();
        }

        if (!recent || recent.length === 0) {
            recent = await TestResult.find({ userId })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('score')
                .lean();
        }

        if (!recent || recent.length === 0) {
            return 'Medium';
        }

        const avg = recent.reduce((sum, row) => sum + (Number(row.score) || 0), 0) / recent.length;
        if (avg >= 80) return 'Hard';
        if (avg <= 55) return 'Easy';
        return 'Medium';
    } catch (error) {
        return 'Medium';
    }
}

async function generateQuizChallenge(userId, topic) {
    try {
        const user = userId ? await User.findById(userId).select('+encryptedApiKey') : null;
        const userApiKey = user && user.encryptedApiKey ? decrypt(user.encryptedApiKey) : null;
        const hasSharedGeminiKeys = Boolean(
            process.env.GEMINI_API_KEY_1
            || process.env.GEMINI_API_KEY_2
            || process.env.GEMINI_API_KEY_3
            || process.env.GEMINI_API_KEY_4
            || process.env.GEMINI_API_KEY_5
            || process.env.GEMINI_API_KEY
        );

        let questions = null;
        const adaptiveDifficulty = await getAdaptiveDifficulty(userId, topic);
        const xpByDifficulty = { Easy: 70, Medium: 100, Hard: 130 };

        if (!hasSharedGeminiKeys && !userApiKey) {
            questions = buildFallbackQuizQuestions(topic);
        }

        const prompt = `Create a 5-question multiple-choice quiz about "${topic}" at ${adaptiveDifficulty} difficulty. For each question, ensure the language is simple and understandable for students, but calibrated for ${adaptiveDifficulty} level. Identify a specific sub-topic and return a JSON object with structure {"questions":[{"questionText":"...","options":["A","B","C","D"],"correctIndex":0,"subTopic":"..."}]}`;
        if (!questions) {
            const preferredProviderQuiz = user?.preferredLlmProvider || 'gemini';
            let responseText = null;
            if (preferredProviderQuiz === 'ollama') {
                const ollamaUrl = user?.ollamaUrl || process.env.OLLAMA_API_BASE_URL;
                const isOllamaUp = await checkOllamaHealth(ollamaUrl);
                if (isOllamaUp) {
                    responseText = await ollamaService.generateContentWithHistory([], prompt, null, { model: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL, ollamaUrl });
                } else {
                    if (hasSharedGeminiKeys) {
                        responseText = await runWithGeminiKeyRotation(async (apiKey) => {
                            const result = await geminiService.generateContentWithHistory([], prompt, null, { apiKey });
                            return result;
                        });
                    } else if (userApiKey) {
                        responseText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey: userApiKey });
                    }
                }
            } else {
                if (hasSharedGeminiKeys) {
                    responseText = await runWithGeminiKeyRotation(async (apiKey) => {
                        const result = await geminiService.generateContentWithHistory([], prompt, null, { apiKey });
                        return result;
                    });
                } else if (userApiKey) {
                    responseText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey: userApiKey });
                }
            }

            let quizData = null;
            try {
                quizData = JSON.parse(responseText);
            } catch (parseErr) {
                const m = (responseText || '').match(/\{[\s\S]*\}/);
                if (m) {
                    try {
                        quizData = JSON.parse(m[0]);
                    } catch {
                        quizData = null;
                    }
                }
            }

            if (Array.isArray(quizData?.questions) && quizData.questions.length > 0) {
                questions = quizData.questions;
            } else {
                questions = buildFallbackQuizQuestions(topic);
            }
        }

        const bounty = new Bounty({
            userId,
            topic,
            type: 'Quiz',
            difficulty: adaptiveDifficulty,
            xpReward: xpByDifficulty[adaptiveDifficulty] || 100,
            context: `Comprehensive assessment for ${topic}`,
            quizData: questions
        });

        await bounty.save();
        logger.info(`Generated QUIZ bounty for user ${userId} on topic ${topic}`);
        return bounty;

    } catch (error) {
        console.error("Error creating quiz challenge:", error);

        try {
            const fallbackQuestions = buildFallbackQuizQuestions(topic);
            const fallbackDifficulty = await getAdaptiveDifficulty(userId, topic);
            const fallbackBounty = new Bounty({
                userId,
                topic,
                type: 'Quiz',
                difficulty: fallbackDifficulty,
                xpReward: ({ Easy: 70, Medium: 100, Hard: 130 }[fallbackDifficulty] || 100),
                context: `Fallback assessment for ${topic}`,
                quizData: fallbackQuestions
            });

            await fallbackBounty.save();
            logger.info(`Generated fallback QUIZ bounty for user ${userId} on topic ${topic}`);
            return fallbackBounty;
        } catch (fallbackError) {
            console.error("Error creating fallback quiz challenge:", fallbackError);
            return null;
        }
    }
}

/**
 * Generates a SINGLE "SessionChallenge" Bounty containing 5 questions.
 */
async function generateSessionChallenges(userId, sessionSummary, sourceSessionId) {
    try {
        // If a session assessment is already active for this source session, reuse it.
        if (sourceSessionId) {
            const existing = await Bounty.findOne({
                userId,
                type: 'SessionChallenge',
                sourceSessionId,
                isSolved: false
            }).sort({ createdAt: -1 });

            if (existing) {
                logger.info(`Reusing existing SessionChallenge for user ${userId} and source session ${sourceSessionId}`);
                return [existing];
            }
        }

        const user = userId ? await User.findById(userId).select('+encryptedApiKey profile') : null;
        let apiKey = process.env.GEMINI_API_KEY;
        if (user && user.encryptedApiKey) apiKey = decrypt(user.encryptedApiKey);

        if (!apiKey) throw new Error("No API key available.");

        // Clean Inputs
        const cleanSummary = (sessionSummary || '').substring(0, 5000);

        const prompt = `
            You are the "iMentor" Assessment Engine.
            Goal: generate exactly 5 concise, open-ended interview-style questions based on the session summary below.

            INPUT SESSION SUMMARY:
            "${cleanSummary}"

            STRICT RULES:
            1.  **Direct Questions Only:** Start immediately with the question (e.g., "Explain X.", "Compare Y and Z.").
            2.  **No Meta-Talk:** NEVER start with "The user asked", "In this session", or "In your own words".
            3.  **Length Limit:** Each question MUST be under 150 characters.
            4.  **Quantity:** Exactly 5 questions.
            5.  **Tagging:** Short, precise topic tags (1-3 words).
            6.  **Type:** OPEN-ENDED (No multiple choice).

            OUTPUT FORMAT (JSON ONLY):
            {
              "session_topic": "Specific Topic Name (Max 5 words)",
              "open_ended_questions": [
                {
                  "questionText": "Short open-ended question here",
                  "difficulty": "Medium",
                  "subTopic": "Topic Tag"
                }
              ],
              "remedial_actions": [
                 { "tag": "Topic Tag", "next_session_prompt": "Let's review [Topic]. Ready?" }
              ],
              "advancement_actions": [
                 { "tag": "Topic Tag", "next_session_prompt": "Ready to advance to [Next Topic]?" }
              ]
            }
        `;

        // Choose provider based on user preference
        const preferredProvider = user?.preferredLlmProvider || 'gemini';
        let respText = null;
        if (preferredProvider === 'ollama') {
            const ollamaUrl = user?.ollamaUrl || process.env.OLLAMA_API_BASE_URL;
            const isOllamaUp = await checkOllamaHealth(ollamaUrl);
            if (isOllamaUp) {
                respText = await ollamaService.generateContentWithHistory([], prompt, null, { model: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL, ollamaUrl });
            } else {
                respText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey: apiKey });
            }
        } else {
            respText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey: apiKey });
        }

        let data = null;
        try {
            data = JSON.parse(respText);
        } catch (e) {
            const m = (respText || '').match(/\{[\s\S]*\}/);
            if (m) data = JSON.parse(m[0]);
            else throw new Error("Failed to parse LLM JSON response");
        }

        if (!data.open_ended_questions || data.open_ended_questions.length === 0) {
            throw new Error("No questions generated by LLM");
        }

        // Create ONE Bounty of type 'SessionChallenge'
        const sessionQuestions = data.open_ended_questions.map(q => ({
            questionText: q.questionText,
            subTopic: q.subTopic || "General",
            difficulty: q.difficulty || 'Medium',
            context: `Generated from session summary`
        }));

        const bounty = new Bounty({
            userId,
            topic: data.session_topic || "Session Mastery", // Use specific topic from LLM
            type: 'SessionChallenge', // NEW TYPE
            xpReward: 150, // Higher reward for 5 Qs
            context: `Generated from session: ${cleanSummary.substring(0, 30)}...`,
            sourceSessionId: sourceSessionId,
            sessionQuestions: sessionQuestions,
            remedialActions: data.remedial_actions || [],
            advancementActions: data.advancement_actions || []
        });

        await bounty.save();
        logger.info(`Generated SessionChallenge for user ${userId} with ${sessionQuestions.length} questions`);

        // Return array for compatibility with existing flow (though now it's just one item)
        return [bounty];

    } catch (error) {
        console.error("Error generating session challenges:", error);
        return [];
    }
}

/**
 * Evaluates a submitted Session Challenge (Batch of 5 Questions).
 * Allows partial submission.
 */
async function evaluateSessionChallenge(userId, bountyId, answers) {
    try {
        const bounty = await Bounty.findOne({ _id: bountyId, userId });
        if (!bounty || bounty.type !== 'SessionChallenge') throw new Error("Invalid session challenge.");

        const user = userId ? await User.findById(userId).select('+encryptedApiKey') : null;
        let apiKey = process.env.GEMINI_API_KEY;
        if (user && user.encryptedApiKey) apiKey = decrypt(user.encryptedApiKey);

        // Filter valid answers (indices 0-4)
        const validIndices = Object.keys(answers).map(Number).filter(i => i >= 0 && i < bounty.sessionQuestions.length);

        if (validIndices.length === 0) {
            throw new Error("No valid answers submitted.");
        }

        // Construct grading prompt
        let q_a_pairs = "";
        validIndices.forEach(idx => {
            const q = bounty.sessionQuestions[idx];
            q_a_pairs += `Q${idx + 1} (${q.subTopic}): ${q.questionText}\nStudent Answer: ${answers[idx]}\n\n`;
        });

        const gradingPrompt = `You are an expert academic grader. Grade the student's answers for a session assessment.
        
        ${q_a_pairs}

        Instructions:
        1. Evaluate based on correctness and depth.
        2. Provide a single JSON object:
        {
            "overallScore": <0-100 average of ANSWERED questions>,
            "overallFeedback": "<Concise summary feedback>",
            "strongAreas": [ { "subTopic": "...", "recommendation": "..." } ],
            "weakAreas": [ { "subTopic": "...", "recommendation": "..." } ]
        }
        3. For weak areas, suggest specific remedial actions (e.g., "Review X").
        `;

        const preferredProvider = user?.preferredLlmProvider || 'gemini';
        let respText = null;
        if (preferredProvider === 'ollama') {
            // ... ollama logic (abbreviated for brevity, same pattern) ...
            const ollamaUrl = user?.ollamaUrl || process.env.OLLAMA_API_BASE_URL;
            respText = await ollamaService.generateContentWithHistory([], gradingPrompt, null, { model: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL, ollamaUrl });
        } else {
            respText = await geminiService.generateContentWithHistory([], gradingPrompt, null, { apiKey });
        }

        let parsed = null;
        try {
            parsed = JSON.parse(respText);
        } catch (e) {
            const m = (respText || '').match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
            else throw new Error("Failed to parse grading response");
        }

        const finalScore = parsed.overallScore || 0;
        const feedback = parsed.overallFeedback || "Assessment completed.";

        // Map strengths/weaknesses to Bridge Actions if available
        const mappedWeakAreas = (parsed.weakAreas || []).map(w => {
            // Try to match with remedial actions stored in bounty
            const storedAction = bounty.remedialActions?.find(a => a.tag?.toLowerCase().includes(w.subTopic?.toLowerCase()));
            return {
                subTopic: w.subTopic,
                recommendation: storedAction ? storedAction.next_session_prompt : w.recommendation
            };
        });

        const mappedStrongAreas = (parsed.strongAreas || []).map(s => {
            const storedAction = bounty.advancementActions?.find(a => a.tag?.toLowerCase().includes(s.subTopic?.toLowerCase()));
            return {
                subTopic: s.subTopic,
                recommendation: storedAction ? storedAction.next_session_prompt : "Concept Mastered"
            };
        });


        // Save results
        bounty.isSolved = true;
        bounty.userScore = finalScore;
        bounty.aiFeedback = feedback;
        bounty.userAnswers = answers; // Store their specific answers
        bounty.strongAreas = mappedStrongAreas;
        bounty.weakAreas = mappedWeakAreas;
        await bounty.save();

        // Save TestResult for Reports
        const testResult = new TestResult({
            userId,
            bountyId,
            topic: bounty.topic + " Assessment", // Use the specific topic
            score: finalScore,
            strongAreas: mappedStrongAreas,
            weakAreas: mappedWeakAreas,
            feedback: feedback,
            groupId: bounty.groupId || `session-${Date.now()}` // Fallback
        });
        await testResult.save();

        // Award XP
        // Base: score * 2 (up to 200 XP for a full session challenge)
        const xpEarned = Math.round(finalScore * 2);
        await UserScore.findOneAndUpdate(
            { userId },
            { $inc: { totalXP: xpEarned, testingCredits: 10, completedAssessments: 1 } },
            { upsert: true }
        );

        return {
            score: finalScore,
            feedback,
            solved: true,
            xpEarned,
            strongAreas: mappedStrongAreas,
            weakAreas: mappedWeakAreas,
            reportId: testResult._id
        };

    } catch (err) {
        console.error("Error evaluating session challenge:", err);
        throw err;
    }
}

/**
 * Evaluates a submitted quiz, provides granular analysis, and saves the result.
 */
async function evaluateQuiz(userId, bountyId, userAnswers) {
    try {
        const bounty = await Bounty.findOne({ _id: bountyId, userId });
        if (!bounty || bounty.type !== 'Quiz') throw new Error("Invalid quiz challenge.");

        let correctCount = 0;
        const subTopicStats = {}; // { subTopic: { correct: 0, total: 0 } }

        // 1. Grade the quiz
        bounty.quizData.forEach((question, index) => {
            const isCorrect = userAnswers[index] === question.correctIndex;
            if (isCorrect) correctCount++;

            if (!subTopicStats[question.subTopic]) {
                subTopicStats[question.subTopic] = { correct: 0, total: 0 };
            }
            subTopicStats[question.subTopic].total++;
            if (isCorrect) subTopicStats[question.subTopic].correct++;
        });

        const finalScore = Math.round((correctCount / bounty.quizData.length) * 100);

        // 2. Analyze weak/strong areas and map to Bridge Prompts
        const breakdown = [];
        const strongAreas = [];
        const weakAreas = [];

        for (const [subTopic, stats] of Object.entries(subTopicStats)) {
            const percentage = (stats.correct / stats.total) * 100;
            breakdown.push({ subTopic, correctCount: stats.correct, totalCount: stats.total, percentage });

            // Normalize subTopic for matching (optional, depends on string strictness)
            const cleanTopic = subTopic.trim();

            if (percentage >= 80) {
                // Find advancement action
                const action = bounty.advancementActions?.find(a => a.tag === cleanTopic);
                strongAreas.push({
                    subTopic: cleanTopic,
                    recommendation: action ? action.next_session_prompt : `You've mastered ${cleanTopic}!`
                });
            }

            if (percentage <= 60) {
                // Find remedial action
                const action = bounty.remedialActions?.find(a => a.tag === cleanTopic);
                weakAreas.push({
                    subTopic: cleanTopic,
                    recommendation: action ? action.next_session_prompt : `Review core concepts of ${cleanTopic}`
                });
            }
        }

        // 3. Save TestResult
        const testResult = new TestResult({
            userId,
            bountyId,
            topic: bounty.topic,
            score: finalScore,
            breakdown,
            strongAreas,
            weakAreas
        });
        await testResult.save();

        // 4. Mark bounty as solved & Award XP
        if (!bounty.isSolved) {
            bounty.isSolved = true;
            bounty.save();

            // Grant XP based on score (e.g., Score * 1.5)
            const xpEarned = Math.round(finalScore * 1.5);

            await UserScore.findOneAndUpdate(
                { userId },
                { $inc: { totalXP: xpEarned, testingCredits: 5, completedAssessments: 1 } }, // Bonus credits for completing a quiz
                { upsert: true }
            );
        }

        return testResult;

    } catch (error) {
        console.error("Error evaluating quiz:", error);
        throw error;
    }
}

/**
 * Auto-grade an open-ended challenge answer using the user's preferred LLM (ollama -> gemini fallback).
 * Returns an object: { score, feedback, solved }
 */
async function gradeOpenAnswer(userId, bountyId, answerText) {
    try {
        let bounty = await Bounty.findOne({ _id: bountyId });
        if (!bounty) throw new Error('Bounty not found');

        const user = userId ? await User.findById(userId).select('+encryptedApiKey') : null;
        let apiKey = process.env.GEMINI_API_KEY;
        if (user && user.encryptedApiKey) apiKey = decrypt(user.encryptedApiKey);

        // Build grading prompt with richer feedback request
        const gradingPrompt = `You are an expert academic grader. Grade the student's answer to the question below on a scale 0-100.
Question: ${bounty.question}
Student Answer: ${answerText}

Instructions:
1) Provide a JSON object ONLY with the following structure:
{
  "score": <int 0-100>,
  "feedback": "<short general feedback>",
  "solved": <boolean, true if score >= 60>,
  "strengths": ["<concept user understood>", ...],
  "improvements": [
     { "area": "<concept missed/wrong>", "recommendation": "<specific action, e.g. Review X>" }
  ]
}
2) Be strict but fair.
3) Use 60 as a passing threshold.
`;

        // Choose provider
        const preferredProvider = user?.preferredLlmProvider || 'gemini';
        let respText = null;
        try {
            if (preferredProvider === 'ollama') {
                const ollamaUrl = user?.ollamaUrl || process.env.OLLAMA_API_BASE_URL;
                const isOllamaUp = await checkOllamaHealth(ollamaUrl);
                if (isOllamaUp) {
                    respText = await ollamaService.generateContentWithHistory([], gradingPrompt, null, { model: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL, ollamaUrl });
                } else {
                    respText = await geminiService.generateContentWithHistory([], gradingPrompt, null, { apiKey });
                }
            } else {
                respText = await geminiService.generateContentWithHistory([], gradingPrompt, null, { apiKey });
            }
        } catch (llmErr) {
            console.error('[GamificationService] LLM grading error:', llmErr?.message || llmErr);
            throw new Error("AI Grading Service unavailable. Please try again.");
        }

        // Parse JSON from LLM response
        let parsed = null;
        try {
            parsed = JSON.parse(respText);
        } catch (e) {
            const m = (respText || '').match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
            else throw new Error("Failed to parse AI grading response.");
        }

        const score = Number(parsed.score) || 0;
        const feedback = String(parsed.feedback || '').slice(0, 1000);
        const solved = !!parsed.solved;
        const strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
        const improvements = Array.isArray(parsed.improvements) ? parsed.improvements : [];

        // If solved, mark bounty solved and award XP
        if (solved) {
            try {
                // Determine base XP based on bounty difficulty if available, else default 50
                const baseXP = bounty.xpReward || 50;
                // Bonus for high score: +10% if score > 90
                const bonus = score > 90 ? Math.round(baseXP * 0.1) : 0;

                await solveBountyInternal(userId, bountyId);

                if (bonus > 0) {
                    await UserScore.findOneAndUpdate(
                        { userId },
                        { $inc: { totalXP: bonus } }
                    );
                }

                // Refresh local bounty instance
                const refreshedBounty = await Bounty.findById(bountyId);
                if (refreshedBounty) {
                    bounty = refreshedBounty;
                }
            } catch (e) {
                console.error('Error awarding bounty on solve:', e);
            }
        }

        // --- Prepare Report Data ---
        // Map simple strings to object structure if needed, or store as is if TestResult schema allows
        // TestResult schema: strongAreas: [{subTopic, recommendation}], weakAreas: [{subTopic, recommendation}]

        const mappedStrongAreas = strengths.map(s => ({
            subTopic: s,
            recommendation: "Mastered"
        }));

        const mappedWeakAreas = improvements.map(i => ({
            subTopic: i.area || "General",
            recommendation: i.recommendation || "Review this topic"
        }));

        const testResult = new TestResult({
            userId,
            bountyId,
            topic: bounty.topic,
            score,
            breakdown: [],
            strongAreas: mappedStrongAreas,
            weakAreas: mappedWeakAreas,
            feedback
        });
        await testResult.save();
        return { score, feedback, solved, reportId: testResult._id, strongAreas: mappedStrongAreas, weakAreas: mappedWeakAreas };


    } catch (err) {
        console.log('DEBUG_ERROR_STACK:', err.stack);
        console.error('Error in gradeOpenAnswer:', err.message || err);
        throw err;
    }
}


/**
 * Generates a short diagnostic quiz to determine starting level.
 */
async function generateDiagnosticQuiz(userId, topic) {
    try {
        const user = await User.findById(userId).select('+encryptedApiKey');
        let apiKey = process.env.GEMINI_API_KEY;
        if (user && user.encryptedApiKey) apiKey = decrypt(user.encryptedApiKey);

        // Strict prompt for simple JSON output
        const prompt = `Create a 5-question multiple-choice diagnostic quiz for the topic "${topic}".
        Questions should range from easy to hard.
        Return ONLY a raw JSON object (no markdown formatting) with this structure:
        {
          "questions": [
            {
              "question": "Question text here",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "answer": "Correct Option Text" 
            }
          ]
        }`;

        const preferredProvider = user?.preferredLlmProvider || 'gemini';
        let responseText = null;

        if (preferredProvider === 'ollama') {
            const ollamaUrl = user?.ollamaUrl || process.env.OLLAMA_API_BASE_URL;
            const isOllamaUp = await checkOllamaHealth(ollamaUrl);
            if (isOllamaUp) {
                responseText = await ollamaService.generateContentWithHistory([], prompt, null, { model: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL, ollamaUrl });
            } else {
                responseText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey });
            }
        } else {
            responseText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey });
        }

        // Clean and parse JSON
        let quizData = null;
        try {
            // Remove markdown code blocks if present
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            quizData = JSON.parse(cleanText);
        } catch (e) {
            console.error("JSON Parse Error in Diagnostic:", e);
            // Fallback match
            const m = responseText.match(/\{[\s\S]*\}/);
            if (m) quizData = JSON.parse(m[0]);
            else throw new Error("Failed to parse diagnostic quiz JSON.");
        }

        return quizData; // { questions: [...] }

    } catch (error) {
        console.error("Error generating diagnostic quiz:", error);
        // Fallback quiz to prevent 500 error blocking flow
        return {
            questions: [
                { question: `What is a key concept in ${topic}?`, options: ["Syntax", "Logic", "Compilation", "All of the above"], answer: "All of the above" },
                { question: `True or False: ${topic} is popular?`, options: ["True", "False"], answer: "True" },
                { question: `Select the best description for ${topic}`, options: ["Programming Language", "Operating System", "Database", "None"], answer: "Programming Language" }
            ]
        };
    }
}

/**
 * Evaluates the diagnostic quiz and assigns a starting level.
 */
async function evaluateDiagnosticQuiz(userId, topic, answers) {
    // answers: [{ question: "...", answer: "..." }]
    // Simple evaluation: count correct matches based on some logic or re-ask LLM? 
    // Since we didn't store the diagnostic quiz in DB (it's ephemeral), we might need to trust the client or re-verify?
    // Actually, for a robust system, we should have stored it. 
    // BUT, to keep it simple and fix the immediate "flow" as per user request:
    // We will assume the frontend sends back the questions AND the user's answers, OR we accept the logic that the frontend handles.
    // However, the prompt says "Call custom backend... determine proficiency".
    // Let's use an LLM grader for the diagnostic to be safe and flexible, 
    // passing the Q & A pair to the LLM to judge "Level".

    try {
        const user = await User.findById(userId).select('+encryptedApiKey');
        let apiKey = process.env.GEMINI_API_KEY;
        if (user && user.encryptedApiKey) apiKey = decrypt(user.encryptedApiKey);

        const prompt = `You are a placement officer. Based on the user's answers to these diagnostic questions about "${topic}", determine their starting proficiency level.
        
        User's Quiz Session:
        ${JSON.stringify(answers)}

        Return ONLY a JSON object:
        {
          "level": "Beginner" | "Intermediate" | "Advanced",
          "summary": "Brief explanation of why (1 sentence)."
        }`;

        const preferredProvider = user?.preferredLlmProvider || 'gemini';
        let responseText = null;

        if (preferredProvider === 'ollama') {
            const ollamaUrl = user?.ollamaUrl || process.env.OLLAMA_API_BASE_URL;
            const isOllamaUp = await checkOllamaHealth(ollamaUrl);
            if (isOllamaUp) {
                responseText = await ollamaService.generateContentWithHistory([], prompt, null, { model: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL, ollamaUrl });
            } else {
                responseText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey });
            }
        } else {
            responseText = await geminiService.generateContentWithHistory([], prompt, null, { apiKey });
        }

        let result = null;
        try {
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            result = JSON.parse(cleanText);
        } catch (e) {
            const m = responseText.match(/\{[\s\S]*\}/);
            if (m) result = JSON.parse(m[0]);
            else {
                // Fallback default
                result = { level: "Beginner", summary: "Placement analysis failed, defaulting to Beginner." };
            }
        }

        return result;

    } catch (error) {
        console.error("Error evaluating diagnostic:", error);
        return { level: "Beginner", summary: "Error during placement, defaulting to Beginner." };
    }
}

async function getOrCreateProfile(userId) {
    try {
        let score = await UserScore.findOne({ userId });
        if (!score) {
            score = new UserScore({ userId, totalXP: 0, level: 1 });
            await score.save();
        }
        return score;
    } catch (error) {
        console.error("Error in getOrCreateProfile:", error);
        throw error;
    }
}

/**
 * Creates a new Skill Tree Game
 */
async function createGame(userId, gameData) {
    try {
        // limit to 10 games per user to prevent spam
        const count = await SkillTreeGame.countDocuments({ userId });
        if (count >= 10) {
            throw new Error('Maximum limit of 10 skill trees reached. Please delete an older one.');
        }

        const game = new SkillTreeGame({
            userId,
            ...gameData
        });
        await game.save();
        return game;
    } catch (error) {
        console.error("Error creating game:", error);
        throw error;
    }
}

/**
 * Get all Skill Tree Games for a user
 */
async function getGames(userId) {
    try {
        const games = await SkillTreeGame.find({ userId }).sort({ updatedAt: -1 });
        return games;
    } catch (error) {
        console.error("Error fetching games:", error);
        throw error;
    }
}

/**
 * Delete a Skill Tree Game
 */
async function deleteGame(userId, gameId) {
    try {
        const result = await SkillTreeGame.findOneAndDelete({ _id: gameId, userId });
        if (!result) {
            throw new Error('Game not found or unauthorized');
        }
        return { message: 'Game deleted successfully' };
    } catch (error) {
        console.error("Error deleting game:", error);
        throw error;
    }
}

module.exports = {
    solveBountyInternal,
    createChallenge,
    generateQuizChallenge,
    evaluateQuiz,
    generateSessionChallenges,
    gradeOpenAnswer,
    evaluateSessionChallenge,
    generateDiagnosticQuiz,
    evaluateDiagnosticQuiz,
    getOrCreateProfile,
    createGame,
    getGames,
    deleteGame
};


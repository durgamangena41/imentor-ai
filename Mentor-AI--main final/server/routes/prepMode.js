const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PrepSession = require('../models/PrepSession');
const { logger, auditLog } = require('../utils/logger');
const { runWithGeminiKeyRotation } = require('../services/geminiKeyRotationService');

const router = express.Router();

const MODEL_CANDIDATES = Array.from(new Set([
    process.env.GEMINI_MODEL,
    process.env.GEMINI_MODEL_NAME,
    'gemini-2.0-flash',
].filter(Boolean)));

function getGeminiModel(modelName, apiKey) {
    if (!apiKey) {
        throw new Error('Gemini API key is not configured.');
    }

    const normalizedModelName = String(modelName || '').replace(/^models\//, '');
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: normalizedModelName });
}

function isModelNotFoundError(error) {
    const text = String(error?.message || '').toLowerCase();
    return text.includes('404') || text.includes('not found') || text.includes('models/');
}

function isQuotaExceededError(error) {
    const text = String(error?.message || '').toLowerCase();
    return text.includes('429')
        || text.includes('quota')
        || text.includes('rate limit')
        || text.includes('too many requests')
        || text.includes('rpm limit')
        || text.includes('all gemini keys');
}

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2);
}

function localEvaluateAnswer(userAnswer, expectedPoints) {
    const answerTokens = new Set(tokenize(userAnswer));

    const pointMatches = expectedPoints.map((point) => {
        const pointTokens = tokenize(point);
        const uniquePointTokens = [...new Set(pointTokens)];
        if (!uniquePointTokens.length) {
            return { point, ratio: 0 };
        }

        const matchedCount = uniquePointTokens.filter((token) => answerTokens.has(token)).length;
        const ratio = matchedCount / uniquePointTokens.length;
        return { point, ratio };
    });

    const matchedPoints = pointMatches
        .filter((item) => item.ratio >= 0.45)
        .map((item) => item.point);

    const missedPoints = expectedPoints.filter((point) => !matchedPoints.includes(point));

    const coverage = expectedPoints.length ? matchedPoints.length / expectedPoints.length : 0;
    const score = Math.max(0, Math.min(10, Math.round((coverage * 10) * 10) / 10));

    return {
        score,
        whatWasCorrect: matchedPoints.length
            ? matchedPoints.map((point) => `You addressed: ${point}`)
            : ['Your answer did not clearly cover the key expected points.'],
        whatWasMissing: missedPoints.length
            ? missedPoints.map((point) => `Missing or unclear: ${point}`)
            : ['Great coverage. You covered all key points.'],
        matchedPoints,
        missedPoints,
        improvedModelAnswer: [
            'A stronger answer should include these key points:',
            ...expectedPoints.map((point, index) => `${index + 1}. ${point}`),
        ].join('\n'),
        usedFallback: true,
        fallbackReason: 'Gemini quota exceeded. Used local rubric evaluation.',
    };
}

async function generateWithModelFallback(prompt) {
    let lastError = null;
    const attemptedModels = [];

    for (const modelName of MODEL_CANDIDATES) {
        try {
            attemptedModels.push(modelName);
            const result = await runWithGeminiKeyRotation(async (apiKey) => {
                const model = getGeminiModel(modelName, apiKey);
                return model.generateContent(prompt);
            });
            const text = result.response?.text() || '';
            return { text, modelName };
        } catch (error) {
            lastError = error;
            if (!isModelNotFoundError(error)) {
                throw error;
            }
        }
    }

    if (lastError) {
        lastError.message = `${lastError.message} | attemptedModels=${attemptedModels.join(',')}`;
        throw lastError;
    }

    throw new Error('No usable Gemini model found for Prep Mode.');
}

function clampCount(count) {
    const allowed = [5, 10, 15];
    const value = Number(count);
    return allowed.includes(value) ? value : 5;
}

function normalizeType(value) {
    const type = String(value || '').trim().toLowerCase();
    return type === 'interview' ? 'interview' : 'exam';
}

function normalizeDifficulty(value) {
    const difficulty = String(value || '').trim().toLowerCase();
    if (['easy', 'medium', 'hard'].includes(difficulty)) {
        return difficulty;
    }
    return 'medium';
}

function extractJsonText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Model returned an empty response.');
    }

    const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = codeBlockMatch ? codeBlockMatch[1] : rawText;
    return candidate.trim();
}

function safeJsonParse(rawText) {
    const jsonText = extractJsonText(rawText);

    try {
        return JSON.parse(jsonText);
    } catch {
        const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            return JSON.parse(arrayMatch[0]);
        }

        const objectMatch = jsonText.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            return JSON.parse(objectMatch[0]);
        }

        throw new Error('Failed to parse model JSON response.');
    }
}

function normalizeQuestions(rawQuestions) {
    if (!Array.isArray(rawQuestions)) {
        return [];
    }

    return rawQuestions.map((item, index) => {
        const expectedPointsRaw = Array.isArray(item?.expectedPoints) ? item.expectedPoints :
            (Array.isArray(item?.expected_answer_key_points) ? item.expected_answer_key_points : []);
        const commonMistakesRaw = Array.isArray(item?.commonMistakes) ? item.commonMistakes :
            (Array.isArray(item?.common_mistakes) ? item.common_mistakes : []);

        return {
            question: String(item?.question || item?.questionText || `Question ${index + 1}`).trim(),
            expectedPoints: expectedPointsRaw
                .map((point) => String(point).trim())
                .filter(Boolean)
                .slice(0, 5),
            commonMistakes: commonMistakesRaw
                .map((mistake) => String(mistake).trim())
                .filter(Boolean)
                .slice(0, 6),
            difficultyRating: Math.max(1, Math.min(5, Number(item?.difficultyRating || item?.difficulty_rating || 3) || 3)),
        };
    });
}

function buildExpectedPoints(topic, baseFocus) {
    return [
        `Clear definition of ${baseFocus} in ${topic}`,
        `Core reasoning or mechanism behind ${baseFocus}`,
        `Practical example or application related to ${topic}`,
        'Common pitfalls and how to avoid them',
    ];
}

function buildCommonMistakes(baseFocus) {
    return [
        `Giving a generic answer without addressing ${baseFocus}`,
        'Skipping trade-offs or edge cases',
        'Not supporting claims with a concrete example',
        'Confusing related concepts without clear distinction',
    ];
}

function localGenerateQuestions({ topic, type, difficulty, count }) {
    const interviewTemplates = [
        `Explain ${topic} to a beginner and highlight what matters most in real projects.`,
        `What trade-offs do you consider when applying ${topic} in production systems?`,
        `Describe a real scenario where ${topic} improved performance or quality.`,
        `How would you debug a failure related to ${topic}? Share your approach step by step.`,
        `What mistakes do candidates usually make when discussing ${topic} in interviews?`,
        `How do you evaluate whether ${topic} is the right approach for a new problem?`,
    ];

    const examTemplates = [
        `Define ${topic} and explain its key components with a structured answer.`,
        `Differentiate ${topic} from closely related concepts with clear examples.`,
        `Explain the workflow of ${topic} from input to output.`,
        `Discuss advantages, limitations, and ideal use-cases of ${topic}.`,
        `Solve a conceptual problem that requires applying ${topic} correctly.`,
        `Write short notes on implementation best practices for ${topic}.`,
    ];

    const chosenTemplates = type === 'interview' ? interviewTemplates : examTemplates;
    const baseRating = difficulty === 'easy' ? 2 : difficulty === 'hard' ? 5 : 3;

    return Array.from({ length: count }, (_, index) => {
        const question = chosenTemplates[index % chosenTemplates.length];
        const focus = `${topic} concept ${index + 1}`;

        return {
            question,
            expectedPoints: buildExpectedPoints(topic, focus),
            commonMistakes: buildCommonMistakes(focus),
            difficultyRating: Math.max(1, Math.min(5, baseRating + (index % 2 === 0 ? 0 : 1))),
        };
    });
}

router.post('/generate-questions', async (req, res) => {
    const topic = String(req.body?.topic || '').trim();
    const type = normalizeType(req.body?.type);
    const difficulty = normalizeDifficulty(req.body?.difficulty);
    const count = clampCount(req.body?.count);

    if (!topic) {
        return res.status(400).json({ message: 'Topic is required.' });
    }

    try {
        const prompt = [
            `Generate ${count} ${type} questions on ${topic} at ${difficulty} level.`,
            'For each question provide:',
            '1. question',
            '2. expectedPoints (3-5 bullet points)',
            '3. commonMistakes',
            '4. difficultyRating (1-5)',
            'Return strict JSON array only.',
            'Do not include markdown code fences.'
        ].join('\n');

        const { text, modelName } = await generateWithModelFallback(prompt);
        const parsed = safeJsonParse(text);
        const questions = normalizeQuestions(parsed);

        if (!questions.length) {
            return res.status(502).json({ message: 'Question generation returned no valid questions.' });
        }

        auditLog(req, 'PREP_QUESTIONS_GENERATED', {
            topic,
            type,
            difficulty,
            count: questions.length,
            model: modelName,
        });

        return res.status(200).json({ questions });
    } catch (error) {
        if (isQuotaExceededError(error)) {
            const fallbackQuestions = localGenerateQuestions({ topic, type, difficulty, count });

            auditLog(req, 'PREP_QUESTIONS_GENERATED_FALLBACK', {
                topic,
                type,
                difficulty,
                count: fallbackQuestions.length,
            });

            return res.status(200).json({
                questions: fallbackQuestions,
                usedFallback: true,
                fallbackReason: 'Gemini quota exceeded. Used local template question generation.',
            });
        }

        logger.error('[PrepMode] Failed to generate questions', {
            message: error.message,
            stack: error.stack,
            topic,
            type,
            difficulty,
            count,
        });

        return res.status(500).json({ message: `Failed to generate questions: ${error.message}` });
    }
});

router.post('/evaluate-answer', async (req, res) => {
    const question = String(req.body?.question || '').trim();
    const userAnswer = String(req.body?.userAnswer || '').trim();
    const expectedPoints = Array.isArray(req.body?.expectedPoints)
        ? req.body.expectedPoints.map((point) => String(point).trim()).filter(Boolean)
        : [];

    if (!question || !userAnswer || expectedPoints.length === 0) {
        return res.status(400).json({ message: 'question, userAnswer, and expectedPoints are required.' });
    }

    try {
        const prompt = [
            `Question: ${question}`,
            `Student answer: "${userAnswer}"`,
            `Expected points: ${JSON.stringify(expectedPoints)}`,
            'Evaluate this answer and return JSON object with keys:',
            'score (0-10 number),',
            'whatWasCorrect (array of strings),',
            'whatWasMissing (array of strings),',
            'matchedPoints (array of strings selected from expected points that are covered),',
            'missedPoints (array of strings selected from expected points that are not covered),',
            'improvedModelAnswer (string).',
            'Do not include markdown code fences.'
        ].join('\n');

        const { text, modelName } = await generateWithModelFallback(prompt);
        const parsed = safeJsonParse(text);

        const matchedPoints = Array.isArray(parsed.matchedPoints)
            ? parsed.matchedPoints.map((point) => String(point).trim()).filter(Boolean)
            : [];

        const missedPoints = Array.isArray(parsed.missedPoints)
            ? parsed.missedPoints.map((point) => String(point).trim()).filter(Boolean)
            : expectedPoints.filter((point) => !matchedPoints.includes(point));

        const payload = {
            score: Math.max(0, Math.min(10, Number(parsed.score) || 0)),
            whatWasCorrect: Array.isArray(parsed.whatWasCorrect)
                ? parsed.whatWasCorrect.map((item) => String(item).trim()).filter(Boolean)
                : [],
            whatWasMissing: Array.isArray(parsed.whatWasMissing)
                ? parsed.whatWasMissing.map((item) => String(item).trim()).filter(Boolean)
                : [],
            matchedPoints,
            missedPoints,
            improvedModelAnswer: String(parsed.improvedModelAnswer || '').trim(),
        };

        auditLog(req, 'PREP_ANSWER_EVALUATED', {
            question,
            expectedPointsCount: expectedPoints.length,
            score: payload.score,
            model: modelName,
        });

        return res.status(200).json(payload);
    } catch (error) {
        if (isQuotaExceededError(error)) {
            const fallbackPayload = localEvaluateAnswer(userAnswer, expectedPoints);

            auditLog(req, 'PREP_ANSWER_EVALUATED_FALLBACK', {
                question,
                expectedPointsCount: expectedPoints.length,
                score: fallbackPayload.score,
            });

            return res.status(200).json(fallbackPayload);
        }

        logger.error('[PrepMode] Failed to evaluate answer', {
            message: error.message,
            stack: error.stack,
        });

        return res.status(500).json({ message: `Failed to evaluate answer: ${error.message}` });
    }
});

router.post('/save-session', async (req, res) => {
    const userId = req.user?._id;
    const topic = String(req.body?.topic || '').trim();
    const type = normalizeType(req.body?.type);
    const questions = Array.isArray(req.body?.questions)
        ? req.body.questions.map((q) => String(q).trim()).filter(Boolean)
        : [];
    const questionDetails = Array.isArray(req.body?.questionDetails)
        ? req.body.questionDetails.map((item) => ({
            question: String(item?.question || '').trim(),
            expectedPoints: Array.isArray(item?.expectedPoints)
                ? item.expectedPoints.map((point) => String(point).trim()).filter(Boolean).slice(0, 8)
                : [],
            commonMistakes: Array.isArray(item?.commonMistakes)
                ? item.commonMistakes.map((mistake) => String(mistake).trim()).filter(Boolean).slice(0, 8)
                : [],
            difficultyRating: Math.max(1, Math.min(5, Number(item?.difficultyRating) || 3)),
        })).filter((item) => item.question)
        : [];
    const userAnswers = Array.isArray(req.body?.userAnswers)
        ? req.body.userAnswers.map((a) => String(a || '').trim())
        : [];
    const evaluations = Array.isArray(req.body?.evaluations)
        ? req.body.evaluations.map((evaluation) => {
            if (!evaluation || typeof evaluation !== 'object') {
                return null;
            }

            return {
                score: Math.max(0, Math.min(10, Number(evaluation.score) || 0)),
                whatWasCorrect: Array.isArray(evaluation.whatWasCorrect)
                    ? evaluation.whatWasCorrect.map((item) => String(item).trim()).filter(Boolean)
                    : [],
                whatWasMissing: Array.isArray(evaluation.whatWasMissing)
                    ? evaluation.whatWasMissing.map((item) => String(item).trim()).filter(Boolean)
                    : [],
                matchedPoints: Array.isArray(evaluation.matchedPoints)
                    ? evaluation.matchedPoints.map((item) => String(item).trim()).filter(Boolean)
                    : [],
                missedPoints: Array.isArray(evaluation.missedPoints)
                    ? evaluation.missedPoints.map((item) => String(item).trim()).filter(Boolean)
                    : [],
                improvedModelAnswer: String(evaluation.improvedModelAnswer || '').trim(),
            };
        })
        : [];
    const scores = Array.isArray(req.body?.scores)
        ? req.body.scores.map((score) => Math.max(0, Math.min(10, Number(score) || 0)))
        : [];

    const fallbackQuestions = questionDetails.map((item) => item.question);
    const questionsToSave = questions.length ? questions : fallbackQuestions;

    if (!userId || !topic || !questionsToSave.length) {
        return res.status(400).json({ message: 'userId, topic, and questions are required to save a session.' });
    }

    try {
        const totalScore = scores.reduce((sum, score) => sum + score, 0);
        const session = await PrepSession.create({
            userId,
            topic,
            type,
            questions: questionsToSave,
            questionDetails,
            userAnswers,
            evaluations,
            scores,
            totalScore,
            date: new Date(),
        });

        auditLog(req, 'PREP_SESSION_SAVED', {
            sessionId: session._id.toString(),
            topic,
            type,
            totalScore,
        });

        return res.status(201).json({
            message: 'Prep session saved successfully.',
            sessionId: session._id,
            totalScore,
        });
    } catch (error) {
        logger.error('[PrepMode] Failed to save session', {
            message: error.message,
            stack: error.stack,
            topic,
            type,
        });

        return res.status(500).json({ message: `Failed to save session: ${error.message}` });
    }
});

router.get('/history', async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const sessions = await PrepSession.find({ userId })
            .sort({ date: -1 })
            .limit(50)
            .lean();

        const totalAverage = sessions.length
            ? sessions.reduce((sum, session) => sum + (Number(session.totalScore) || 0), 0) / sessions.length
            : 0;

        const sessionsWithAverage = sessions.map((session) => {
            const perQuestionAverage = Array.isArray(session.scores) && session.scores.length
                ? session.scores.reduce((sum, score) => sum + (Number(score) || 0), 0) / session.scores.length
                : 0;

            return {
                ...session,
                averageScore: Number(perQuestionAverage.toFixed(2)),
            };
        });

        return res.status(200).json({
            sessions: sessionsWithAverage,
            averageScoreAcrossSessions: Number(totalAverage.toFixed(2)),
        });
    } catch (error) {
        logger.error('[PrepMode] Failed to get history', {
            message: error.message,
            stack: error.stack,
        });

        return res.status(500).json({ message: `Failed to fetch prep history: ${error.message}` });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Bounty = require('../models/Bounty');
const UserScore = require('../models/UserScore'); // Used for leaderboard
const { createChallenge, generateQuizChallenge, evaluateQuiz, gradeOpenAnswer, evaluateSessionChallenge, generateDiagnosticQuiz, evaluateDiagnosticQuiz, createGame, getGames, deleteGame } = require('../services/gamificationService');
const {
    generateLevels,
    generateLevelQuestions,
    updateLevelProgress
} = require('../services/skillTreeGameService');
const User = require('../models/User'); // Used to populate user details in leaderboard
const TestResult = require('../models/TestResult');
const { auditLog } = require('../utils/logger');

// @route   GET /api/gamification/bounties
// @desc    Get active bounties for the user
// Require authentication for all gamification routes - return 401 when session ended
router.use((req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    next();
});

// @route   GET /api/gamification/user-score
// @desc    Get current user's score and level
router.get('/user-score', async (req, res) => {
    try {
        let score = await UserScore.findOne({ userId: req.user._id });
        if (!score) {
            // Create default score if not exists
            score = await UserScore.create({ userId: req.user._id });
        }
        res.json(score);
    } catch (error) {
        console.error('Error fetching user score:', error);
        res.status(500).json({ message: 'Server error fetching user score.' });
    }
});
router.get('/bounties', async (req, res) => {
    try {
        const userId = req.user._id;
        // Fetch active (unsolved) bounties
        const bounties = await Bounty.find({ userId, isSolved: false }).sort({ createdAt: -1 });

        // If no bounties, maybe generate one automatically? (Optional feature)
        // For now, just return what exists.

        res.json(bounties);
    } catch (error) {
        console.error('Error fetching bounties:', error);
        res.status(500).json({ message: 'Server error fetching bounties.' });
    }
});

// @route   GET /api/gamification/leaderboard
// @desc    Get top 10 users by XP
router.get('/leaderboard', async (req, res) => {
    try {
        const scores = await UserScore.find()
            .sort({ totalXP: -1 })
            .limit(10)
            .populate('userId', 'username profile.name');

        const leaderboard = scores.map((score, index) => ({
            rank: index + 1,
            username: score.userId ? (score.userId.username || 'Unknown') : 'Unknown',
            level: score.level || 1,
            totalXP: score.totalXP || 0,
            testingCredits: score.testingCredits || 0
        }));

        res.json(leaderboard);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ message: 'Server error fetching leaderboard.' });
    }
});

// @route   POST /api/gamification/challenge/generate
// @desc    Manually trigger generation of a challenge
router.post('/challenge/generate', async (req, res) => {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ message: 'Topic is required.' });

    try {
        const bounty = await createChallenge(req.user._id, topic);
        if (bounty) {
            res.json(bounty);
        } else {
            res.status(500).json({ message: 'Failed to generate challenge.' });
        }
    } catch (error) {
        console.error('Error generating challenge:', error);
        res.status(500).json({ message: 'Server error generating challenge.' });
    }
});

// @route   POST /api/gamification/challenge/regenerate-weak
// @desc    Generate one focused challenge for a weak subtopic
router.post('/challenge/regenerate-weak', async (req, res) => {
    const subTopicRaw = req.body?.subTopic;
    const subTopic = typeof subTopicRaw === 'string' ? subTopicRaw.trim() : '';

    if (!subTopic) {
        return res.status(400).json({ message: 'subTopic is required.' });
    }

    try {
        const bounty = await createChallenge(req.user._id, subTopic);
        if (!bounty) {
            return res.status(500).json({ message: 'Failed to generate focused challenge.' });
        }

        res.status(201).json({
            message: 'Focused challenge generated successfully.',
            bounty,
        });
    } catch (error) {
        console.error('Error regenerating weak-topic challenge:', error);
        res.status(500).json({ message: 'Server error regenerating weak-topic challenge.' });
    }
});

// @route   POST /api/gamification/quiz/generate
// @desc    Generate a new quiz challenge for a topic
router.post('/quiz/generate', async (req, res) => {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ message: 'Topic is required.' });

    try {
        const bounty = await generateQuizChallenge(req.user._id, topic);
        if (bounty) {
            res.json(bounty);
        } else {
            res.status(500).json({ message: 'Failed to generate quiz.' });
        }
    } catch (error) {
        console.error('Error generating quiz:', error);
        res.status(500).json({ message: 'Server error generating quiz.' });
    }
});

// @route   POST /api/gamification/quiz/submit
// @desc    Submit answers for a quiz challenge
router.post('/quiz/submit', async (req, res) => {
    const { bountyId, answers } = req.body; // answers: [0, 1, 3, ...] (indices)

    if (!bountyId || !Array.isArray(answers)) {
        return res.status(400).json({ message: 'Bounty ID and answers array are required.' });
    }

    try {
        const result = await evaluateQuiz(req.user._id, bountyId, answers);
        res.json(result);
    } catch (error) {
        console.error('Error submitting quiz:', error);
        res.status(500).json({ message: 'Server error evaluating quiz.' });
    }
});

// @route   POST /api/gamification/challenge/submit
// @desc    Submit an open-ended challenge answer for auto-grading
router.post('/challenge/submit', async (req, res) => {
    const { bountyId, answer } = req.body;
    if (!bountyId || typeof answer !== 'string') return res.status(400).json({ message: 'Bounty ID and answer text are required.' });

    try {
        const result = await gradeOpenAnswer(req.user._id, bountyId, answer);
        res.json(result);
    } catch (error) {
        console.error('Error grading open challenge:', error);
        res.status(500).json({ message: 'Server error grading challenge.' });
    }
});

// @route   POST /api/gamification/session-challenge/submit
// @desc    Submit a session challenge (batch) for auto-grading
router.post('/session-challenge/submit', async (req, res) => {
    const { bountyId, answers } = req.body;
    if (!bountyId || !answers || typeof answers !== 'object') {
        return res.status(400).json({ message: 'Bounty ID and answers object are required.' });
    }

    try {
        const result = await evaluateSessionChallenge(req.user._id, bountyId, answers);
        res.json(result);
    } catch (error) {
        console.error('Error grading session challenge:', error);
        res.status(500).json({ message: 'Server error grading session challenge.' });
    }
});


// @route   GET /api/gamification/reports
// @desc    Get assessment reports (Real implementation)
router.get('/reports', async (req, res) => {
    try {
        const reports = await TestResult.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(1000)
            .populate({
                path: 'bountyId',
                select: 'sourceSessionId groupId'
            });

        // Transform for frontend if needed (the model matches the frontend expectation mostly)
        // Frontend expects: { topic, score, strengths:[], improvementsNeeded: [{area, reason, recommendation}] }

        const formattedReports = reports.map(r => ({
            _id: r._id,
            topic: r.topic,
            score: r.score,
            strengths: r.strongAreas.map(s => {
                // Handle both legacy string format and new object format
                if (typeof s === 'string') return s;
                return {
                    topic: s.subTopic,
                    reason: s.recommendation // Use recommendation as the reason/bridge text
                };
            }),
            improvementsNeeded: r.weakAreas.map(w => ({
                area: w.subTopic,
                recommendation: w.recommendation, // The Bridge Action prompt
                reason: `Score below 60% in ${w.subTopic}`
            })),
            sourceSessionId: r.bountyId?.sourceSessionId,
            testId: r._id
        }));

        res.json(formattedReports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ message: 'Server error fetching reports.' });
    }
});


// @route   POST /api/gamification/skill-tree/diagnostic
// @desc    Generate a diagnostic quiz for skill tree placement
router.post('/skill-tree/diagnostic', async (req, res) => {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ message: 'Topic is required.' });

    try {
        const quizData = await generateDiagnosticQuiz(req.user._id, topic);
        res.json(quizData);
    } catch (error) {
        console.error('Error generating diagnostic quiz:', error);
        res.status(500).json({ message: 'Server error generating diagnostic quiz.' });
    }
});

// @route   POST /api/gamification/skill-tree/diagnostic/submit
// @desc    Submit diagnostic answers to get starting level
router.post('/skill-tree/diagnostic/submit', async (req, res) => {
    const { topic, answers } = req.body;
    if (!topic || !answers) return res.status(400).json({ message: 'Topic and answers are required.' });

    try {
        const result = await evaluateDiagnosticQuiz(req.user._id, topic, answers);
        res.json(result);
    } catch (error) {
        console.error('Error submitting diagnostic:', error);
        res.status(500).json({ message: 'Server error evaluating diagnostic.' });
    }
});

// @route   GET /api/gamification/skill-tree/games
// @desc    Get all skill tree games for the user
router.get('/skill-tree/games', async (req, res) => {
    try {
        const games = await getGames(req.user._id);
        res.json({ games });
    } catch (error) {
        console.error('Error fetching skill tree games:', error);
        res.status(500).json({ message: 'Server error fetching games.' });
    }
});

// @route   POST /api/gamification/skill-tree/games
// @desc    Create a new skill tree game
router.post('/skill-tree/games', async (req, res) => {
    try {
        const game = await createGame(req.user._id, req.body);
        res.json(game);
    } catch (error) {
        console.error('Error creating skill tree game:', error);
        res.status(500).json({ message: 'Server error creating game.' });
    }
});

// @route   DELETE /api/gamification/skill-tree/games/:gameId
// @desc    Delete a skill tree game
router.delete('/skill-tree/games/:gameId', async (req, res) => {
    try {
        const result = await deleteGame(req.user._id, req.params.gameId);
        res.json(result);
    } catch (error) {
        console.error("Error deleting skill tree game:", error);
        res.status(500).json({ message: 'Server error deleting game.' });
    }
});

// --- Skill Tree Game Map Routes ---

// @route   POST /api/gamification/skill-tree/generate-levels
// @desc    Generate personalized levels for a skill tree
router.post('/skill-tree/generate-levels', async (req, res) => {
    const { topic, assessmentResult, answers } = req.body;
    try {
        const levels = await generateLevels(req.user._id, topic, assessmentResult, answers);
        res.json({ levels });
    } catch (error) {
        console.error('[GamificationRoutes] Error generating levels:', error);
        res.status(500).json({ message: 'Failed to generate levels.' });
    }
});

// @route   POST /api/gamification/skill-tree/level-questions
// @desc    Generate questions for a specific level
router.post('/skill-tree/level-questions', async (req, res) => {
    const { topic, levelName, difficulty } = req.body;
    try {
        const questions = await generateLevelQuestions(topic, levelName, difficulty);
        res.json({ questions });
    } catch (error) {
        console.error('[GamificationRoutes] Error generating level questions:', error);
        res.status(500).json({ message: 'Failed to generate questions.' });
    }
});

// @route   PATCH /api/gamification/skill-tree/games/:gameId/levels/:levelId
// @desc    Update progress for a specific level in a game
router.patch('/skill-tree/games/:gameId/levels/:levelId', async (req, res) => {
    try {
        const result = await updateLevelProgress(
            req.user._id,
            req.params.gameId,
            req.params.levelId,
            req.body
        );
        res.json(result);
    } catch (error) {
        console.error('[GamificationRoutes] Error updating level progress:', error);
        res.status(500).json({ message: 'Failed to update progress.' });
    }
});

module.exports = router;

const mongoose = require('mongoose');

const BountySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Standard Challenge Fields
    topic: { type: String, required: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    xpReward: { type: Number, default: 50 },
    isSolved: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },

    // New Fields for Test Mode / Quiz
    type: { type: String, enum: ['Single', 'Quiz', 'SessionChallenge'], default: 'Single' },

    // For Single Type
    question: { type: String }, // Single question text
    context: { type: String },

    // For Quiz Type
    quizData: [{
        questionText: String,
        options: [String], // Multiple choice options
        correctIndex: Number, // 0-3
        subTopic: String // e.g., "Reinforcement Learning" within "Machine Learning"
    }],

    // For SessionChallenge Type (New)
    sessionQuestions: [{
        questionText: String,
        subTopic: String,
        difficulty: String,
        context: String
    }],

    // Grouping for Session Challenges
    groupId: { type: String }, // Shared ID for a batch of challenges
    sourceSessionId: { type: String }, // Link back to the chat session
    userScore: { type: Number }, // Individual score
    aiFeedback: { type: String }, // Individual feedback
    userAnswers: { type: Map, of: String }, // Store user answers for session challenges
    strongAreas: [{
        subTopic: String,
        recommendation: String
    }],
    weakAreas: [{
        subTopic: String,
        recommendation: String
    }],

    // NEW: Bridge Actions for Assessment Engine
    remedialActions: [{
        tag: String,
        next_session_prompt: String
    }],
    advancementActions: [{
        tag: String,
        next_session_prompt: String
    }]
});

module.exports = mongoose.model('Bounty', BountySchema);

const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    questionText: { type: String, required: true },
    options: [{ type: String }], // Array of 4 choices for MCQ
    correctAnswer: { type: String, required: true },
    explanation: { type: String, default: '' },
    userAnswer: { type: String, default: '' },
    isCorrect: { type: Boolean, default: false },
    timeSpent: { type: Number, default: 0 } // Seconds spent on this question
}, { _id: true });

const RevisionPlanSchema = new mongoose.Schema({
    recommendedTopics: [{ type: String }],
    suggestedDocuments: [{ type: String }],
    estimatedRetryDate: { type: Date, default: null },
    aiSuggestions: { type: String, default: '' }
}, { _id: false });

const BossBattleSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Battle metadata
    battleId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    generatedAt: { type: Date, default: Date.now },
    expiresAt: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'failed', 'expired'],
        default: 'active',
        index: true
    },

    // Personalized content
    targetWeakness: {
        type: String,
        required: true
    }, // e.g., "linear regression assumptions"
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },

    // Battle questions
    questions: [QuestionSchema],
    totalQuestions: { type: Number, default: 5 },

    // Results
    score: { type: Number, default: 0, min: 0, max: 100 },
    correctAnswers: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    totalTimeSpent: { type: Number, default: 0 }, // Total seconds

    // Rewards
    earnedLearningCredits: { type: Number, default: 0 },
    earnedBadge: { type: String, default: '' },

    // AI-generated revision plan (if failed)
    revisionPlan: {
        type: RevisionPlanSchema,
        default: null
    },

    // Retry tracking
    isRetry: { type: Boolean, default: false },
    previousBattleId: { type: String, default: '' },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Indexes for performance
BossBattleSchema.index({ userId: 1, status: 1 });
BossBattleSchema.index({ expiresAt: 1 }); // For cleanup of expired battles
BossBattleSchema.index({ generatedAt: -1 }); // For recent battles query

// Method to check if battle is expired
BossBattleSchema.methods.isExpired = function () {
    return this.expiresAt < new Date() && this.status === 'active';
};

// Method to calculate score
BossBattleSchema.methods.calculateScore = function () {
    if (this.questions.length === 0) return 0;

    let correctCount = 0;
    this.questions.forEach(q => {
        if (q.isCorrect) correctCount++;
    });

    this.correctAnswers = correctCount;
    this.score = Math.round((correctCount / this.questions.length) * 100);
    return this.score;
};

// Method to determine pass/fail
BossBattleSchema.methods.isPassed = function () {
    return this.score >= 60; // 60% pass threshold
};

// Static method to expire old battles (cron job)
BossBattleSchema.statics.expireOldBattles = async function () {
    const result = await this.updateMany(
        {
            status: 'active',
            expiresAt: { $lt: new Date() }
        },
        {
            $set: { status: 'expired', updatedAt: new Date() }
        }
    );

    return result.modifiedCount;
};

// Pre-save hook
BossBattleSchema.pre('save', function (next) {
    // Auto-mark as expired if past expiration
    if (this.status === 'active' && this.isExpired()) {
        this.status = 'expired';
    }

    this.updatedAt = Date.now();
    next();
});

const BossBattle = mongoose.model('BossBattle', BossBattleSchema);

module.exports = BossBattle;

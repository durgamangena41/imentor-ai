// server/models/ConceptContribution.js
const mongoose = require('mongoose');

const ContentSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 2000 },
    front: { type: String, default: '' }, // For flashcards
    back: { type: String, default: '' }   // For flashcards
}, { _id: false });

const AIEvaluationSchema = new mongoose.Schema({
    accuracyScore: { type: Number, default: 0, min: 0, max: 100 },
    clarityScore: { type: Number, default: 0, min: 0, max: 100 },
    creativityScore: { type: Number, default: 0, min: 0, max: 100 },
    overallScore: { type: Number, default: 0, min: 0, max: 100 },
    feedback: { type: String, default: '', maxlength: 1000 },
    evaluatedAt: { type: Date, default: null }
}, { _id: false });

const ConceptContributionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    topic: {
        type: String,
        required: true,
        trim: true,
        index: true
    },

    type: {
        type: String,
        enum: ['flashcard', 'mnemonic', 'summary', 'analogy'],
        required: true,
        index: true
    },

    content: {
        type: ContentSchema,
        required: true
    },

    // AI evaluation
    aiEvaluation: {
        type: AIEvaluationSchema,
        default: () => ({})
    },

    // XP and rewards
    earnedXP: { type: Number, default: 0, min: 0 },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },

    // Community engagement (future feature)
    upvotes: { type: Number, default: 0, min: 0 },
    downvotes: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    isPublic: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },

    // Metadata
    tags: [{ type: String, trim: true }],
    difficulty: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'beginner'
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Indexes for performance
ConceptContributionSchema.index({ userId: 1, topic: 1 });
ConceptContributionSchema.index({ status: 1, isPublic: 1 });
ConceptContributionSchema.index({ topic: 1, type: 1 });
ConceptContributionSchema.index({ upvotes: -1 }); // For "top contributions" leaderboard

// Method to calculate XP based on evaluation
ConceptContributionSchema.methods.calculateXP = function () {
    if (!this.aiEvaluation || !this.aiEvaluation.overallScore) {
        return 0;
    }

    // XP formula: overallScore / 10 (so max 10 XP for perfect 100 score)
    // Bonus for creative types
    const baseXP = Math.floor(this.aiEvaluation.overallScore / 10);
    const creativityBonus = this.type === 'mnemonic' || this.type === 'analogy' ? 2 : 0;

    return Math.min(baseXP + creativityBonus, 15); // Cap at 15 XP
};

// Method to check if evaluation is complete
ConceptContributionSchema.methods.isEvaluated = function () {
    return this.aiEvaluation &&
        this.aiEvaluation.evaluatedAt !== null &&
        this.aiEvaluation.overallScore > 0;
};

// Static method to get top contributions
ConceptContributionSchema.statics.getTopContributions = async function (topic, limit = 10) {
    return await this.find({
        topic,
        status: 'approved',
        isPublic: true
    })
        .sort({ upvotes: -1, views: -1 })
        .limit(limit)
        .populate('userId', 'profile.name email');
};

// Pre-save hook
ConceptContributionSchema.pre('save', function (next) {
    // Auto-calculate XP if evaluation is complete and XP not set
    if (this.isEvaluated() && this.earnedXP === 0) {
        this.earnedXP = this.calculateXP();
    }

    // Auto-approve if AI score is high enough
    if (this.isEvaluated() &&
        this.aiEvaluation.overallScore >= 80 &&
        this.status === 'pending') {
        this.status = 'approved';
    }

    this.updatedAt = Date.now();
    next();
});

const ConceptContribution = mongoose.model('ConceptContribution', ConceptContributionSchema);

module.exports = ConceptContribution;

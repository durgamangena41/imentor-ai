// server/models/SkillTreeGame.js
const mongoose = require('mongoose');

const LevelSchema = new mongoose.Schema({
    id: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    difficulty: { 
        type: String, 
        enum: ['easy', 'medium', 'hard', 'boss'],
        default: 'easy'
    },
    status: {
        type: String,
        enum: ['locked', 'unlocked', 'completed'],
        default: 'locked'
    },
    stars: { type: Number, default: 0, min: 0, max: 3 },
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 5 },
    questions: [{
        question: { type: String },
        options: [{ type: String }],
        correctIndex: { type: Number },
        explanation: { type: String }
    }],
    completedAt: { type: Date },
    attempts: { type: Number, default: 0 }
}, { _id: false });

const SkillTreeGameSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    topic: {
        type: String,
        required: true,
        trim: true
    },
    assessmentResult: {
        level: { 
            type: String, 
            enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
            default: 'Beginner'
        },
        summary: { type: String, default: '' },
        strengths: [{ type: String }],
        improvements: [{ type: String }],
        recommendedStartingPoint: { type: String, default: '' },
        answers: [{
            question: { type: String },
            answer: { type: String }
        }]
    },
    levels: [LevelSchema],
    totalStars: { type: Number, default: 0 },
    completedLevels: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Compound index for user + topic (unique game per user per topic)
SkillTreeGameSchema.index({ userId: 1, topic: 1 }, { unique: true });

// Update timestamp on save
SkillTreeGameSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Calculate completed levels and total stars
    if (this.levels && this.levels.length > 0) {
        this.completedLevels = this.levels.filter(l => l.status === 'completed').length;
        this.totalStars = this.levels.reduce((sum, l) => sum + (l.stars || 0), 0);
    }
    
    next();
});

const SkillTreeGame = mongoose.model('SkillTreeGame', SkillTreeGameSchema);

module.exports = SkillTreeGame;

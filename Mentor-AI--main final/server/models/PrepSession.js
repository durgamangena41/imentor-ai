const mongoose = require('mongoose');

const PrepSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    topic: {
        type: String,
        required: true,
        trim: true,
    },
    type: {
        type: String,
        enum: ['interview', 'exam'],
        required: true,
    },
    questions: [{
        type: String,
        trim: true,
    }],
    questionDetails: [{
        question: {
            type: String,
            trim: true,
        },
        expectedPoints: [{
            type: String,
            trim: true,
        }],
        commonMistakes: [{
            type: String,
            trim: true,
        }],
        difficultyRating: {
            type: Number,
            min: 1,
            max: 5,
        },
    }],
    userAnswers: [{
        type: String,
        trim: true,
    }],
    evaluations: [{
        type: mongoose.Schema.Types.Mixed,
    }],
    scores: [{
        type: Number,
        min: 0,
        max: 10,
    }],
    totalScore: {
        type: Number,
        default: 0,
    },
    date: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

module.exports = mongoose.model('PrepSession', PrepSessionSchema);

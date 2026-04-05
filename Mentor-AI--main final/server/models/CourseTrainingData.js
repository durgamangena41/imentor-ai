// server/models/CourseTrainingData.js
const mongoose = require('mongoose');

const CourseTrainingDataSchema = new mongoose.Schema({
    subject: {
        type: String,
        required: true,
        index: true,
    },
    instruction: { // The prompt/question
        type: String,
        required: true,
    },
    output: { // The expected AI response
        type: String,
        required: true,
    },
    source: {
        type: String, // 'manual', 'synthetic', 'feedback'
        default: 'synthetic',
    },
    metadata: {
        difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
        taxonomy: [String], // e.g., ['Algebra', 'Quadratic Equations']
        originalDocId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminDocument' },
        isVerified: { type: Boolean, default: false },
    },
    version: {
        type: Number,
        default: 1,
    }
}, { timestamps: true });

CourseTrainingDataSchema.index({ subject: 1, source: 1 });

module.exports = mongoose.model('CourseTrainingData', CourseTrainingDataSchema);

const mongoose = require('mongoose');

const TestResultSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bountyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bounty', required: true },
    topic: { type: String, required: true },
    score: { type: Number, required: true }, // 0 to 100

    // Granular Analysis
    breakdown: [{
        subTopic: String,
        correctCount: Number,
        totalCount: Number,
        percentage: Number
    }],

    strongAreas: [mongoose.Schema.Types.Mixed], // Supports legacy [String] and new [{ subTopic, recommendation }]
    weakAreas: [{
        subTopic: String,
        recommendation: String // Specific advice or resource
    }],

    feedback: { type: String }, // Overall qualitative feedback
    groupId: { type: String }, // Reference to the batch if aggregated

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TestResult', TestResultSchema);

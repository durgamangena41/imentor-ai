// server/models/CourseModelRegistry.js
const mongoose = require('mongoose');

const CourseModelRegistrySchema = new mongoose.Schema({
    subject: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    activeModelTag: {
        type: String, // e.g., 'ollama/qwen-math:v1'
        required: true,
    },
    versions: [{
        tag: String,
        createdAt: { type: Date, default: Date.now },
        performanceScore: { type: Number, default: 0 },
        status: { type: String, enum: ['production', 'candidate', 'archived'], default: 'candidate' }
    }],
    abTest: {
        isEnabled: { type: Boolean, default: false },
        candidateModelTag: { type: String },
        trafficSplit: { type: Number, default: 0.1 } // Percentage of traffic to candidate
    },
    lastFinetunedAt: {
        type: Date
    }
}, { timestamps: true });

module.exports = mongoose.model('CourseModelRegistry', CourseModelRegistrySchema);

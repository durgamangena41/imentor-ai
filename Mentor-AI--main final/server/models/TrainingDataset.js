// server/models/TrainingDataset.js
const mongoose = require('mongoose');

const TrainingDatasetSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    subject: {
        type: String,
        required: true,
        index: true,
    },
    version: {
        type: String,
        required: true,
        default: '1.0.0',
    },
    description: {
        type: String,
    },
    fileContainerPath: { // Path to the JSON/GGUF/whatever file
        type: String,
    },
    rowCount: {
        type: Number,
    },
    status: {
        type: String,
        enum: ['active', 'archived', 'processing'],
        default: 'active',
    },
    metadata: {
        isBaseModelDataset: { type: Boolean, default: false },
        sourceType: { type: String, enum: ['human_feedback', 'synthetic', 'hybrid'], default: 'hybrid' }
    }
}, { timestamps: true });

TrainingDatasetSchema.index({ subject: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('TrainingDataset', TrainingDatasetSchema);

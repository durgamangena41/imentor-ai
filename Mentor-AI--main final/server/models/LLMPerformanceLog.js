// server/models/LLMPerformanceLog.js
const mongoose = require('mongoose');

const LLMPerformanceLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true, index: true },
  query: { type: String, required: true },
  response: { type: String }, // Optional depending on logging depth
  queryCategory: { type: String, index: true }, // e.g., 'coding', 'reasoning'
  chosenModelId: { type: String, required: true },
  routerLogic: { type: String }, // e.g., 'intelligent_v1', 'ab_test_b'
  isABTest: { type: Boolean, default: false },
  responseTimeMs: { type: Number },
  userFeedback: { type: String, enum: ['positive', 'negative', 'none'], default: 'none' },
  granularFeedback: {
    accuracy: { type: Number, min: 1, max: 5 },
    clarity: { type: Number, min: 1, max: 5 },
    completeness: { type: Number, min: 1, max: 5 },
    comment: { type: String }
  },
  qualityScore: { type: Number, default: 0 },
  isAmbiguous: { type: Boolean, default: false },
  metadata: { type: Map, of: mongoose.Schema.Types.Mixed }, // For flexible future logging
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('LLMPerformanceLog', LLMPerformanceLogSchema);
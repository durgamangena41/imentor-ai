// server/models/ResearchCache.js
const mongoose = require('mongoose');

const ResearchSourceSchema = new mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String },
    content: { type: String },
    sourceType: {
        type: String,
        enum: ['academic', 'web', 'local', 'pubmed', 'arxiv', 'semantic_scholar'],
        required: true,
    },
    credibilityScore: { type: Number, default: 0.5, min: 0, max: 1 },
    authors: [{ type: String }],
    publishedDate: { type: String },
    relevanceScore: { type: Number, default: 0, min: 0, max: 1 },
}, { _id: false });

const ResearchCacheSchema = new mongoose.Schema({
    queryHash: {
        type: String,
        required: true,
        index: true,
    },
    query: {
        type: String,
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    sources: [ResearchSourceSchema],
    synthesizedResult: {
        type: String,
        default: '',
    },
    researchStrategy: {
        type: Object,
        default: {},
    },
    sourceBreakdown: {
        localCount: { type: Number, default: 0 },
        onlineCount: { type: Number, default: 0 },
        totalCount: { type: Number, default: 0 },
        localPercentage: { type: Number, default: 0 },
    },
    metadata: {
        searchDurationMs: { type: Number },
        modelUsed: { type: String },
        depthLevel: { type: String, enum: ['quick', 'standard', 'deep'], default: 'standard' },
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h default
    },
}, { timestamps: true });

// TTL index — MongoDB auto-deletes documents when expiresAt is reached
ResearchCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Compound index for fast user+query lookups
ResearchCacheSchema.index({ userId: 1, queryHash: 1 });

const ResearchCache = mongoose.model('ResearchCache', ResearchCacheSchema);
module.exports = ResearchCache;

const mongoose = require('mongoose');

const UserScoreSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    totalXP: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    testingCredits: { type: Number, default: 10 }, // Default starting credits
    completedAssessments: { type: Number, default: 0 },


    // Bloom's Taxonomy Cognitive Profile (0-100 scale per category)
    cognitiveProfile: {
        remember: { type: Number, default: 0 },
        understand: { type: Number, default: 0 },
        apply: { type: Number, default: 0 },
        analyze: { type: Number, default: 0 },
        evaluate: { type: Number, default: 0 },
        create: { type: Number, default: 0 }
    },

    // Track last activity for streaks (optional future usage)
    lastActive: { type: Date, default: Date.now }
});

// Helper to calculate level based on XP (e.g., Level = sqrt(XP) * 0.1 or similar)
UserScoreSchema.pre('save', function (next) {
    // Simple linear-ish progression for now: Level 1 = 0-100, Level 2 = 101-300, etc.
    // Formula: Level = floor(sqrt(totalXP / 10)) + 1
    this.level = Math.floor(Math.sqrt(this.totalXP / 10)) + 1;
    next();
});

module.exports = mongoose.model('UserScore', UserScoreSchema);

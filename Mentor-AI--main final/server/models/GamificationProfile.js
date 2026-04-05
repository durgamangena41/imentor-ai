// server/models/GamificationProfile.js
const mongoose = require('mongoose');

const XPHistorySchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    reason: {
        type: String,
        enum: ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating_creating', 'rote', 'application', 'crafting', 'boss_battle', 'streak_bonus', 'bounty_question'],
        required: true
    },
    topic: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const StreakRewardSchema = new mongoose.Schema({
    day: { type: Number, required: true },
    reward: { type: String, required: true },
    unlockedAt: { type: Date, default: Date.now }
}, { _id: false });

const CompletedBattleSchema = new mongoose.Schema({
    battleId: { type: String, required: true },
    topic: { type: String, required: true },
    score: { type: Number, required: true },
    completedAt: { type: Date, default: Date.now },
    earnedBadge: { type: String, default: '' }
}, { _id: false });

const BadgeSchema = new mongoose.Schema({
    badgeId: { type: String, required: true },
    name: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now }
}, { _id: false });

const GamificationProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },

    // XP System (Legacy - kept for backward compatibility)
    totalXP: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    xpHistory: [XPHistorySchema],

    // Learning Credits System (Primary gamification currency)
    totalLearningCredits: { type: Number, default: 0, min: 0 },
    learningCreditsHistory: [{
        amount: { type: Number, required: true },
        reason: { type: String, enum: ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating_creating', 'rote', 'application', 'crafting', 'boss_battle', 'bounty_question', 'bounty_completed', 'daily_bonus', 'admin_award', 'spent', 'skill_tree_completion', 'streak_bonus'], required: true },
        bountyId: { type: String, default: '' },
        topic: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now }
    }],

    // Legacy Credits Field (kept for backward compatibility)
    learningCredits: { type: Number, default: 0, min: 0 },
    creditsHistory: [{
        amount: { type: Number, required: true },
        reason: { type: String, enum: ['bounty_completed', 'daily_bonus', 'admin_award', 'spent', 'skill_tree_completion'], required: true },
        bountyId: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now }
    }],

    // Streak System
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastActiveDate: { type: Date, default: null },
    streakRewards: [StreakRewardSchema],

    // Energy System
    currentEnergy: { type: Number, default: 100, min: 0, max: 100 },
    lastEnergyUpdate: { type: Date, default: Date.now },
    fatigueScore: { type: Number, default: 0, min: 0, max: 100 },
    forcedBreakUntil: { type: Date, default: null },

    // Skill Tree Progress
    unlockedSkills: [{ type: String }],
    skillMastery: {
        type: Map,
        of: Number, // skillId -> mastery percentage (0-100)
        default: () => new Map()
    },

    // Boss Battles
    completedBattles: [CompletedBattleSchema],

    // Leaderboards
    topicScores: {
        type: Map,
        of: Number, // topic -> score
        default: () => new Map()
    },

    // Badges & Achievements
    badges: [BadgeSchema],

    // Progress Prediction
    learningPace: {
        type: Map,
        of: Number, // topic -> questions per day
        default: () => new Map()
    },
    predictedMastery: {
        type: Map,
        of: Date, // topic -> predicted mastery date
        default: () => new Map()
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Compound indexes for performance
GamificationProfileSchema.index({ userId: 1, 'learningCreditsHistory.topic': 1 });
GamificationProfileSchema.index({ currentStreak: -1 });
GamificationProfileSchema.index({ totalLearningCredits: -1 });

// Method to calculate level from Learning Credits
GamificationProfileSchema.methods.calculateLevel = function () {
    // Level formula: Level = floor(sqrt(totalLearningCredits / 50)) + 1
    // Level 1: 0-100 Credits
    // Level 2: 100-250 Credits
    // Level 3: 250-500 Credits
    // Level N: requires ~1.5x Credits of previous level
    return Math.floor(Math.sqrt(this.totalLearningCredits / 50)) + 1;
};

// Method to get Learning Credits needed for next level
GamificationProfileSchema.methods.getCreditsForNextLevel = function () {
    const currentLevel = this.level;
    const nextLevel = currentLevel + 1;
    const creditsNeeded = Math.pow(nextLevel - 1, 2) * 50;
    return creditsNeeded - this.totalLearningCredits;
};

// Update timestamp on save
GamificationProfileSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const GamificationProfile = mongoose.model('GamificationProfile', GamificationProfileSchema);

module.exports = GamificationProfile;

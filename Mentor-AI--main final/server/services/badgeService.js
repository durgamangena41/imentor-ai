// server/services/badgeService.js
const GamificationProfile = require('../models/GamificationProfile');
const { logger } = require('../utils/logger');

/**
 * Badge Definitions
 * Each badge has criteria and rewards
 */
const BADGE_DEFINITIONS = {
    // XP Milestones
    'xp_novice': {
        name: 'XP Novice',
        description: 'Earned 100 total XP',
        criteria: { type: 'xp', threshold: 100 },
        icon: '🌟'
    },
    'xp_apprentice': {
        name: 'XP Apprentice',
        description: 'Earned 500 total XP',
        criteria: { type: 'xp', threshold: 500 },
        icon: '⭐'
    },
    'xp_expert': {
        name: 'XP Expert',
        description: 'Earned 2,000 total XP',
        criteria: { type: 'xp', threshold: 2000 },
        icon: '💫'
    },
    'xp_master': {
        name: 'XP Master',
        description: 'Earned 5,000 total XP',
        criteria: { type: 'xp', threshold: 5000 },
        icon: '🌠'
    },

    // Level Milestones
    'level_5': {
        name: 'Silver Rank',
        description: 'Reached Level 5',
        criteria: { type: 'level', threshold: 5 },
        icon: '🥈'
    },
    'level_10': {
        name: 'Gold Rank',
        description: 'Reached Level 10',
        criteria: { type: 'level', threshold: 10 },
        icon: '🥇'
    },
    'level_15': {
        name: 'Platinum Rank',
        description: 'Reached Level 15',
        criteria: { type: 'level', threshold: 15 },
        icon: '💎'
    },
    'level_20': {
        name: 'Diamond Rank',
        description: 'Reached Level 20',
        criteria: { type: 'level', threshold: 20 },
        icon: '💠'
    },

    // Streak Achievements
    'streak_warrior': {
        name: 'Streak Warrior',
        description: '7-day streak maintained',
        criteria: { type: 'streak', threshold: 7 },
        icon: '🔥'
    },
    'streak_champion': {
        name: 'Streak Champion',
        description: '30-day streak maintained',
        criteria: { type: 'streak', threshold: 30 },
        icon: '🏆'
    },
    'streak_legend': {
        name: 'Streak Legend',
        description: '100-day streak maintained',
        criteria: { type: 'streak', threshold: 100 },
        icon: '👑'
    },

    // Boss Battle Achievements
    'boss_slayer': {
        name: 'Boss Slayer',
        description: 'Defeated first boss battle',
        criteria: { type: 'boss_count', threshold: 1 },
        icon: '⚔️'
    },
    'boss_hunter': {
        name: 'Boss Hunter',
        description: 'Defeated 5 boss battles',
        criteria: { type: 'boss_count', threshold: 5 },
        icon: '🗡️'
    },
    'boss_legend': {
        name: 'Boss Legend',
        description: 'Defeated 10 boss battles',
        criteria: { type: 'boss_count', threshold: 10 },
        icon: '🛡️'
    },
    'perfect_battle': {
        name: 'Perfect Victory',
        description: 'Scored 100% on a boss battle',
        criteria: { type: 'perfect_score', threshold: 100 },
        icon: '💯'
    },

    // Bounty Achievements
    'bounty_hunter': {
        name: 'Bounty Hunter',
        description: 'Completed first bounty question',
        criteria: { type: 'bounty_count', threshold: 1 },
        icon: '🎯'
    },
    'bounty_master': {
        name: 'Bounty Master',
        description: 'Completed 10 bounty questions',
        criteria: { type: 'bounty_count', threshold: 10 },
        icon: '🏹'
    },

    // Credit Achievements
    'credit_collector': {
        name: 'Credit Collector',
        description: 'Earned 100 learning credits',
        criteria: { type: 'credits', threshold: 100 },
        icon: '💰'
    },
    'credit_mogul': {
        name: 'Credit Mogul',
        description: 'Earned 500 learning credits',
        criteria: { type: 'credits', threshold: 500 },
        icon: '💸'
    }
};

const RARITY_WEIGHT = {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5
};

const TIER_RARITY_MAP = {
    bronze: 'common',
    silver: 'uncommon',
    gold: 'rare',
    platinum: 'epic',
    diamond: 'legendary'
};

function mapCriteriaTypeToCategory(criteriaType) {
    const categoryMap = {
        xp: 'xp_milestone',
        level: 'level_milestone',
        streak: 'streak',
        boss_count: 'boss_battle',
        perfect_score: 'boss_battle',
        bounty_count: 'bounty',
        credits: 'credits'
    };
    return categoryMap[criteriaType] || 'general';
}

function inferTierAndRarity(criteria = {}) {
    const threshold = Number(criteria.threshold) || 0;
    if (threshold >= 1000) return { tier: 'diamond', rarity: 'legendary' };
    if (threshold >= 500) return { tier: 'platinum', rarity: 'epic' };
    if (threshold >= 100) return { tier: 'gold', rarity: 'rare' };
    if (threshold >= 30) return { tier: 'silver', rarity: 'uncommon' };
    return { tier: 'bronze', rarity: 'common' };
}

function countBountyCompletions(profile) {
    const legacyCount = (profile.creditsHistory || []).filter(
        h => h.reason === 'bounty_completed'
    ).length;

    const learningCreditsCount = (profile.learningCreditsHistory || []).filter(
        h => h.reason === 'bounty_completed'
    ).length;

    return legacyCount + learningCreditsCount;
}

function getCurrentMetricValue(profile, criteria = {}) {
    switch (criteria.type) {
        case 'xp':
            return profile.totalXP || 0;
        case 'level':
            return profile.level || 1;
        case 'streak':
            return profile.longestStreak || 0;
        case 'boss_count':
            return (profile.completedBattles || []).length;
        case 'credits':
            return Math.max(profile.totalLearningCredits || 0, profile.learningCredits || 0);
        case 'bounty_count':
            return countBountyCompletions(profile);
        case 'perfect_score': {
            const bestScore = (profile.completedBattles || []).reduce(
                (best, battle) => Math.max(best, Number(battle?.score) || 0),
                0
            );
            return bestScore;
        }
        default:
            return 0;
    }
}

function checkBadgeCriteria(profile, criteria) {
    return getCurrentMetricValue(profile, criteria) >= (criteria?.threshold || 0);
}

function buildBadgeWithProgress(profile, badgeDef, earnedBadge = null, badgeIdOverride = null) {
    const badgeId = badgeIdOverride || earnedBadge?.badgeId;
    const criteria = badgeDef.criteria || {};
    const threshold = Number(criteria.threshold) || 0;
    const currentValue = getCurrentMetricValue(profile, criteria);
    const earned = !!earnedBadge;

    const progressRaw = threshold > 0 ? Math.min((currentValue / threshold) * 100, 100) : 0;
    const progressPercent = earned ? 100 : Math.max(0, Math.round(progressRaw));
    const remaining = earned ? 0 : Math.max(threshold - currentValue, 0);

    const inferred = inferTierAndRarity(criteria);
    const category = badgeDef.category || mapCriteriaTypeToCategory(criteria.type);
    const tier = badgeDef.tier || inferred.tier;
    const rarity = badgeDef.rarity || TIER_RARITY_MAP[tier] || inferred.rarity;

    return {
        badgeId,
        name: badgeDef.name,
        description: badgeDef.description || '',
        icon: badgeDef.icon || '🏅',
        criteria,
        category,
        tier,
        rarity,
        earned,
        earnedAt: earnedBadge?.earnedAt || null,
        currentValue,
        threshold,
        remaining,
        progressPercent
    };
}

/**
 * Check all badges for a user and award new ones
 */
async function checkAndAwardBadges(userId) {
    try {
        const profile = await GamificationProfile.findOne({ userId });
        if (!profile) return [];

        const newBadges = [];
        const existingBadgeIds = profile.badges.map(b => b.badgeId);

        for (const [badgeId, badgeDef] of Object.entries(BADGE_DEFINITIONS)) {
            // Skip if already earned
            if (existingBadgeIds.includes(badgeId)) {
                continue;
            }

            // Check if user meets criteria
            const meetsCriteria = checkBadgeCriteria(profile, badgeDef.criteria);

            if (meetsCriteria) {
                // Award badge
                const badge = {
                    badgeId,
                    name: badgeDef.name,
                    earnedAt: new Date()
                };

                profile.badges.push(badge);
                newBadges.push({ ...badge, ...badgeDef });

                logger.info(`[BadgeService] Awarded badge "${badgeDef.name}" to user ${userId}`);
            }
        }

        if (newBadges.length > 0) {
            await profile.save();
        }

        return newBadges;

    } catch (error) {
        logger.error('[BadgeService] Error checking badges:', error);
        return [];
    }
}

/**
 * Check if user meets badge criteria
 */
function sortBadges(badges, sortBy = 'progress') {
    const sortable = [...badges];

    switch (sortBy) {
        case 'newest':
            sortable.sort((a, b) => {
                const aTime = a.earnedAt ? new Date(a.earnedAt).getTime() : 0;
                const bTime = b.earnedAt ? new Date(b.earnedAt).getTime() : 0;
                return bTime - aTime;
            });
            return sortable;
        case 'rarity':
            sortable.sort((a, b) => {
                const rarityDiff = (RARITY_WEIGHT[b.rarity] || 0) - (RARITY_WEIGHT[a.rarity] || 0);
                if (rarityDiff !== 0) return rarityDiff;
                return a.name.localeCompare(b.name);
            });
            return sortable;
        case 'name':
            sortable.sort((a, b) => a.name.localeCompare(b.name));
            return sortable;
        case 'progress':
        default:
            sortable.sort((a, b) => {
                if (a.earned !== b.earned) return a.earned ? -1 : 1;
                const progressDiff = b.progressPercent - a.progressPercent;
                if (progressDiff !== 0) return progressDiff;
                return a.remaining - b.remaining;
            });
            return sortable;
    }
}

/**
 * Special badge check for boss battles
 */
async function checkBossBattleBadge(userId, battle) {
    try {
        const profile = await GamificationProfile.findOne({ userId });
        if (!profile) return null;

        const newBadges = [];
        const existingBadgeIds = profile.badges.map(b => b.badgeId);

        // Check perfect score badge
        if (battle.score === 100 && !existingBadgeIds.includes('perfect_battle')) {
            const badgeDef = BADGE_DEFINITIONS['perfect_battle'];
            const badge = {
                badgeId: 'perfect_battle',
                name: badgeDef.name,
                earnedAt: new Date()
            };
            profile.badges.push(badge);
            newBadges.push({ ...badge, ...badgeDef });
        }

        // Check boss count badges
        const battleCount = profile.completedBattles.length + 1; // +1 for current

        if (battleCount === 1 && !existingBadgeIds.includes('boss_slayer')) {
            const badgeDef = BADGE_DEFINITIONS['boss_slayer'];
            const badge = {
                badgeId: 'boss_slayer',
                name: badgeDef.name,
                earnedAt: new Date()
            };
            profile.badges.push(badge);
            newBadges.push({ ...badge, ...badgeDef });
        }

        if (battleCount === 5 && !existingBadgeIds.includes('boss_hunter')) {
            const badgeDef = BADGE_DEFINITIONS['boss_hunter'];
            const badge = {
                badgeId: 'boss_hunter',
                name: badgeDef.name,
                earnedAt: new Date()
            };
            profile.badges.push(badge);
            newBadges.push({ ...badge, ...badgeDef });
        }

        if (battleCount === 10 && !existingBadgeIds.includes('boss_legend')) {
            const badgeDef = BADGE_DEFINITIONS['boss_legend'];
            const badge = {
                badgeId: 'boss_legend',
                name: badgeDef.name,
                earnedAt: new Date()
            };
            profile.badges.push(badge);
            newBadges.push({ ...badge, ...badgeDef });
        }

        if (newBadges.length > 0) {
            await profile.save();
            logger.info(`[BadgeService] Awarded ${newBadges.length} boss battle badges to user ${userId}`);
            return newBadges[0]; // Return first badge
        }

        return null;

    } catch (error) {
        logger.error('[BadgeService] Error checking boss battle badge:', error);
        return null;
    }
}

/**
 * Get all earned badges for a user
 */
async function getUserBadges(userId) {
    try {
        const profile = await GamificationProfile.findOne({ userId });
        if (!profile) return [];

        // Enrich with badge definitions
        const badges = profile.badges.map(badge => {
            const def = BADGE_DEFINITIONS[badge.badgeId];
            return {
                ...badge.toObject(),
                description: def?.description || '',
                icon: def?.icon || '🏅'
            };
        });

        return badges;

    } catch (error) {
        logger.error('[BadgeService] Error getting user badges:', error);
        return [];
    }
}

/**
 * Get a complete badge collection view for a user with progress metadata.
 */
async function getBadgeCollection(userId, options = {}) {
    try {
        const profile = await GamificationProfile.findOne({ userId });

        const filter = options.filter || 'all';
        const category = options.category || 'all';
        const sortBy = options.sortBy || 'progress';

        if (!profile) {
            const allLocked = Object.entries(BADGE_DEFINITIONS).map(([badgeId, def]) =>
                buildBadgeWithProgress(
                    {
                        totalXP: 0,
                        level: 1,
                        longestStreak: 0,
                        completedBattles: [],
                        totalLearningCredits: 0,
                        learningCredits: 0,
                        creditsHistory: [],
                        learningCreditsHistory: []
                    },
                    def,
                    null,
                    badgeId
                )
            );

            const sorted = sortBadges(allLocked, sortBy);
            return {
                badges: sorted,
                summary: {
                    total: sorted.length,
                    earned: 0,
                    locked: sorted.length,
                    completionRate: 0,
                    byCategory: sorted.reduce((acc, badge) => {
                        acc[badge.category] = (acc[badge.category] || 0) + 1;
                        return acc;
                    }, {})
                },
                nextUnlocks: sorted.slice(0, 3),
                earnedBadges: []
            };
        }

        const earnedMap = new Map((profile.badges || []).map(b => [b.badgeId, b]));
        const enriched = Object.entries(BADGE_DEFINITIONS).map(([badgeId, def]) =>
            buildBadgeWithProgress(profile, def, earnedMap.get(badgeId), badgeId)
        );

        const filtered = enriched.filter((badge) => {
            if (filter === 'earned' && !badge.earned) return false;
            if (filter === 'locked' && badge.earned) return false;
            if (category !== 'all' && badge.category !== category) return false;
            return true;
        });

        const sorted = sortBadges(filtered, sortBy);
        const allSorted = sortBadges(enriched, sortBy);

        const earnedBadges = allSorted.filter(b => b.earned);
        const lockedBadgesByProgress = allSorted
            .filter(b => !b.earned)
            .sort((a, b) => {
                const progressDiff = b.progressPercent - a.progressPercent;
                if (progressDiff !== 0) return progressDiff;
                return a.remaining - b.remaining;
            });

        const total = enriched.length;
        const earned = earnedBadges.length;
        const completionRate = total > 0 ? Math.round((earned / total) * 100) : 0;

        return {
            badges: sorted,
            summary: {
                total,
                earned,
                locked: total - earned,
                completionRate,
                byCategory: enriched.reduce((acc, badge) => {
                    if (!acc[badge.category]) {
                        acc[badge.category] = { total: 0, earned: 0 };
                    }
                    acc[badge.category].total += 1;
                    if (badge.earned) acc[badge.category].earned += 1;
                    return acc;
                }, {})
            },
            nextUnlocks: lockedBadgesByProgress.slice(0, 3),
            earnedBadges: earnedBadges.slice(0, 5)
        };

    } catch (error) {
        logger.error('[BadgeService] Error getting badge collection:', error);
        return {
            badges: [],
            summary: { total: 0, earned: 0, locked: 0, completionRate: 0, byCategory: {} },
            nextUnlocks: [],
            earnedBadges: []
        };
    }
}

/**
 * Get all available badges (for showcase)
 */
function getAllBadges() {
    return Object.entries(BADGE_DEFINITIONS).map(([badgeId, def]) => ({
        badgeId,
        ...def
    }));
}

module.exports = {
    checkAndAwardBadges,
    checkBossBattleBadge,
    getUserBadges,
    getBadgeCollection,
    getAllBadges,
    BADGE_DEFINITIONS
};

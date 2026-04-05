// server/routes/adminGamification.js
const express = require('express');
const router = express.Router();
const GamificationProfile = require('../models/GamificationProfile');
const SkillTree = require('../models/SkillTree');
const BossBattle = require('../models/BossBattle');
const ConceptContribution = require('../models/ConceptContribution');
const User = require('../models/User');
const { logger } = require('../utils/logger');

// @route   GET /api/admin/gamification/overview
// @desc    Get overall gamification statistics
router.get('/overview', async (req, res) => {
    try {
        const BountyQuestion = require('../models/BountyQuestion');

        const [
            totalUsers,
            avgLevel,
            totalLearningCreditsAwarded,
            activeStreaks,
            skillTreeStats,
            bossBattleStats,
            contributionStats,
            bountyStats,
            badgeStats,
            creditStats
        ] = await Promise.all([
            GamificationProfile.countDocuments(),
            GamificationProfile.aggregate([
                { $group: { _id: null, avgLevel: { $avg: '$level' } } }
            ]),
            GamificationProfile.aggregate([
                { $group: { _id: null, totalLearningCredits: { $sum: '$totalLearningCredits' } } }
            ]),
            GamificationProfile.countDocuments({ currentStreak: { $gte: 1 } }),
            SkillTree.aggregate([
                { $group: { _id: null, totalSkills: { $sum: 1 } } }
            ]),
            BossBattle.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        avgScore: { $avg: '$score' }
                    }
                }
            ]),
            ConceptContribution.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]),
            BountyQuestion.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]),
            GamificationProfile.aggregate([
                {
                    $project: {
                        badgeCount: { $size: { $ifNull: ['$badges', []] } }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalBadges: { $sum: '$badgeCount' }
                    }
                }
            ]),
            GamificationProfile.aggregate([
                { $unwind: '$learningCreditsHistory' },
                {
                    $match: {
                        'learningCreditsHistory.reason': {
                            $in: ['bounty_question', 'bounty_completed', 'application', 'crafting']
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalCredits: { $sum: '$learningCreditsHistory.amount' }
                    }
                }
            ])
        ]);

        // Get top performers (sort by totalLearningCredits, fallback to totalXP)
        const topPerformers = await GamificationProfile.aggregate([
            {
                $addFields: {
                    effectiveCredits: { $ifNull: ['$totalLearningCredits', '$totalXP'] }
                }
            },
            { $sort: { effectiveCredits: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } }
        ]);

        // Get top credits earners (only from skill tree and bounty questions)
        const topCreditsEarners = await GamificationProfile.aggregate([
            { $unwind: { path: '$learningCreditsHistory', preserveNullAndEmptyArrays: false } },
            {
                $match: {
                    'learningCreditsHistory.reason': {
                        $in: ['bounty_question', 'bounty_completed', 'application', 'crafting']
                    }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    userId: { $first: '$userId' },
                    level: { $first: '$level' },
                    currentStreak: { $first: '$currentStreak' },
                    totalLearningCredits: { $first: '$totalLearningCredits' },
                    totalXP: { $first: '$totalXP' },
                    skillTreeAndBountyCredits: { $sum: '$learningCreditsHistory.amount' }
                }
            },
            { $sort: { skillTreeAndBountyCredits: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } }
        ]);

        // Learning Credits distribution by reason
        const creditsDistribution = await GamificationProfile.aggregate([
            { $unwind: '$learningCreditsHistory' },
            {
                $group: {
                    _id: '$learningCreditsHistory.reason',
                    total: { $sum: '$learningCreditsHistory.amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Calculate totals from boss battles
        const totalBossBattles = bossBattleStats.reduce((sum, stat) => sum + stat.count, 0);
        const activeBounties = bountyStats.find(b => b._id === 'active')?.count || 0;

        res.json({
            overview: {
                totalUsers,
                averageLevel: avgLevel[0]?.avgLevel || 0,
                totalLearningCreditsAwarded: totalLearningCreditsAwarded[0]?.totalLearningCredits || 0,
                activeStreaks,
                totalSkills: skillTreeStats[0]?.totalSkills || 0,
                totalBossBattles,
                totalBadges: badgeStats[0]?.totalBadges || 0,
                activeBounties,
                totalCredits: creditStats[0]?.totalCredits || 0
            },
            bossBattles: bossBattleStats,
            contributions: contributionStats,
            bounties: bountyStats,
            topPerformers: topPerformers.map(p => ({
                userId: p.user?._id,
                name: p.user?.profile?.name || p.user?.username || p.user?.email || 'Anonymous',
                email: p.user?.email,
                level: p.level,
                totalLearningCredits: p.totalLearningCredits || p.totalXP || 0,
                currentStreak: p.currentStreak
            })),
            topCreditsEarners: topCreditsEarners.map(p => ({
                userId: p.user?._id,
                name: p.user?.profile?.name || p.user?.username || p.user?.email || 'Anonymous',
                email: p.user?.email,
                level: p.level,
                learningCredits: p.skillTreeAndBountyCredits || 0,
                totalLearningCredits: p.skillTreeAndBountyCredits || 0,
                currentStreak: p.currentStreak
            })),
            creditsDistribution
        });

    } catch (error) {
        logger.error('[Admin Gamification] Error fetching overview:', error);
        res.status(500).json({ message: 'Error fetching gamification overview' });
    }
});

// @route   GET /api/admin/gamification/active-streaks
// @desc    Get users with active streaks (1+ days)
router.get('/active-streaks', async (req, res) => {
    try {
        const usersWithStreaks = await GamificationProfile.find({
            currentStreak: { $gte: 1 }
        })
            .sort({ currentStreak: -1 })
            .populate('userId', 'profile.name username email')
            .lean();

        const streakUsers = usersWithStreaks.map(p => ({
            userId: p.userId?._id,
            name: p.userId?.profile?.name || p.userId?.username || p.userId?.email || 'Anonymous',
            email: p.userId?.email,
            level: p.level,
            totalLearningCredits: p.totalLearningCredits || p.totalXP || 0,
            currentStreak: p.currentStreak,
            lastActiveDate: p.lastActiveDate
        }));

        res.json({ users: streakUsers });
    } catch (error) {
        logger.error('[Admin Gamification] Error fetching active streaks:', error);
        res.status(500).json({ message: 'Error fetching active streak users' });
    }
});

// @route   GET /api/admin/gamification/users
// @desc    Get all users with gamification stats
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const profiles = await GamificationProfile.find()
            .sort({ totalXP: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'profile.name username email createdAt')
            .lean();

        const total = await GamificationProfile.countDocuments();

        const usersWithStats = profiles.map(p => ({
            userId: p.userId?._id,
            name: p.userId?.profile?.name || p.userId?.username || p.userId?.email || 'Unknown User',
            email: p.userId?.email,
            joinedAt: p.userId?.createdAt,
            level: p.level,
            totalXP: p.totalXP,
            currentStreak: p.currentStreak,
            longestStreak: p.longestStreak,
            currentEnergy: p.currentEnergy,
            unlockedSkillsCount: p.unlockedSkills.length,
            badgesCount: p.badges.length,
            lastActive: p.lastActiveDate
        }));

        res.json({
            users: usersWithStats,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        logger.error('[Admin Gamification] Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching gamification users' });
    }
});

// @route   POST /api/admin/gamification/award-learning-credits
// @desc    Manually award Learning Credits to a user (admin power)
router.post('/award-learning-credits', async (req, res) => {
    try {
        const { userId, amount, reason } = req.body;

        if (!userId || !amount) {
            return res.status(400).json({ message: 'User ID and amount required' });
        }

        const gamificationService = require('../services/gamificationService');

        const result = await gamificationService.awardLearningCredits(
            userId,
            amount,
            reason || 'admin_bonus',
            'admin'
        );

        logger.info(`[Admin Gamification] Admin awarded ${amount} Learning Credits to user ${userId}`);

        res.json({
            message: `Successfully awarded ${amount} Learning Credits`,
            ...result
        });

    } catch (error) {
        logger.error('[Admin Gamification] Error awarding Learning Credits:', error);
        res.status(500).json({ message: 'Error awarding Learning Credits' });
    }
});

// Backward compatibility route
// @route   POST /api/admin/gamification/award-xp
// @desc    Manually award XP to a user (admin power) - Legacy endpoint
router.post('/award-xp', async (req, res) => {
    try {
        const { userId, amount, reason } = req.body;

        if (!userId || !amount) {
            return res.status(400).json({ message: 'User ID and amount required' });
        }

        const gamificationService = require('../services/gamificationService');

        const result = await gamificationService.awardLearningCredits(
            userId,
            amount,
            reason || 'admin_bonus',
            'admin'
        );

        logger.info(`[Admin Gamification] Admin awarded ${amount} Learning Credits to user ${userId} (via legacy endpoint)`);

        res.json({
            message: `Successfully awarded ${amount} Learning Credits`,
            ...result
        });

    } catch (error) {
        logger.error('[Admin Gamification] Error awarding Learning Credits:', error);
        res.status(500).json({ message: 'Error awarding Learning Credits' });
    }
});

// @route   GET /api/admin/gamification/skill-tree
// @desc    Get all skills in the skill tree (for admin management)
router.get('/skill-tree', async (req, res) => {
    try {
        const skills = await SkillTree.find().sort({ 'position.tier': 1, category: 1 });

        res.json({ skills });

    } catch (error) {
        logger.error('[Admin Gamification] Error fetching skill tree:', error);
        res.status(500).json({ message: 'Error fetching skill tree' });
    }
});

// @route   POST /api/admin/gamification/skill-tree
// @desc    Create a new skill node
router.post('/skill-tree', async (req, res) => {
    try {
        const skillData = req.body;

        const skill = new SkillTree(skillData);
        await skill.save();

        logger.info(`[Admin Gamification] Created new skill: ${skill.skillId}`);

        res.status(201).json({ skill });

    } catch (error) {
        logger.error('[Admin Gamification] Error creating skill:', error);
        res.status(500).json({
            message: error.message || 'Error creating skill',
            error: error.message
        });
    }
});

// @route   PUT /api/admin/gamification/skill-tree/:skillId
// @desc    Update a skill node
router.put('/skill-tree/:skillId', async (req, res) => {
    try {
        const skill = await SkillTree.findOneAndUpdate(
            { skillId: req.params.skillId },
            req.body,
            { new: true, runValidators: true }
        );

        if (!skill) {
            return res.status(404).json({ message: 'Skill not found' });
        }

        logger.info(`[Admin Gamification] Updated skill: ${skill.skillId}`);

        res.json({ skill });

    } catch (error) {
        logger.error('[Admin Gamification] Error updating skill:', error);
        res.status(500).json({ message: error.message || 'Error updating skill' });
    }
});

// @route   DELETE /api/admin/gamification/skill-tree/:skillId
// @desc    Delete a skill node
router.delete('/skill-tree/:skillId', async (req, res) => {
    try {
        const skill = await SkillTree.findOneAndDelete({ skillId: req.params.skillId });

        if (!skill) {
            return res.status(404).json({ message: 'Skill not found' });
        }

        logger.info(`[Admin Gamification] Deleted skill: ${skill.skillId}`);

        res.json({ message: 'Skill deleted successfully' });

    } catch (error) {
        logger.error('[Admin Gamification] Error deleting skill:', error);
        res.status(500).json({ message: 'Error deleting skill' });
    }
});

// @route   GET /api/admin/gamification/boss-battles
// @desc    Get all boss battles with statistics
router.get('/boss-battles', async (req, res) => {
    try {
        const battles = await BossBattle.find()
            .sort({ generatedAt: -1 })
            .limit(50)
            .populate('userId', 'profile.name email')
            .lean();

        const stats = {
            total: await BossBattle.countDocuments(),
            completed: await BossBattle.countDocuments({ status: 'completed' }),
            failed: await BossBattle.countDocuments({ status: 'failed' }),
            active: await BossBattle.countDocuments({ status: 'active' }),
            avgPassRate: 0
        };

        const finishedBattles = await BossBattle.countDocuments({
            status: { $in: ['completed', 'failed'] }
        });

        if (finishedBattles > 0) {
            stats.avgPassRate = Math.round((stats.completed / finishedBattles) * 100);
        }

        res.json({ battles, stats });

    } catch (error) {
        logger.error('[Admin Gamification] Error fetching boss battles:', error);
        res.status(500).json({ message: 'Error fetching boss battles' });
    }
});

// @route   GET /api/admin/gamification/contributions
// @desc    Get all user contributions
router.get('/contributions', async (req, res) => {
    try {
        const contributions = await ConceptContribution.find()
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('userId', 'profile.name email')
            .lean();

        const stats = {
            total: await ConceptContribution.countDocuments(),
            approved: await ConceptContribution.countDocuments({ status: 'approved' }),
            pending: await ConceptContribution.countDocuments({ status: 'pending' }),
            rejected: await ConceptContribution.countDocuments({ status: 'rejected' }),
            byType: await ConceptContribution.aggregate([
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ])
        };

        res.json({ contributions, stats });

    } catch (error) {
        logger.error('[Admin Gamification] Error fetching contributions:', error);
        res.status(500).json({ message: 'Error fetching contributions' });
    }
});

// @route   PUT /api/admin/gamification/contribution/:id/approve
// @desc    Approve a contribution
router.put('/contribution/:id/approve', async (req, res) => {
    try {
        const contribution = await ConceptContribution.findByIdAndUpdate(
            req.params.id,
            { status: 'approved', isPublic: true },
            { new: true }
        );

        if (!contribution) {
            return res.status(404).json({ message: 'Contribution not found' });
        }

        res.json({ contribution });

    } catch (error) {
        logger.error('[Admin Gamification] Error approving contribution:', error);
        res.status(500).json({ message: 'Error approving contribution' });
    }
});

// @route   PUT /api/admin/gamification/contribution/:id/reject
// @desc    Reject a contribution
router.put('/contribution/:id/reject', async (req, res) => {
    try {
        const contribution = await ConceptContribution.findByIdAndUpdate(
            req.params.id,
            { status: 'rejected' },
            { new: true }
        );

        if (!contribution) {
            return res.status(404).json({ message: 'Contribution not found' });
        }

        res.json({ contribution });

    } catch (error) {
        logger.error('[Admin Gamification] Error rejecting contribution:', error);
        res.status(500).json({ message: 'Error rejecting contribution' });
    }
});

// @route   POST /api/admin/gamification/cleanup-bounties
// @desc    Manually trigger bounty cleanup (expire old bounties)
router.post('/cleanup-bounties', async (req, res) => {
    try {
        const { manualCleanup } = require('../jobs/bountyCleanup');
        const result = await manualCleanup();
        
        res.json({
            message: 'Bounty cleanup completed successfully',
            result
        });
    } catch (error) {
        logger.error('[Admin Gamification] Error in manual bounty cleanup:', error);
        res.status(500).json({ message: 'Error cleaning up bounties' });
    }
});

// @route   POST /api/admin/gamification/cleanup-boss-battles
// @desc    Manually trigger boss battle cleanup (expire old battles)
router.post('/cleanup-boss-battles', async (req, res) => {
    try {
        const { manualCleanup } = require('../jobs/bossBattleCleanup');
        const result = await manualCleanup();
        
        res.json({
            message: 'Boss battle cleanup completed successfully',
            result
        });
    } catch (error) {
        logger.error('[Admin Gamification] Error in manual boss battle cleanup:', error);
        res.status(500).json({ message: 'Error cleaning up boss battles' });
    }
});

module.exports = router;

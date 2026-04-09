const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const mongoose = require('mongoose');

const User = require('../models/User');
const UserScore = require('../models/UserScore');
const { redisClient } = require('../config/redisClient');

const router = express.Router();

const XP_BY_ACTIVITY = {
    eye_blink: 25,
    water: 15,
    breathing: 30,
    linkedin: 20,
};

const WELLNESS_TYPES = Object.keys(XP_BY_ACTIVITY);

const DEFAULT_DAILY_GOAL = 3;
const MIN_DAILY_GOAL = 1;
const MAX_DAILY_GOAL = 10;

const WellnessActivitySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        activityType: {
            type: String,
            enum: WELLNESS_TYPES,
            required: true,
            index: true,
        },
        completedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        xpEarned: {
            type: Number,
            required: true,
            min: 0,
        },
        starRating: {
            type: Number,
            min: 1,
            max: 5,
            default: null,
        },
        durationSeconds: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);

WellnessActivitySchema.index({ userId: 1, completedAt: -1 });
WellnessActivitySchema.index({ activityType: 1, starRating: 1 });

const WellnessActivity = mongoose.models.WellnessActivity || mongoose.model('WellnessActivity', WellnessActivitySchema);

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function toDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function awardXpFallback(userId, xpAmount) {
    let score = await UserScore.findOne({ userId });
    if (!score) {
        score = new UserScore({ userId, totalXP: 0, level: 1 });
    }

    score.totalXP += xpAmount;
    await score.save();

    return {
        awarded: true,
        source: 'fallback',
        totalXP: score.totalXP,
        level: score.level,
    };
}

async function awardXpViaInternalRoute(req, xpAmount, activityType) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    try {
        const response = await axios.post(
            `${baseUrl}/api/gamification/award-xp`,
            {
                amount: xpAmount,
                reason: `wellness_${activityType}`,
                topic: 'wellness',
            },
            {
                headers: {
                    Authorization: req.headers.authorization || '',
                },
                timeout: 4000,
            }
        );

        return {
            awarded: true,
            source: 'internal_route',
            result: response.data,
        };
    } catch (error) {
        const status = error.response?.status;
        if (status && status !== 404) {
            throw error;
        }

        return awardXpFallback(req.user._id, xpAmount);
    }
}

function normalizeDailyGoal(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return DEFAULT_DAILY_GOAL;
    return Math.min(MAX_DAILY_GOAL, Math.max(MIN_DAILY_GOAL, Math.round(raw)));
}

router.get('/goal', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const user = await User.findById(req.user._id).select('wellnessSettings.dailyGoal').lean();
        const dailyGoal = normalizeDailyGoal(user?.wellnessSettings?.dailyGoal);
        return res.json({ dailyGoal });
    } catch (error) {
        console.error('[Wellness] Error fetching daily goal:', error);
        return res.status(500).json({ message: 'Failed to fetch wellness goal.' });
    }
});

router.put('/goal', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const dailyGoal = normalizeDailyGoal(req.body?.dailyGoal);
        const updated = await User.findByIdAndUpdate(
            req.user._id,
            { $set: { 'wellnessSettings.dailyGoal': dailyGoal } },
            { new: true, runValidators: true }
        )
            .select('wellnessSettings.dailyGoal')
            .lean();

        return res.json({
            message: 'Wellness daily goal updated.',
            dailyGoal: normalizeDailyGoal(updated?.wellnessSettings?.dailyGoal),
        });
    } catch (error) {
        console.error('[Wellness] Error updating daily goal:', error);
        return res.status(500).json({ message: 'Failed to update wellness goal.' });
    }
});

router.post('/complete', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const activityType = String(req.body?.activityType || '').trim();
        if (!WELLNESS_TYPES.includes(activityType)) {
            return res.status(400).json({
                message: `Invalid activityType. Allowed: ${WELLNESS_TYPES.join(', ')}`,
            });
        }

        const durationSecondsRaw = Number(req.body?.durationSeconds || 0);
        const durationSeconds = Number.isFinite(durationSecondsRaw)
            ? Math.max(0, Math.round(durationSecondsRaw))
            : 0;

        const xpEarned = XP_BY_ACTIVITY[activityType] || 0;
        const awardResult = await awardXpViaInternalRoute(req, xpEarned, activityType);

        const activity = await WellnessActivity.create({
            userId: req.user._id,
            activityType,
            completedAt: new Date(),
            xpEarned,
            durationSeconds,
        });

        return res.status(201).json({
            message: 'Wellness activity completed.',
            activity,
            xpAwarded: xpEarned,
            awardSource: awardResult.source,
        });
    } catch (error) {
        console.error('[Wellness] Error completing activity:', error);
        return res.status(500).json({ message: 'Failed to complete wellness activity.' });
    }
});

router.get('/today', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const now = new Date();
        const activities = await WellnessActivity.find({
            userId: req.user._id,
            completedAt: { $gte: startOfDay(now), $lte: endOfDay(now) },
        })
            .sort({ completedAt: -1 })
            .lean();

        const totalXpToday = activities.reduce((sum, item) => sum + (item.xpEarned || 0), 0);

        const lifetimeTotals = await WellnessActivity.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.user._id) } },
            {
                $group: {
                    _id: null,
                    totalXpFromWellness: { $sum: '$xpEarned' },
                    totalActivitiesCompleted: { $sum: 1 },
                },
            },
        ]);

        const totals = lifetimeTotals[0] || { totalXpFromWellness: 0, totalActivitiesCompleted: 0 };

        return res.json({
            activities,
            totalXpToday,
            count: activities.length,
            totalXpFromWellness: totals.totalXpFromWellness || 0,
            totalActivitiesCompleted: totals.totalActivitiesCompleted || 0,
        });
    } catch (error) {
        console.error('[Wellness] Error fetching today activities:', error);
        return res.status(500).json({ message: 'Failed to fetch today wellness activities.' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const user = await User.findById(req.user._id).select('wellnessSettings.dailyGoal').lean();
        const dailyGoal = normalizeDailyGoal(user?.wellnessSettings?.dailyGoal);

        const userActivities = await WellnessActivity.find({ userId: req.user._id })
            .select('activityType xpEarned completedAt starRating')
            .lean();

        const now = new Date();
        const dayStart = startOfDay(now);
        const dayEnd = endOfDay(now);

        const activityCounts = {
            eye_blink: 0,
            water: 0,
            breathing: 0,
            linkedin: 0,
        };

        const userAverageRatingPerType = {
            eye_blink: 0,
            water: 0,
            breathing: 0,
            linkedin: 0,
        };

        const ratingBuckets = {
            eye_blink: [],
            water: [],
            breathing: [],
            linkedin: [],
        };

        let totalActivitiesCompleted = 0;
        let totalXpFromWellness = 0;
        let wellnessXpToday = 0;
        let activitiesCompletedToday = 0;
        const activityCountByDate = new Map();

        for (const activity of userActivities) {
            const type = activity.activityType;
            totalActivitiesCompleted += 1;

            if (activityCounts[type] !== undefined) {
                activityCounts[type] += 1;
            }

            totalXpFromWellness += activity.xpEarned || 0;

            const completedAt = new Date(activity.completedAt);
            const key = toDateKey(completedAt);
            activityCountByDate.set(key, (activityCountByDate.get(key) || 0) + 1);
            if (completedAt >= dayStart && completedAt <= dayEnd) {
                activitiesCompletedToday += 1;
                wellnessXpToday += activity.xpEarned || 0;
            }

            if (typeof activity.starRating === 'number' && activity.starRating >= 1 && activity.starRating <= 5) {
                if (Array.isArray(ratingBuckets[type])) {
                    ratingBuckets[type].push(activity.starRating);
                }
            }
        }

        for (const type of WELLNESS_TYPES) {
            const ratings = ratingBuckets[type];
            if (ratings.length > 0) {
                const avg = ratings.reduce((sum, n) => sum + n, 0) / ratings.length;
                userAverageRatingPerType[type] = Number(avg.toFixed(2));
            }
        }

        const globalAverageRatingsRaw = await WellnessActivity.aggregate([
            {
                $match: {
                    starRating: { $gte: 1, $lte: 5 },
                },
            },
            {
                $group: {
                    _id: '$activityType',
                    avgStarRating: { $avg: '$starRating' },
                    totalRatings: { $sum: 1 },
                },
            },
        ]);

        const globalAverageRatingPerType = {
            eye_blink: 0,
            water: 0,
            breathing: 0,
            linkedin: 0,
        };

        for (const row of globalAverageRatingsRaw) {
            if (globalAverageRatingPerType[row._id] !== undefined) {
                globalAverageRatingPerType[row._id] = Number((row.avgStarRating || 0).toFixed(2));
            }
        }

        let weeklyStreakDays = 0;
        const cursor = new Date(dayStart);
        while (true) {
            const key = toDateKey(cursor);
            const count = activityCountByDate.get(key) || 0;
            if (count >= dailyGoal) {
                weeklyStreakDays += 1;
                cursor.setDate(cursor.getDate() - 1);
                continue;
            }
            break;
        }

        const weekStart = new Date(dayStart);
        weekStart.setDate(weekStart.getDate() - 6);
        let weeklyActivitiesCompleted = 0;
        for (const activity of userActivities) {
            const completedAt = new Date(activity.completedAt);
            if (completedAt >= weekStart && completedAt <= dayEnd) {
                weeklyActivitiesCompleted += 1;
            }
        }

        const dailyGoalProgress = Math.min(dailyGoal, activitiesCompletedToday);
        const dailyGoalReached = activitiesCompletedToday >= dailyGoal;

        return res.json({
            totalXpFromWellness,
            wellnessXpToday,
            totalActivitiesCompleted,
            activitiesCompletedToday,
            dailyGoal,
            dailyGoalProgress,
            dailyGoalReached,
            weeklyStreakDays,
            weeklyActivitiesCompleted,
            activityCounts,
            averageStarRatingPerActivityType: userAverageRatingPerType,
            globalAverageRatingPerActivityType: globalAverageRatingPerType,
        });
    } catch (error) {
        console.error('[Wellness] Error fetching wellness stats:', error);
        return res.status(500).json({ message: 'Failed to fetch wellness stats.' });
    }
});

router.post('/rate', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const activityId = req.body?.activityId;
        const starRatingRaw = Number(req.body?.starRating);
        const starRating = Number.isFinite(starRatingRaw) ? Math.round(starRatingRaw) : NaN;

        if (!activityId || !mongoose.Types.ObjectId.isValid(activityId)) {
            return res.status(400).json({ message: 'Valid activityId is required.' });
        }

        if (!Number.isInteger(starRating) || starRating < 1 || starRating > 5) {
            return res.status(400).json({ message: 'starRating must be an integer between 1 and 5.' });
        }

        const updated = await WellnessActivity.findOneAndUpdate(
            { _id: activityId, userId: req.user._id },
            { $set: { starRating } },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: 'Completed activity not found for this user.' });
        }

        return res.json({
            message: 'Rating saved successfully.',
            activity: updated,
        });
    } catch (error) {
        console.error('[Wellness] Error saving rating:', error);
        return res.status(500).json({ message: 'Failed to save activity rating.' });
    }
});

function startWellnessReminderCron() {
    if (global.__WELLNESS_REMINDER_CRON_STARTED__) {
        return;
    }

    global.__WELLNESS_REMINDER_CRON_STARTED__ = true;

    cron.schedule('0 9,12,15,18 * * *', async () => {
        try {
            if (!redisClient || !redisClient.isOpen) {
                return;
            }

            const users = await User.find({ isAdmin: { $ne: true } }).select('_id').lean();
            if (!Array.isArray(users) || users.length === 0) {
                return;
            }

            const nowIso = new Date().toISOString();
            await Promise.all(
                users.map((user) => {
                    const key = `wellness:notification:${user._id.toString()}`;
                    const value = JSON.stringify({ type: 'water', message: 'Time to drink water!', at: nowIso });
                    return redisClient.set(key, value, { EX: 60 * 60 * 4 });
                })
            );
        } catch (error) {
            console.error('[Wellness Cron] Failed to set water reminder flags:', error);
        }
    });
}

startWellnessReminderCron();

module.exports = router;

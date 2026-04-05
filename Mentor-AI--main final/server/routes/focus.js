const express = require('express');
const axios = require('axios');
const { randomUUID } = require('crypto');

const FocusSession = require('../models/FocusSession');
const UserScore = require('../models/UserScore');
const { redisClient } = require('../config/redisClient');

const router = express.Router();
const FOCUS_MAX_MINUTES = 180;
const focusMemoryStore = new Map();
const focusCompletionLocks = new Map();

function startOfUtcDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDayKey(date) {
    return startOfUtcDay(date).toISOString().slice(0, 10);
}

function calculateFocusXP(actualMinutes, plannedMinutes) {
    const completionRatio = plannedMinutes > 0 ? actualMinutes / plannedMinutes : 0;
    const cappedRatio = Math.max(0.5, Math.min(1.3, completionRatio));
    return Math.max(10, Math.round(actualMinutes * 1.8 * cappedRatio));
}

function clampPlannedMinutes(value, fallback = 25) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(FOCUS_MAX_MINUTES, Math.max(1, Math.round(parsed)));
}

function getFocusRedisKey(userId) {
    return `focus:${userId.toString()}`;
}

function getCompletionLockKey(userId, sessionToken) {
    return `focus:complete:${userId.toString()}:${sessionToken}`;
}

function getMemorySessionKey(userId) {
    return userId.toString();
}

function pruneExpiredMemoryLocks(now = Date.now()) {
    for (const [key, expiresAt] of focusCompletionLocks.entries()) {
        if (expiresAt <= now) {
            focusCompletionLocks.delete(key);
        }
    }
}

function buildSessionStatePayload(plannedMinutes) {
    return {
        startedAt: new Date().toISOString(),
        plannedMinutes,
        status: 'running',
        pausedAt: null,
        totalPausedMs: 0,
        sessionToken: randomUUID(),
    };
}

function calculateEffectiveElapsedMs(sessionState, now = new Date()) {
    const startedAt = new Date(sessionState.startedAt);
    if (Number.isNaN(startedAt.getTime())) return 0;

    const totalPausedMs = Number(sessionState.totalPausedMs || 0);
    let pausedRunningMs = 0;

    if (sessionState.status === 'paused' && sessionState.pausedAt) {
        const pausedAt = new Date(sessionState.pausedAt);
        if (!Number.isNaN(pausedAt.getTime())) {
            pausedRunningMs = Math.max(0, now.getTime() - pausedAt.getTime());
        }
    }

    const elapsedMs = Math.max(0, now.getTime() - startedAt.getTime() - totalPausedMs - pausedRunningMs);
    const maxMs = FOCUS_MAX_MINUTES * 60000;
    return Math.min(elapsedMs, maxMs);
}

function getRemainingSeconds(sessionState, now = new Date()) {
    const plannedMinutes = clampPlannedMinutes(sessionState.plannedMinutes, 25);
    const plannedMs = plannedMinutes * 60000;
    const elapsedMs = calculateEffectiveElapsedMs(sessionState, now);
    return Math.max(0, Math.ceil((plannedMs - elapsedMs) / 1000));
}

async function getCachedSessionOrNull(userId) {
    if (redisClient && redisClient.isOpen) {
        const cached = await redisClient.get(getFocusRedisKey(userId));
        if (!cached) return null;

        try {
            return JSON.parse(cached);
        } catch {
            return null;
        }
    }

    const memoryEntry = focusMemoryStore.get(getMemorySessionKey(userId));
    return memoryEntry ? { ...memoryEntry } : null;
}

async function saveCachedSession(userId, payload) {
    if (redisClient && redisClient.isOpen) {
        await redisClient.set(getFocusRedisKey(userId), JSON.stringify(payload), { EX: 60 * 60 * 6 });
        return;
    }

    focusMemoryStore.set(getMemorySessionKey(userId), { ...payload, updatedAt: new Date().toISOString() });
}

async function deleteCachedSession(userId) {
    if (redisClient && redisClient.isOpen) {
        await redisClient.del(getFocusRedisKey(userId));
        return;
    }

    focusMemoryStore.delete(getMemorySessionKey(userId));
}

async function acquireCompletionLock(userId, sessionToken) {
    if (!sessionToken) return true;

    if (redisClient && redisClient.isOpen) {
        const lock = await redisClient.set(
            getCompletionLockKey(userId, sessionToken),
            '1',
            { NX: true, EX: 60 }
        );
        return Boolean(lock);
    }

    pruneExpiredMemoryLocks();
    const lockKey = getCompletionLockKey(userId, sessionToken);
    if (focusCompletionLocks.has(lockKey)) {
        return false;
    }

    focusCompletionLocks.set(lockKey, Date.now() + 60 * 1000);
    return true;
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

async function awardXpViaInternalRoute(req, xpAmount) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    try {
        const response = await axios.post(
            `${baseUrl}/api/gamification/award-xp`,
            {
                amount: xpAmount,
                reason: 'focus_session',
                topic: 'focus_mode',
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

router.post('/start', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const plannedMinutes = clampPlannedMinutes(req.body?.plannedMinutes, 25);

        const payload = buildSessionStatePayload(plannedMinutes);

        await saveCachedSession(req.user._id, payload);

        return res.status(201).json({
            message: 'Focus session started.',
            startedAt: payload.startedAt,
            plannedMinutes,
            status: payload.status,
            sessionToken: payload.sessionToken,
        });
    } catch (error) {
        console.error('[Focus] Error starting session:', error);
        return res.status(500).json({ message: 'Failed to start focus session.' });
    }
});

router.post('/pause', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const sessionState = await getCachedSessionOrNull(req.user._id);
        if (!sessionState) {
            return res.status(400).json({ message: 'No active focus session found.' });
        }

        if (sessionState.status === 'paused') {
            return res.json({
                message: 'Focus session is already paused.',
                status: 'paused',
                remainingSeconds: getRemainingSeconds(sessionState),
            });
        }

        const updatedState = {
            ...sessionState,
            status: 'paused',
            pausedAt: new Date().toISOString(),
        };

        await saveCachedSession(req.user._id, updatedState);

        return res.json({
            message: 'Focus session paused.',
            status: 'paused',
            remainingSeconds: getRemainingSeconds(updatedState),
        });
    } catch (error) {
        console.error('[Focus] Error pausing session:', error);
        return res.status(500).json({ message: 'Failed to pause focus session.' });
    }
});

router.post('/resume', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const sessionState = await getCachedSessionOrNull(req.user._id);
        if (!sessionState) {
            return res.status(400).json({ message: 'No active focus session found.' });
        }

        if (sessionState.status !== 'paused') {
            return res.json({
                message: 'Focus session is already running.',
                status: 'running',
                remainingSeconds: getRemainingSeconds(sessionState),
            });
        }

        let additionalPausedMs = 0;
        if (sessionState.pausedAt) {
            const pausedAt = new Date(sessionState.pausedAt);
            if (!Number.isNaN(pausedAt.getTime())) {
                additionalPausedMs = Math.max(0, new Date().getTime() - pausedAt.getTime());
            }
        }

        const updatedState = {
            ...sessionState,
            status: 'running',
            pausedAt: null,
            totalPausedMs: Number(sessionState.totalPausedMs || 0) + additionalPausedMs,
        };

        await saveCachedSession(req.user._id, updatedState);

        return res.json({
            message: 'Focus session resumed.',
            status: 'running',
            remainingSeconds: getRemainingSeconds(updatedState),
        });
    } catch (error) {
        console.error('[Focus] Error resuming session:', error);
        return res.status(500).json({ message: 'Failed to resume focus session.' });
    }
});

router.post('/cancel', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        await deleteCachedSession(req.user._id);

        return res.json({ message: 'Focus session canceled.' });
    } catch (error) {
        console.error('[Focus] Error canceling session:', error);
        return res.status(500).json({ message: 'Failed to cancel focus session.' });
    }
});

router.post('/complete', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const sessionState = await getCachedSessionOrNull(req.user._id);
        if (!sessionState) {
            return res.status(400).json({ message: 'No active focus session found. Start a session first.' });
        }

        const startedAt = new Date(sessionState.startedAt);
        const now = new Date();

        if (Number.isNaN(startedAt.getTime())) {
            await redisClient.del(getFocusRedisKey(req.user._id));
            return res.status(400).json({ message: 'Corrupt focus session in cache. Please start again.' });
        }

        const plannedMinutes = clampPlannedMinutes(sessionState.plannedMinutes || req.body?.plannedMinutes || 25, 25);
        const sessionToken = sessionState.sessionToken || req.body?.completionToken || randomUUID();

        const lock = await acquireCompletionLock(req.user._id, sessionToken);

        if (!lock) {
            const latestSession = await FocusSession.findOne({ userId: req.user._id })
                .sort({ createdAt: -1 })
                .lean();

            return res.status(409).json({
                message: 'Focus session completion already processed.',
                duplicate: true,
                session: latestSession ? {
                    id: latestSession._id,
                    date: latestSession.date,
                    plannedMinutes: latestSession.plannedMinutes,
                    actualMinutes: latestSession.actualMinutes,
                    completed: latestSession.completed,
                    xpEarned: latestSession.xpEarned,
                } : null,
                xpAwarded: latestSession?.xpEarned || 0,
            });
        }

        const elapsedMs = calculateEffectiveElapsedMs(sessionState, now);
        const actualMinutes = Math.max(1, Math.round(elapsedMs / 60000));
        const completed = true;
        const xpEarned = calculateFocusXP(actualMinutes, plannedMinutes);

        const awardResult = await awardXpViaInternalRoute(req, xpEarned);

        const focusSession = await FocusSession.create({
            userId: req.user._id,
            date: startOfUtcDay(now),
            plannedMinutes,
            actualMinutes,
            completed,
            xpEarned,
        });

        await deleteCachedSession(req.user._id);

        return res.status(201).json({
            message: 'Focus session completed.',
            session: {
                id: focusSession._id,
                date: focusSession.date,
                plannedMinutes,
                actualMinutes,
                completed,
                xpEarned,
            },
            xpAwarded: xpEarned,
            awardSource: awardResult.source,
            sessionToken,
        });
    } catch (error) {
        console.error('[Focus] Error completing session:', error);
        return res.status(500).json({ message: 'Failed to complete focus session.' });
    }
});

router.get('/summary', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const completedSessions = await FocusSession.find({
            userId: req.user._id,
            completed: true,
        })
            .select('date actualMinutes createdAt')
            .sort({ date: -1, createdAt: -1 })
            .lean();

        const dailyMinutes = new Map();
        for (const session of completedSessions) {
            const dayKey = toDayKey(new Date(session.date || session.createdAt));
            const previous = dailyMinutes.get(dayKey) || 0;
            dailyMinutes.set(dayKey, previous + (session.actualMinutes || 0));
        }

        const today = startOfUtcDay(new Date());
        const todayKey = toDayKey(today);
        const yesterday = new Date(today);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);

        let streakCursor = dailyMinutes.has(todayKey) ? today : yesterday;
        let currentStreak = 0;
        while (dailyMinutes.has(toDayKey(streakCursor))) {
            currentStreak += 1;
            streakCursor = new Date(streakCursor);
            streakCursor.setUTCDate(streakCursor.getUTCDate() - 1);
        }

        const weekStart = new Date(today);
        weekStart.setUTCDate(weekStart.getUTCDate() - 6);
        const weekStartMs = weekStart.getTime();
        let totalFocusMinutesThisWeek = 0;
        for (const [dayKey, minutes] of dailyMinutes.entries()) {
            const dayMs = new Date(`${dayKey}T00:00:00.000Z`).getTime();
            if (dayMs >= weekStartMs) {
                totalFocusMinutesThisWeek += minutes;
            }
        }

        const activeSession = await getCachedSessionOrNull(req.user._id);

        return res.json({
            stats: {
                currentStreak,
                todaySessionsCount: completedSessions.filter((session) => toDayKey(new Date(session.date || session.createdAt)) === todayKey).length,
                totalFocusMinutesThisWeek,
                totalCompletedSessions: completedSessions.length,
            },
            activeSession: activeSession ? {
                startedAt: activeSession.startedAt,
                plannedMinutes: clampPlannedMinutes(activeSession.plannedMinutes, 25),
                status: activeSession.status || 'running',
                sessionToken: activeSession.sessionToken || null,
                remainingSeconds: getRemainingSeconds(activeSession),
            } : null,
        });
    } catch (error) {
        console.error('[Focus] Error fetching summary:', error);
        return res.status(500).json({ message: 'Failed to fetch focus summary.' });
    }
});

router.get('/streak', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const completedSessions = await FocusSession.find({
            userId: req.user._id,
            completed: true,
        })
            .select('date actualMinutes createdAt')
            .sort({ date: -1, createdAt: -1 })
            .lean();

        const dailyMinutes = new Map();

        for (const session of completedSessions) {
            const dayKey = toDayKey(new Date(session.date || session.createdAt));
            const previous = dailyMinutes.get(dayKey) || 0;
            dailyMinutes.set(dayKey, previous + (session.actualMinutes || 0));
        }

        const today = startOfUtcDay(new Date());
        const todayKey = toDayKey(today);
        const yesterday = new Date(today);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);

        let streakCursor = dailyMinutes.has(todayKey) ? today : yesterday;
        let currentStreak = 0;

        while (dailyMinutes.has(toDayKey(streakCursor))) {
            currentStreak += 1;
            streakCursor = new Date(streakCursor);
            streakCursor.setUTCDate(streakCursor.getUTCDate() - 1);
        }

        const weekStart = new Date(today);
        weekStart.setUTCDate(weekStart.getUTCDate() - 6);
        const weekStartMs = weekStart.getTime();

        let totalFocusMinutesThisWeek = 0;
        for (const [dayKey, minutes] of dailyMinutes.entries()) {
            const dayMs = new Date(`${dayKey}T00:00:00.000Z`).getTime();
            if (dayMs >= weekStartMs) {
                totalFocusMinutesThisWeek += minutes;
            }
        }

        return res.json({
            currentStreak,
            todaySessionsCount: completedSessions.filter((session) => toDayKey(new Date(session.date || session.createdAt)) === todayKey).length,
            totalFocusMinutesThisWeek,
            totalCompletedSessions: completedSessions.length,
        });
    } catch (error) {
        console.error('[Focus] Error fetching streak:', error);
        return res.status(500).json({ message: 'Failed to fetch focus streak.' });
    }
});

module.exports = router;

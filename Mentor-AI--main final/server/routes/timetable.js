const express = require('express');
const router = express.Router();
const { auditLog, logger } = require('../utils/logger');

const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_POOL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function toMinutes(timeValue, fallbackMinutes) {
    if (typeof timeValue !== 'string') return fallbackMinutes;
    const match = timeValue.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return fallbackMinutes;
    return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(totalMinutes) {
    const safeMinutes = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(safeMinutes / 60) % 24;
    const minutes = safeMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clampNumber(value, fallback, min, max) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function normalizeSubjects(preferredSubjects) {
    if (Array.isArray(preferredSubjects)) {
        return preferredSubjects.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof preferredSubjects === 'string') {
        return preferredSubjects
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
}

function buildSlots({ dayLabel, goalText, topic, studyMinutes, wakeMinutes, sleepMinutes, focusBlockMinutes, breakMinutes }) {
    const slots = [];
    const maxStudyWindow = Math.max(60, sleepMinutes - wakeMinutes - 30);
    let remainingStudyMinutes = Math.min(studyMinutes, maxStudyWindow);
    let cursor = wakeMinutes;

    const addSlot = (title, duration, kind, description) => {
        const actualDuration = Math.max(0, Math.min(duration, remainingStudyMinutes));
        if (actualDuration <= 0) return;
        const start = cursor;
        const end = cursor + actualDuration;
        slots.push({
            title,
            kind,
            description,
            startTime: formatMinutes(start),
            endTime: formatMinutes(end),
            durationMinutes: actualDuration,
        });
        cursor = end;
        remainingStudyMinutes -= actualDuration;
    };

    addSlot(
        'Morning setup',
        Math.min(20, remainingStudyMinutes),
        'warmup',
        `Review your plan for ${dayLabel} and set up the first pass on ${goalText}.`
    );

    const focusLabels = [
        'Deep focus block',
        'Practice block',
        'Active recall block',
        'Reflection block',
    ];

    let focusIndex = 0;
    while (remainingStudyMinutes > 0) {
        const focusDuration = Math.min(focusBlockMinutes, remainingStudyMinutes);
        addSlot(
            focusLabels[focusIndex % focusLabels.length],
            focusDuration,
            focusIndex % 2 === 0 ? 'focus' : 'practice',
            `Work on ${topic} with full attention and one clear outcome.`
        );

        if (remainingStudyMinutes <= 0) {
            break;
        }

        const breakDuration = Math.min(breakMinutes, remainingStudyMinutes);
        addSlot(
            'Reset break',
            breakDuration,
            'break',
            'Stand up, hydrate, and step away from the screen before the next block.'
        );

        focusIndex += 1;
    }

    const totalAllocatedMinutes = slots.reduce((sum, slot) => sum + slot.durationMinutes, 0);
    const closingStart = wakeMinutes + totalAllocatedMinutes;
    if (closingStart < sleepMinutes && slots.length < 8) {
        const closingWindow = Math.min(25, sleepMinutes - closingStart);
        if (closingWindow > 0) {
            slots.push({
                title: 'Evening recap',
                kind: 'review',
                description: `Capture what you learned in ${topic} and note tomorrow's first task.`,
                startTime: formatMinutes(closingStart),
                endTime: formatMinutes(closingStart + closingWindow),
                durationMinutes: closingWindow,
            });
        }
    }

    return {
        dayLabel,
        topic,
        totalStudyMinutes: slots.reduce((sum, slot) => sum + slot.durationMinutes, 0),
        slots,
    };
}

// @route   POST /api/timetable/generate
// @desc    Generate a personal study timetable for the authenticated user.
// @access  Private
router.post('/generate', async (req, res) => {
    const {
        goal,
        studyHoursPerDay,
        studyDaysPerWeek,
        wakeTime,
        sleepTime,
        focusBlockMinutes,
        breakMinutes,
        includeWeekends,
        preferredSubjects,
    } = req.body || {};

    const goalText = typeof goal === 'string' ? goal.trim() : '';
    if (!goalText) {
        return res.status(400).json({ message: 'A learning goal is required.' });
    }

    try {
        const dailyStudyHours = clampNumber(studyHoursPerDay, 4, 1, 14);
        const requestedDays = clampNumber(studyDaysPerWeek, 5, 1, 7);
        const studyBlockMinutes = clampNumber(focusBlockMinutes, 50, 20, 180);
        const restMinutes = clampNumber(breakMinutes, 10, 5, 60);
        const wakeMinutes = toMinutes(wakeTime, 7 * 60);
        const sleepMinutes = toMinutes(sleepTime, 22 * 60);
        const subjectPool = normalizeSubjects(preferredSubjects);
        const availableDays = includeWeekends ? WEEKDAY_LABELS : WEEKDAY_POOL;
        const selectedDays = availableDays.slice(0, Math.min(requestedDays, availableDays.length));
        const studyMinutesPerDay = dailyStudyHours * 60;

        const timetableDays = selectedDays.map((dayLabel, dayIndex) => {
            const subjectTopic = subjectPool.length > 0
                ? subjectPool[dayIndex % subjectPool.length]
                : goalText;

            return buildSlots({
                dayLabel,
                goalText,
                topic: subjectTopic,
                studyMinutes: studyMinutesPerDay,
                wakeMinutes,
                sleepMinutes,
                focusBlockMinutes: studyBlockMinutes,
                breakMinutes: restMinutes,
            });
        });

        const totalStudyMinutes = timetableDays.reduce((sum, day) => sum + day.totalStudyMinutes, 0);
        const totalSlots = timetableDays.reduce((sum, day) => sum + day.slots.length, 0);

        const response = {
            title: `${goalText} Timetable`,
            summary: `A ${selectedDays.length}-day timetable with ${dailyStudyHours} study hours per day and ${studyBlockMinutes}-minute focus blocks.`,
            generatedAt: new Date().toISOString(),
            settings: {
                goal: goalText,
                studyHoursPerDay: dailyStudyHours,
                studyDaysPerWeek: selectedDays.length,
                wakeTime: formatMinutes(wakeMinutes),
                sleepTime: formatMinutes(sleepMinutes),
                focusBlockMinutes: studyBlockMinutes,
                breakMinutes: restMinutes,
                includeWeekends: Boolean(includeWeekends),
                preferredSubjects: subjectPool,
            },
            days: timetableDays,
            tips: [
                'Keep the first block of the day distraction-free and offline.',
                'If a session runs long, protect the next break rather than skipping it.',
                'Update the goal text weekly so the plan stays aligned with your current priority.',
            ],
            metrics: {
                totalStudyMinutes,
                totalSlots,
            },
        };

        auditLog(req, 'TIMETABLE_GENERATION_SUCCESS', {
            goal: goalText,
            studyHoursPerDay: dailyStudyHours,
            studyDaysPerWeek: selectedDays.length,
            includeWeekends: Boolean(includeWeekends),
        });

        logger.info('[Timetable] Generated personal timetable', {
            userId: req.user?._id?.toString() || 'unknown',
            goal: goalText,
            days: selectedDays.length,
        });

        return res.status(200).json(response);
    } catch (error) {
        auditLog(req, 'TIMETABLE_GENERATION_FAILURE', {
            goal: goalText,
            error: error.message,
        });
        logger.error('[Timetable] Failed to generate timetable', {
            message: error.message,
            stack: error.stack,
        });
        return res.status(500).json({ message: `Failed to generate timetable: ${error.message}` });
    }
});

module.exports = router;
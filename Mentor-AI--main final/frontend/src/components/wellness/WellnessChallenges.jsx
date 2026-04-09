import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Eye, Droplets, Wind, Briefcase, Clock3, Star, X, Flame, Target } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:2000/api';

const ACTIVITY_XP = {
    eye_blink: 25,
    water: 15,
    breathing: 30,
    linkedin: 20,
};

const WATER_REMINDER_KEY = 'wellness:lastWaterReminderAt';
const LINKEDIN_VISITED_KEY = 'wellness:linkedin:lastVisitedAt';
const LINKEDIN_END_KEY = 'wellness:linkedin:endAt';

function getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatSeconds(totalSeconds) {
    const safe = Math.max(0, totalSeconds);
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function hoursAgoLabel(dateMs) {
    if (!dateMs) return 'Never';
    const hours = (Date.now() - dateMs) / (1000 * 60 * 60);
    if (hours < 1) return 'Less than 1 hour ago';
    if (hours < 24) return `${Math.floor(hours)} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

function RatingModal({ isOpen, activityLabel, onClose, onSubmit }) {
    const [rating, setRating] = useState(0);

    useEffect(() => {
        if (isOpen) setRating(0);
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-5 shadow-2xl">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-text-light dark:text-text-dark">Rate {activityLabel}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1 text-text-muted-light dark:text-text-muted-dark hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                        <X size={16} />
                    </button>
                </div>
                <p className="mb-4 text-sm text-text-muted-light dark:text-text-muted-dark">How helpful was this break?</p>
                <div className="mb-4 flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setRating(value)}
                            className="rounded-md p-1"
                        >
                            <Star
                                size={28}
                                className={value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}
                            />
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => onSubmit(rating)}
                    disabled={rating < 1}
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Submit Rating
                </button>
            </div>
        </div>
    );
}

function WellnessChallenges({ onWellnessUpdate }) {
    const [stats, setStats] = useState({
        wellnessXpToday: 0,
        totalXpFromWellness: 0,
        totalActivitiesCompleted: 0,
        activitiesCompletedToday: 0,
        dailyGoal: 3,
        dailyGoalProgress: 0,
        dailyGoalReached: false,
        weeklyStreakDays: 0,
        weeklyActivitiesCompleted: 0,
        activityCounts: { eye_blink: 0, water: 0, breathing: 0, linkedin: 0 },
        globalAverageRatingPerActivityType: { eye_blink: 0, water: 0, breathing: 0, linkedin: 0 },
    });

    const [todayActivities, setTodayActivities] = useState([]);
    const [isWaterBannerVisible, setIsWaterBannerVisible] = useState(false);

    const [blinkModalOpen, setBlinkModalOpen] = useState(false);
    const [blinkRemaining, setBlinkRemaining] = useState(30);

    const [waterFill, setWaterFill] = useState(0);

    const [breathingActive, setBreathingActive] = useState(false);
    const [breathingRemaining, setBreathingRemaining] = useState(38);

    const [linkedinEndAt, setLinkedinEndAt] = useState(() => {
        const raw = localStorage.getItem(LINKEDIN_END_KEY);
        return raw ? Number(raw) : null;
    });
    const [linkedinRemaining, setLinkedinRemaining] = useState(0);
    const [linkedinLastVisitedAt, setLinkedinLastVisitedAt] = useState(() => {
        const raw = localStorage.getItem(LINKEDIN_VISITED_KEY);
        return raw ? Number(raw) : null;
    });

    const [ratingTarget, setRatingTarget] = useState(null);
    const [isSavingRating, setIsSavingRating] = useState(false);
    const [goalInput, setGoalInput] = useState(3);
    const [isSavingGoal, setIsSavingGoal] = useState(false);

    const blinkTimerRef = useRef(null);
    const breathingTimerRef = useRef(null);

    const getBreathingPhase = (remaining) => {
        const elapsed = 38 - remaining;
        const cycleElapsed = elapsed % 19;

        if (cycleElapsed < 4) return { label: 'Inhale (4s)', scale: 1.15 };
        if (cycleElapsed < 11) return { label: 'Hold (7s)', scale: 1.2 };
        return { label: 'Exhale (8s)', scale: 0.9 };
    };

    const breathingPhase = useMemo(() => getBreathingPhase(breathingRemaining), [breathingRemaining]);

    const refreshAll = useCallback(async () => {
        const headers = { headers: getAuthHeaders() };

        try {
            const [statsResult, todayResult] = await Promise.allSettled([
                axios.get(`${API_BASE}/wellness/stats`, headers),
                axios.get(`${API_BASE}/wellness/today`, headers),
            ]);

            const todayData = todayResult.status === 'fulfilled' ? (todayResult.value.data || {}) : {};
            const statsData = statsResult.status === 'fulfilled' ? (statsResult.value.data || {}) : {};

            const activities = Array.isArray(todayData.activities) ? todayData.activities : [];
            const todayCount = Number.isFinite(todayData.count) ? todayData.count : activities.length;
            const todayXpFromTodayEndpoint = Number.isFinite(todayData.totalXpToday) ? todayData.totalXpToday : 0;
            const lifetimeXpFromTodayEndpoint = Number.isFinite(todayData.totalXpFromWellness) ? todayData.totalXpFromWellness : 0;
            const lifetimeCountFromTodayEndpoint = Number.isFinite(todayData.totalActivitiesCompleted) ? todayData.totalActivitiesCompleted : 0;

            setTodayActivities(activities);
            setStats((prev) => ({
                wellnessXpToday: Number.isFinite(statsData.wellnessXpToday) ? statsData.wellnessXpToday : todayXpFromTodayEndpoint,
                totalXpFromWellness: Number.isFinite(statsData.totalXpFromWellness)
                    ? statsData.totalXpFromWellness
                    : (lifetimeXpFromTodayEndpoint || prev.totalXpFromWellness),
                totalActivitiesCompleted: Number.isFinite(statsData.totalActivitiesCompleted)
                    ? statsData.totalActivitiesCompleted
                    : (lifetimeCountFromTodayEndpoint || prev.totalActivitiesCompleted),
                activitiesCompletedToday: Number.isFinite(statsData.activitiesCompletedToday)
                    ? statsData.activitiesCompletedToday
                    : todayCount,
                dailyGoal: Number.isFinite(statsData.dailyGoal) ? statsData.dailyGoal : (prev.dailyGoal || 3),
                dailyGoalProgress: Number.isFinite(statsData.dailyGoalProgress)
                    ? statsData.dailyGoalProgress
                    : Math.min(Number.isFinite(statsData.dailyGoal) ? statsData.dailyGoal : (prev.dailyGoal || 3), todayCount),
                dailyGoalReached: Boolean(statsData.dailyGoalReached),
                weeklyStreakDays: Number.isFinite(statsData.weeklyStreakDays) ? statsData.weeklyStreakDays : (prev.weeklyStreakDays || 0),
                weeklyActivitiesCompleted: Number.isFinite(statsData.weeklyActivitiesCompleted)
                    ? statsData.weeklyActivitiesCompleted
                    : (prev.weeklyActivitiesCompleted || 0),
                activityCounts: statsData.activityCounts || prev.activityCounts || { eye_blink: 0, water: 0, breathing: 0, linkedin: 0 },
                globalAverageRatingPerActivityType: statsData.globalAverageRatingPerActivityType || prev.globalAverageRatingPerActivityType || {
                    eye_blink: 0,
                    water: 0,
                    breathing: 0,
                    linkedin: 0,
                },
            }));
            setGoalInput(Number.isFinite(statsData.dailyGoal) ? statsData.dailyGoal : 3);
        } catch {
            setTodayActivities([]);
        }
    }, []);

    const saveDailyGoal = async () => {
        const nextGoal = Math.min(10, Math.max(1, Math.round(Number(goalInput) || 3)));
        setIsSavingGoal(true);
        try {
            await axios.put(
                `${API_BASE}/wellness/goal`,
                { dailyGoal: nextGoal },
                { headers: getAuthHeaders() }
            );
            toast.success(`Daily goal updated to ${nextGoal}.`);
            await refreshAll();
            window.dispatchEvent(new CustomEvent('wellness-stats-updated'));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not update daily goal.');
        } finally {
            setIsSavingGoal(false);
        }
    };

    const handleCompleteActivity = useCallback(async (activityType, durationSeconds) => {
        try {
            const response = await axios.post(
                `${API_BASE}/wellness/complete`,
                { activityType, durationSeconds },
                { headers: getAuthHeaders() }
            );

            const activity = response.data?.activity;
            const xpAwarded = response.data?.xpAwarded || ACTIVITY_XP[activityType] || 0;

            toast.success(`+${xpAwarded} XP earned!`);

            setRatingTarget({
                activityId: activity?._id,
                activityType,
                activityLabel:
                    activityType === 'eye_blink'
                        ? 'Eye Blink Rest'
                        : activityType === 'water'
                            ? 'Hydration Break'
                            : activityType === 'breathing'
                                ? '4-7-8 Breathing'
                                : 'Career Corner',
            });

            // Keep totals responsive even before network refresh resolves.
            setStats((prev) => ({
                ...prev,
                wellnessXpToday: (prev.wellnessXpToday || 0) + xpAwarded,
                totalXpFromWellness: (prev.totalXpFromWellness || 0) + xpAwarded,
                activitiesCompletedToday: (prev.activitiesCompletedToday || 0) + 1,
                totalActivitiesCompleted: (prev.totalActivitiesCompleted || 0) + 1,
                dailyGoalProgress: Math.min(prev.dailyGoal || 3, (prev.activitiesCompletedToday || 0) + 1),
                dailyGoalReached: ((prev.activitiesCompletedToday || 0) + 1) >= (prev.dailyGoal || 3),
                weeklyActivitiesCompleted: (prev.weeklyActivitiesCompleted || 0) + 1,
            }));
            if (activity) {
                setTodayActivities((prev) => [activity, ...prev]);
            }

            await refreshAll();
            window.dispatchEvent(new CustomEvent('wellness-stats-updated'));
            if (typeof onWellnessUpdate === 'function') {
                onWellnessUpdate();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not complete wellness activity.');
        }
    }, [onWellnessUpdate, refreshAll]);

    useEffect(() => {
        refreshAll();
        const interval = setInterval(refreshAll, 30000);
        return () => clearInterval(interval);
    }, [refreshAll]);

    useEffect(() => {
        const runReminderCheck = () => {
            const now = Date.now();
            const last = Number(localStorage.getItem(WATER_REMINDER_KEY) || 0);
            const twoHoursMs = 2 * 60 * 60 * 1000;

            if (!last || now - last >= twoHoursMs) {
                setIsWaterBannerVisible(true);
                localStorage.setItem(WATER_REMINDER_KEY, String(now));
                setTimeout(() => setIsWaterBannerVisible(false), 12000);
            }
        };

        runReminderCheck();
        const interval = setInterval(runReminderCheck, 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!blinkModalOpen) {
            setBlinkRemaining(30);
            if (blinkTimerRef.current) {
                clearInterval(blinkTimerRef.current);
                blinkTimerRef.current = null;
            }
            return;
        }

        blinkTimerRef.current = setInterval(() => {
            setBlinkRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(blinkTimerRef.current);
                    blinkTimerRef.current = null;
                    handleCompleteActivity('eye_blink', 30);
                    setBlinkModalOpen(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (blinkTimerRef.current) {
                clearInterval(blinkTimerRef.current);
                blinkTimerRef.current = null;
            }
        };
    }, [blinkModalOpen, handleCompleteActivity]);

    useEffect(() => {
        if (!breathingActive) {
            setBreathingRemaining(38);
            if (breathingTimerRef.current) {
                clearInterval(breathingTimerRef.current);
                breathingTimerRef.current = null;
            }
            return;
        }

        breathingTimerRef.current = setInterval(() => {
            setBreathingRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(breathingTimerRef.current);
                    breathingTimerRef.current = null;
                    setBreathingActive(false);
                    handleCompleteActivity('breathing', 38);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (breathingTimerRef.current) {
                clearInterval(breathingTimerRef.current);
                breathingTimerRef.current = null;
            }
        };
    }, [breathingActive, handleCompleteActivity]);

    useEffect(() => {
        if (!linkedinEndAt) {
            setLinkedinRemaining(0);
            return;
        }

        const update = () => {
            const next = Math.max(0, Math.ceil((linkedinEndAt - Date.now()) / 1000));
            setLinkedinRemaining(next);
            if (next === 0) {
                localStorage.removeItem(LINKEDIN_END_KEY);
                setLinkedinEndAt(null);
                handleCompleteActivity('linkedin', 900);
            }
        };

        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [linkedinEndAt, handleCompleteActivity]);

    const handleSubmitRating = async (rating) => {
        if (!ratingTarget?.activityId || isSavingRating) return;

        setIsSavingRating(true);
        try {
            await axios.post(
                `${API_BASE}/wellness/rate`,
                {
                    activityId: ratingTarget.activityId,
                    starRating: rating,
                },
                { headers: getAuthHeaders() }
            );

            toast.success('Thanks for rating this activity.');
            setRatingTarget(null);
            await refreshAll();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not save rating.');
        } finally {
            setIsSavingRating(false);
        }
    };

    const openLinkedIn = () => {
        const now = Date.now();
        localStorage.setItem(LINKEDIN_VISITED_KEY, String(now));
        setLinkedinLastVisitedAt(now);

        const endAt = now + 15 * 60 * 1000;
        localStorage.setItem(LINKEDIN_END_KEY, String(endAt));
        setLinkedinEndAt(endAt);

        window.open('https://linkedin.com', '_blank', 'noopener,noreferrer');
    };

    const setWaterAnimationAndComplete = () => {
        setWaterFill(100);
        setTimeout(() => setWaterFill(0), 1600);
        handleCompleteActivity('water', 20);
    };

    return (
        <section className="rounded-2xl border border-border-light dark:border-border-dark bg-surface-light/60 dark:bg-surface-dark/60 p-4 sm:p-6 shadow-lg">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-xl font-bold text-text-light dark:text-text-dark">Wellness & Breaks</h3>
                    <p className="text-sm text-text-muted-light dark:text-text-muted-dark">Healthy micro-breaks that reward consistency.</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 font-semibold text-orange-700 dark:text-orange-300">
                            <Flame size={12} /> Weekly Streak: {stats.weeklyStreakDays} day{stats.weeklyStreakDays === 1 ? '' : 's'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2.5 py-1 font-semibold text-cyan-700 dark:text-cyan-300">
                            <Target size={12} /> Goal: {stats.dailyGoalProgress}/{stats.dailyGoal} today
                        </span>
                    </div>
                </div>
                <div className="rounded-xl border border-emerald-300/60 bg-emerald-100/70 px-4 py-2 text-sm font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200">
                    Wellness XP Today: {stats.wellnessXpToday}
                </div>
            </div>

            <div className="mb-4 rounded-lg border border-border-light dark:border-border-dark p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-text-muted-light dark:text-text-muted-dark">
                    <span>Daily wellness goal progress</span>
                    <span>{stats.dailyGoalProgress}/{stats.dailyGoal}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                        className={`h-full transition-all duration-300 ${stats.dailyGoalReached ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                        style={{ width: `${Math.min(100, Math.round((stats.dailyGoalProgress / Math.max(1, stats.dailyGoal)) * 100))}%` }}
                    />
                </div>
                <p className="mt-2 text-[11px] text-text-muted-light dark:text-text-muted-dark">
                    {stats.dailyGoalReached
                        ? 'Daily goal reached. Great consistency!'
                        : `Complete ${Math.max(0, stats.dailyGoal - stats.dailyGoalProgress)} more for today's goal.`}
                </p>
                <div className="mt-3 flex items-center gap-2">
                    <label htmlFor="daily-goal-input" className="text-xs font-semibold text-text-muted-light dark:text-text-muted-dark">Set goal</label>
                    <input
                        id="daily-goal-input"
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        value={goalInput}
                        onChange={(e) => setGoalInput(e.target.value)}
                        className="w-20 rounded-md border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-2 py-1 text-xs"
                    />
                    <button
                        type="button"
                        onClick={saveDailyGoal}
                        disabled={isSavingGoal}
                        className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                        {isSavingGoal ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>

            {isWaterBannerVisible && (
                <div className="sticky top-16 z-40 mb-4 rounded-lg border border-teal-300 bg-teal-500 px-4 py-2 text-sm font-bold text-white shadow-lg">
                    Time to drink water!
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Card A: Eye Blink */}
                <div className="rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                            <h4 className="text-lg font-bold">Eye Blink Rest</h4>
                            <p className="text-xs text-text-muted-light dark:text-text-muted-dark">Gentle visual reset</p>
                        </div>
                        <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-600 dark:text-sky-300">25 XP</span>
                    </div>

                    <button
                        type="button"
                        onClick={() => setBlinkModalOpen(true)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700"
                    >
                        <Eye size={16} /> Start
                    </button>

                    <p className="mt-3 text-xs text-text-muted-light dark:text-text-muted-dark">
                        Avg rating: {stats.globalAverageRatingPerActivityType.eye_blink.toFixed(1)} / 5
                    </p>
                </div>

                {/* Card B: Water */}
                <div className="rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                            <h4 className="text-lg font-bold">Hydration Break</h4>
                            <p className="text-xs text-text-muted-light dark:text-text-muted-dark">One glass, quick reward</p>
                        </div>
                        <span className="rounded-full bg-teal-500/15 px-3 py-1 text-xs font-bold text-teal-600 dark:text-teal-300">15 XP</span>
                    </div>

                    <div className="mb-3 flex items-center justify-center">
                        <svg width="70" height="86" viewBox="0 0 70 86" aria-hidden="true">
                            <rect x="15" y="8" width="40" height="70" rx="8" fill="none" stroke="#94a3b8" strokeWidth="3" />
                            <rect
                                x="15"
                                y={78 - (70 * waterFill) / 100}
                                width="40"
                                height={(70 * waterFill) / 100}
                                rx="8"
                                fill="#0ea5e9"
                                style={{ transition: 'all 700ms ease' }}
                            />
                        </svg>
                    </div>

                    <button
                        type="button"
                        onClick={setWaterAnimationAndComplete}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
                    >
                        <Droplets size={16} /> I drank a glass
                    </button>

                    <p className="mt-3 text-xs text-text-muted-light dark:text-text-muted-dark">
                        Avg rating: {stats.globalAverageRatingPerActivityType.water.toFixed(1)} / 5
                    </p>
                </div>

                {/* Card C: Breathing */}
                <div className="rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                            <h4 className="text-lg font-bold">4-7-8 Breathing</h4>
                            <p className="text-xs text-text-muted-light dark:text-text-muted-dark">2 calming cycles (~38s)</p>
                        </div>
                        <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-bold text-violet-600 dark:text-violet-300">30 XP</span>
                    </div>

                    <div className="mb-3 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-light dark:border-border-dark p-3">
                        <div
                            className="h-20 w-20 rounded-full bg-violet-500/20"
                            style={{
                                transform: `scale(${breathingActive ? breathingPhase.scale : 1})`,
                                transition: 'transform 1s ease-in-out',
                            }}
                        />
                        <p className="text-sm font-semibold">{breathingActive ? breathingPhase.label : 'Ready to begin'}</p>
                        {breathingActive && <p className="text-xs text-text-muted-light dark:text-text-muted-dark">{breathingRemaining}s left</p>}
                    </div>

                    <button
                        type="button"
                        onClick={() => setBreathingActive(true)}
                        disabled={breathingActive}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60"
                    >
                        <Wind size={16} /> Begin
                    </button>

                    <p className="mt-3 text-xs text-text-muted-light dark:text-text-muted-dark">
                        Avg rating: {stats.globalAverageRatingPerActivityType.breathing.toFixed(1)} / 5
                    </p>
                </div>

                {/* Card D: LinkedIn */}
                <div className="rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                            <h4 className="text-lg font-bold">Career Corner</h4>
                            <p className="text-xs text-text-muted-light dark:text-text-muted-dark">15 min professional time</p>
                        </div>
                        <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">20 XP</span>
                    </div>

                    <div className="mb-3 rounded-lg border border-border-light dark:border-border-dark p-3 text-sm">
                        <p className="inline-flex items-center gap-2 font-semibold"><Clock3 size={15} /> {linkedinEndAt ? `Countdown: ${formatSeconds(linkedinRemaining)}` : 'Timer not started'}</p>
                        <p className="mt-1 text-xs text-text-muted-light dark:text-text-muted-dark">Last visited: {hoursAgoLabel(linkedinLastVisitedAt)}</p>
                    </div>

                    <button
                        type="button"
                        onClick={openLinkedIn}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                    >
                        <Briefcase size={16} /> Open LinkedIn
                    </button>

                    <p className="mt-3 text-xs text-text-muted-light dark:text-text-muted-dark">
                        Avg rating: {stats.globalAverageRatingPerActivityType.linkedin.toFixed(1)} / 5
                    </p>
                </div>
            </div>

            {/* Eye Blink modal */}
            {blinkModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-5 text-center shadow-2xl">
                        <h4 className="mb-4 text-xl font-bold">Eye Blink Rest</h4>
                        <div className="mx-auto mb-4 flex h-40 w-40 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-950 relative">
                            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 160 160">
                                <circle cx="80" cy="80" r="72" fill="none" stroke="#cbd5e1" strokeWidth="8" />
                                <circle
                                    cx="80"
                                    cy="80"
                                    r="72"
                                    fill="none"
                                    stroke="#0ea5e9"
                                    strokeWidth="8"
                                    strokeDasharray={2 * Math.PI * 72}
                                    strokeDashoffset={(2 * Math.PI * 72 * blinkRemaining) / 30}
                                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                                />
                            </svg>
                            <div className="text-4xl font-black">{blinkRemaining}</div>
                        </div>
                        <p className="mb-4 text-sm text-text-muted-light dark:text-text-muted-dark">Blink slowly and naturally. Let your eyes relax.</p>
                        <button
                            type="button"
                            onClick={() => setBlinkModalOpen(false)}
                            className="rounded-lg border border-border-light dark:border-border-dark px-4 py-2 text-sm font-semibold"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            <RatingModal
                isOpen={Boolean(ratingTarget)}
                activityLabel={ratingTarget?.activityLabel || 'this activity'}
                onClose={() => setRatingTarget(null)}
                onSubmit={handleSubmitRating}
            />

            <div className="mt-5 rounded-xl border border-border-light dark:border-border-dark p-3 text-xs text-text-muted-light dark:text-text-muted-dark">
                Completed Today: {stats.activitiesCompletedToday || todayActivities.length} activities · Lifetime Completed: {stats.totalActivitiesCompleted} · Total Wellness XP: {stats.totalXpFromWellness}
            </div>
        </section>
    );
}

export default WellnessChallenges;

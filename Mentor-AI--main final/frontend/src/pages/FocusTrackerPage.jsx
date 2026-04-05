import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Clock3, Flame, Timer, ArrowLeft, Pause, Play, Square } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

const QUOTES = [
    'Deep focus beats random hustle every single day.',
    'Small focused sessions compound into mastery.',
    'Guard your attention. It is your superpower.',
    'Consistency is your unfair advantage.',
    'One focused block today, one breakthrough tomorrow.',
    'Discipline is remembering what you want most.',
    'Show up, lock in, and trust the process.',
    'Progress prefers concentration over motivation.',
    'Minutes of focus create hours of momentum.',
    'Stay with the task. Clarity follows effort.'
];

const PRESET_MINUTES = [25, 45, 60];

function formatSeconds(totalSeconds) {
    const safeSeconds = Math.max(0, totalSeconds);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatWeekMinutes(minutes) {
    if (!minutes) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hours) return `${mins}m`;
    if (!mins) return `${hours}h`;
    return `${hours}h ${mins}m`;
}

function getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function FocusTrackerPage() {
    const [selectedMinutes, setSelectedMinutes] = useState(25);
    const [customMinutes, setCustomMinutes] = useState('30');
    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
    const [plannedMinutesForSession, setPlannedMinutesForSession] = useState(25);
    const [sessionToken, setSessionToken] = useState(null);
    const [activeQuote, setActiveQuote] = useState(QUOTES[0]);
    const [loading, setLoading] = useState(false);

    const [stats, setStats] = useState({
        todaySessionsCount: 0,
        currentStreak: 0,
        totalFocusMinutesThisWeek: 0,
    });

    const [xpPopup, setXpPopup] = useState({ show: false, xp: 0 });

    const intervalRef = useRef(null);
    const quoteIntervalRef = useRef(null);
    const completionLockRef = useRef(false);

    const effectiveMinutes = useMemo(() => {
        if (selectedMinutes === 'custom') {
            const parsed = Number(customMinutes);
            if (!Number.isFinite(parsed)) return 25;
            return Math.min(180, Math.max(5, Math.round(parsed)));
        }
        return selectedMinutes;
    }, [selectedMinutes, customMinutes]);

    const progress = useMemo(() => {
        const total = Math.max(1, plannedMinutesForSession * 60);
        return Math.max(0, Math.min(100, ((total - remainingSeconds) / total) * 100));
    }, [remainingSeconds, plannedMinutesForSession]);

    const ringStyle = useMemo(
        () => ({
            background: `conic-gradient(var(--focus-ring) ${progress}%, var(--focus-ring-muted) ${progress}% 100%)`,
        }),
        [progress]
    );

    const fetchStats = async () => {
        try {
            const response = await axios.get(`${API_BASE}/focus/streak`, { headers: getAuthHeaders() });
            const data = response.data || {};
            setStats({
                todaySessionsCount: data.todaySessionsCount || 0,
                currentStreak: data.currentStreak || 0,
                totalFocusMinutesThisWeek: data.totalFocusMinutesThisWeek || 0,
            });
        } catch (error) {
            console.error('[FocusTracker] Failed to fetch streak stats:', error);
        }
    };

    const loadSummary = async () => {
        try {
            const response = await axios.get(`${API_BASE}/focus/summary`, { headers: getAuthHeaders() });
            const data = response.data || {};
            const statsData = data.stats || {};
            setStats({
                todaySessionsCount: statsData.todaySessionsCount || 0,
                currentStreak: statsData.currentStreak || 0,
                totalFocusMinutesThisWeek: statsData.totalFocusMinutesThisWeek || 0,
            });

            const active = data.activeSession;
            if (active) {
                setPlannedMinutesForSession(active.plannedMinutes || 25);
                setRemainingSeconds(Math.max(0, active.remainingSeconds || 0));
                setSessionToken(active.sessionToken || null);

                if ((active.status || 'running') === 'paused') {
                    setIsPaused(true);
                    setIsRunning(true);
                } else {
                    setIsPaused(false);
                    setIsRunning((active.remainingSeconds || 0) > 0);
                }
            }
        } catch (error) {
            console.error('[FocusTracker] Failed to fetch summary:', error);
        }
    };

    useEffect(() => {
        loadSummary();
    }, []);

    useEffect(() => {
        if (isRunning || isPaused) return;
        setRemainingSeconds(effectiveMinutes * 60);
        setPlannedMinutesForSession(effectiveMinutes);
    }, [effectiveMinutes, isRunning, isPaused]);

    useEffect(() => {
        if (!isRunning || isPaused) return;

        intervalRef.current = setInterval(() => {
            setRemainingSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        quoteIntervalRef.current = setInterval(() => {
            const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
            setActiveQuote(quote);
        }, 10000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (quoteIntervalRef.current) clearInterval(quoteIntervalRef.current);
        };
    }, [isRunning, isPaused]);

    useEffect(() => {
        if (!isRunning || isPaused || remainingSeconds !== 0) return;

        if (completionLockRef.current) return;
        completionLockRef.current = true;

        const complete = async () => {
            try {
                const response = await axios.post(
                    `${API_BASE}/focus/complete`,
                    {
                        plannedMinutes: plannedMinutesForSession,
                        completionToken: sessionToken,
                    },
                    { headers: getAuthHeaders() }
                );

                const xpAwarded = response.data?.xpAwarded || 0;
                setXpPopup({ show: true, xp: xpAwarded });

                try {
                    const confettiModule = await import('canvas-confetti');
                    const confetti = confettiModule.default;
                    confetti({
                        particleCount: 180,
                        spread: 120,
                        origin: { y: 0.6 },
                        colors: ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444'],
                    });
                } catch {
                    console.warn('[FocusTracker] canvas-confetti unavailable, skipping visual burst.');
                }

                toast.success(`Focus session complete! +${xpAwarded} XP`);
                setIsPaused(false);
                setSessionToken(null);
                fetchStats();
            } catch (error) {
                if (error.response?.status === 409) {
                    const duplicateXp = error.response?.data?.xpAwarded || 0;
                    if (duplicateXp > 0) {
                        setXpPopup({ show: true, xp: duplicateXp });
                    }
                    toast('Session was already completed.', { icon: 'i' });
                } else {
                const message = error.response?.data?.message || 'Failed to complete focus session.';
                toast.error(message);
                }
            } finally {
                setIsRunning(false);
                completionLockRef.current = false;
            }
        };

        complete();
    }, [isRunning, isPaused, remainingSeconds, plannedMinutesForSession, sessionToken]);

    const startFocusSession = async () => {
        if (loading || isRunning) return;

        setLoading(true);
        const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
        setActiveQuote(quote);

        try {
            const startResponse = await axios.post(
                `${API_BASE}/focus/start`,
                { plannedMinutes: effectiveMinutes },
                { headers: getAuthHeaders() }
            );

            setPlannedMinutesForSession(effectiveMinutes);
            setRemainingSeconds(effectiveMinutes * 60);
            setSessionToken(startResponse.data?.sessionToken || null);
            setIsPaused(false);
            setIsRunning(true);
            toast.success('Focus session started. Stay locked in.');
        } catch (error) {
            const message = error.response?.data?.message || 'Could not start focus session.';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const pauseFocusSession = async () => {
        if (!isRunning || isPaused || loading) return;
        setLoading(true);
        try {
            const response = await axios.post(`${API_BASE}/focus/pause`, {}, { headers: getAuthHeaders() });
            setIsPaused(true);
            if (Number.isFinite(response.data?.remainingSeconds)) {
                setRemainingSeconds(response.data.remainingSeconds);
            }
            toast.success('Session paused.');
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to pause focus session.';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const resumeFocusSession = async () => {
        if (!isRunning || !isPaused || loading) return;
        setLoading(true);
        try {
            const response = await axios.post(`${API_BASE}/focus/resume`, {}, { headers: getAuthHeaders() });
            setIsPaused(false);
            if (Number.isFinite(response.data?.remainingSeconds)) {
                setRemainingSeconds(response.data.remainingSeconds);
            }
            toast.success('Session resumed.');
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to resume focus session.';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const cancelFocusSession = async () => {
        if (!isRunning || loading) return;
        setLoading(true);
        try {
            await axios.post(`${API_BASE}/focus/cancel`, {}, { headers: getAuthHeaders() });
            setIsRunning(false);
            setIsPaused(false);
            setSessionToken(null);
            setRemainingSeconds(effectiveMinutes * 60);
            setPlannedMinutesForSession(effectiveMinutes);
            toast.success('Session canceled.');
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to cancel focus session.';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-full w-full overflow-hidden bg-gradient-to-br from-sky-50 via-teal-50 to-emerald-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-slate-100">
            <style>{`
                :root {
                    --focus-ring: #0ea5e9;
                    --focus-ring-muted: #dbeafe;
                    --focus-surface: rgba(255,255,255,0.85);
                }
                .dark :root {
                    --focus-ring: #38bdf8;
                    --focus-ring-muted: #1e293b;
                    --focus-surface: rgba(15,23,42,0.84);
                }
            `}</style>

            <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-10 pt-8 transition-all duration-500">
                <div className="mb-6 flex w-full items-center justify-between">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
                    >
                        <ArrowLeft size={16} />
                        Back to Tutor
                    </Link>
                    <div className="rounded-full border border-emerald-200 bg-emerald-100/80 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                        Focus & Consistency Tracker
                    </div>
                </div>

                <div className="w-full rounded-3xl border border-white/70 bg-[var(--focus-surface)] p-6 shadow-2xl backdrop-blur-xl dark:border-slate-700/80 md:p-10">
                    <div className="grid gap-8 md:grid-cols-[1fr_320px] md:items-center">
                        <div className="flex flex-col items-center">
                            <div className="relative flex h-72 w-72 items-center justify-center rounded-full p-3 md:h-80 md:w-80" style={ringStyle}>
                                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white/90 text-center shadow-inner dark:bg-slate-900/90">
                                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Time Left</p>
                                    <p className="text-6xl font-black tracking-tight text-slate-900 dark:text-slate-100">{formatSeconds(remainingSeconds)}</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Planned {plannedMinutesForSession} minutes</p>
                                </div>
                            </div>

                            <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {PRESET_MINUTES.map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            disabled={isRunning || isPaused}
                                            onClick={() => setSelectedMinutes(value)}
                                            className={`rounded-xl border px-2 py-2 text-sm font-bold transition ${selectedMinutes === value
                                                ? 'border-sky-600 bg-sky-600 text-white'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                                                } ${(isRunning || isPaused) ? 'cursor-not-allowed opacity-60' : ''}`}
                                        >
                                            {value}m
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        disabled={isRunning || isPaused}
                                        onClick={() => setSelectedMinutes('custom')}
                                        className={`rounded-xl border px-2 py-2 text-sm font-bold transition ${selectedMinutes === 'custom'
                                            ? 'border-sky-600 bg-sky-600 text-white'
                                            : 'border-slate-200 bg-white text-slate-700 hover:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                                            } ${(isRunning || isPaused) ? 'cursor-not-allowed opacity-60' : ''}`}
                                    >
                                        Custom
                                    </button>
                                </div>

                                {selectedMinutes === 'custom' && (
                                    <input
                                        type="number"
                                        min="5"
                                        max="180"
                                        step="1"
                                        disabled={isRunning || isPaused}
                                        value={customMinutes}
                                        onChange={(e) => setCustomMinutes(e.target.value)}
                                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none ring-sky-300 transition focus:ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                        placeholder="Enter minutes (5-180)"
                                    />
                                )}

                                <button
                                    type="button"
                                    onClick={startFocusSession}
                                    disabled={loading || isRunning}
                                    className="mt-1 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-extrabold uppercase tracking-wider text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                                >
                                    {isRunning ? 'Session Running' : loading ? 'Starting...' : 'Start Focus'}
                                </button>

                                {isRunning && (
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={isPaused ? resumeFocusSession : pauseFocusSession}
                                            disabled={loading}
                                            className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                        >
                                            {isPaused ? <Play size={14} /> : <Pause size={14} />}
                                            {isPaused ? 'Resume' : 'Pause'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={cancelFocusSession}
                                            disabled={loading}
                                            className="col-span-2 inline-flex items-center justify-center gap-1 rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-600 disabled:opacity-60"
                                        >
                                            <Square size={14} /> Cancel Session
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/80">
                                <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Stats</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="inline-flex items-center gap-2 text-sm font-semibold"><Timer size={16} /> Today's Sessions</span>
                                        <span className="text-lg font-black">{stats.todaySessionsCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="inline-flex items-center gap-2 text-sm font-semibold"><Flame size={16} /> Current Streak</span>
                                        <span className="text-lg font-black">{stats.currentStreak} days</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="inline-flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} /> This Week</span>
                                        <span className="text-lg font-black">{formatWeekMinutes(stats.totalFocusMinutesThisWeek)}</span>
                                    </div>
                                </div>
                            </div>

                            {isRunning && (
                                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-slate-800 shadow-sm dark:border-sky-800 dark:bg-sky-950/50 dark:text-slate-100">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                                        {isPaused ? 'Focus Mode Paused' : 'Focus Mode Active'}
                                    </p>
                                    <p className="mt-2 text-lg font-bold leading-tight">
                                        {activeQuote}
                                    </p>
                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                        {isPaused ? 'Resume when ready. The timer stays synced.' : 'Keep working in the app. Your timer stays synced in the side dock.'}
                                    </p>
                                </div>
                            )}

                            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                                Complete at least one focus session daily to grow your streak. Each completed session grants XP automatically.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {xpPopup.show && (
                <div className="fixed right-4 top-20 z-40 animate-[bounce_1s_ease-in-out_2] rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-xl dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100">
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">XP Earned</p>
                    <p className="text-2xl font-black">+{xpPopup.xp}</p>
                    <button
                        className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
                        onClick={() => setXpPopup({ show: false, xp: 0 })}
                    >
                        Awesome
                    </button>
                </div>
            )}
        </div>
    );
}

export default FocusTrackerPage;

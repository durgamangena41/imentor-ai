import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppState } from '../contexts/AppStateContext.jsx';
import api from '../services/api.js';
import Button from '../components/core/Button.jsx';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import {
    ArrowRight,
    CalendarDays,
    CalendarClock,
    ChevronLeft,
    Clock3,
    Download,
    Loader2,
    Sparkles,
    Target,
    TimerReset,
    BookOpen,
    BrainCircuit,
} from 'lucide-react';

const dayToneStyles = {
    warmup: 'bg-violet-500/15 text-violet-200 border-violet-400/30',
    focus: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
    practice: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
    review: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    break: 'bg-slate-500/15 text-slate-200 border-slate-400/30',
};

const defaultFormState = {
    goal: '',
    studyHoursPerDay: 4,
    studyDaysPerWeek: 5,
    wakeTime: '07:00',
    sleepTime: '22:30',
    focusBlockMinutes: 50,
    breakMinutes: 10,
    includeWeekends: false,
    preferredSubjects: '',
};

const TIMETABLE_STORAGE_KEY = 'imentor:last-timetable';
const TIMETABLE_HISTORY_STORAGE_KEY = 'imentor:timetable-history';

function TimetablePage() {
    const location = useLocation();
    const { selectedSubject } = useAppState();
    const [form, setForm] = useState(defaultFormState);
    const [timetable, setTimetable] = useState(null);
    const [savedPlans, setSavedPlans] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const prefilledGoal = location.state?.prefilledGoal || selectedSubject || '';
        if (prefilledGoal && !form.goal) {
            setForm((current) => ({ ...current, goal: prefilledGoal }));
        }
    }, [location.state, selectedSubject, form.goal]);

    useEffect(() => {
        try {
            const savedTimetable = localStorage.getItem(TIMETABLE_STORAGE_KEY);
            if (savedTimetable) {
                setTimetable(JSON.parse(savedTimetable));
            }

            const savedHistory = localStorage.getItem(TIMETABLE_HISTORY_STORAGE_KEY);
            if (savedHistory) {
                const parsedHistory = JSON.parse(savedHistory);
                if (Array.isArray(parsedHistory)) {
                    setSavedPlans(parsedHistory);
                }
            }
        } catch {
            localStorage.removeItem(TIMETABLE_STORAGE_KEY);
            localStorage.removeItem(TIMETABLE_HISTORY_STORAGE_KEY);
        }
    }, []);

    const persistTimetable = (value) => {
        setTimetable(value);
        try {
            if (value) {
                localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(value));
            } else {
                localStorage.removeItem(TIMETABLE_STORAGE_KEY);
            }
        } catch {
            // Ignore storage failures and keep the generated timetable in-memory.
        }
    };

    const buildSavedPlan = (plan) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        title: plan?.title || 'Personal Study Timetable',
        goal: plan?.settings?.goal || 'Goal not specified',
        createdAt: plan?.generatedAt || new Date().toISOString(),
        plan,
    });

    const persistSavedPlans = (updater) => {
        setSavedPlans((currentPlans) => {
            const nextPlans = typeof updater === 'function' ? updater(currentPlans) : updater;
            try {
                localStorage.setItem(TIMETABLE_HISTORY_STORAGE_KEY, JSON.stringify(nextPlans));
            } catch {
                // Ignore storage failures and keep data in-memory for the current session.
            }
            return nextPlans;
        });
    };

    const saveCurrentPlan = () => {
        if (!timetable) {
            toast.error('Generate a timetable before saving a plan.');
            return;
        }

        const newSavedPlan = buildSavedPlan(timetable);
        persistSavedPlans((currentPlans) => [newSavedPlan, ...currentPlans].slice(0, 30));
        toast.success('Plan saved. You can reopen it anytime from Saved Plans.');
    };

    const openSavedPlan = (savedPlan) => {
        if (!savedPlan?.plan) {
            return;
        }
        persistTimetable(savedPlan.plan);
        setError('');
        toast.success('Saved plan loaded.');
    };

    const removeSavedPlan = (planId) => {
        persistSavedPlans((currentPlans) => currentPlans.filter((plan) => plan.id !== planId));
        toast.success('Saved plan removed.');
    };

    const handleExportTimetable = () => {
        if (!timetable) {
            toast.error('Generate a timetable before exporting it.');
            return;
        }

        try {
            const doc = new jsPDF({ unit: 'pt', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 44;
            const contentWidth = pageWidth - margin * 2;
            const lineHeight = 16;
            let y = margin;

            const ensureSpace = (neededHeight = lineHeight) => {
                if (y + neededHeight > pageHeight - margin) {
                    doc.addPage();
                    y = margin;
                }
            };

            const writeLine = (text, options = {}) => {
                const { size = 11, bold = false, color = [17, 24, 39], indent = 0 } = options;
                doc.setFont('helvetica', bold ? 'bold' : 'normal');
                doc.setFontSize(size);
                doc.setTextColor(color[0], color[1], color[2]);
                const wrapped = doc.splitTextToSize(String(text || ''), contentWidth - indent);
                const textHeight = wrapped.length * lineHeight;
                ensureSpace(textHeight);
                doc.text(wrapped, margin + indent, y);
                y += textHeight;
            };

            const writeSpacer = (height = 10) => {
                ensureSpace(height);
                y += height;
            };

            const title = timetable.title || 'Personal Study Timetable';
            const timestamp = new Date().toLocaleString();

            writeLine(title, { size: 20, bold: true, color: [3, 105, 161] });
            writeLine(`Generated on: ${timestamp}`, { size: 10, color: [71, 85, 105] });
            writeSpacer(8);

            if (timetable.summary) {
                writeLine('Summary', { size: 13, bold: true });
                writeLine(timetable.summary);
                writeSpacer(8);
            }

            writeLine('Plan Settings', { size: 13, bold: true });
            writeLine(`Goal: ${timetable.settings?.goal || 'N/A'}`);
            writeLine(`Study hours/day: ${timetable.settings?.studyHoursPerDay ?? 'N/A'}`);
            writeLine(`Study days/week: ${timetable.settings?.studyDaysPerWeek ?? 'N/A'}`);
            writeLine(`Wake time: ${timetable.settings?.wakeTime || 'N/A'}`);
            writeLine(`Sleep time: ${timetable.settings?.sleepTime || 'N/A'}`);
            writeLine(`Focus block: ${timetable.settings?.focusBlockMinutes ?? 'N/A'} minutes`);
            writeLine(`Break: ${timetable.settings?.breakMinutes ?? 'N/A'} minutes`);
            writeLine(
                `Preferred subjects: ${(timetable.settings?.preferredSubjects || []).join(', ') || 'None specified'}`
            );
            writeSpacer(10);

            writeLine('Weekly Schedule', { size: 13, bold: true });
            (timetable.days || []).forEach((day) => {
                writeSpacer(4);
                writeLine(`${day.dayLabel || 'Day'}: ${day.topic || 'Study Session'}`, { size: 12, bold: true });
                writeLine(`Total study minutes: ${day.totalStudyMinutes ?? 0}`, { size: 10, color: [71, 85, 105] });
                (day.slots || []).forEach((slot) => {
                    writeLine(
                        `${slot.startTime || '--:--'} - ${slot.endTime || '--:--'} | ${slot.title || 'Session'} (${slot.kind || 'focus'})`,
                        { indent: 12 }
                    );
                    if (slot.description) {
                        writeLine(slot.description, { indent: 22, size: 10, color: [51, 65, 85] });
                    }
                });
                writeSpacer(6);
            });

            const tips = timetable.tips || [];
            if (tips.length) {
                writeLine('Practical Tips', { size: 13, bold: true });
                tips.forEach((tip, index) => {
                    writeLine(`${index + 1}. ${tip}`, { indent: 10 });
                });
            }

            const safeFileName = (timetable.title || 'timetable')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
            doc.save(`${safeFileName || 'timetable'}-plan.pdf`);
            toast.success('Timetable exported as PDF.');
        } catch {
            toast.error('Unable to export PDF right now. Please try again.');
        }
    };

    const subjectCount = useMemo(() => {
        return form.preferredSubjects
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean).length;
    }, [form.preferredSubjects]);

    const updateField = (field) => (event) => {
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const generateTimetable = async (event) => {
        event.preventDefault();
        const trimmedGoal = form.goal.trim();
        if (!trimmedGoal) {
            toast.error('Enter a learning goal first.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const response = await api.generateTimetable({
                goal: trimmedGoal,
                studyHoursPerDay: Number(form.studyHoursPerDay),
                studyDaysPerWeek: Number(form.studyDaysPerWeek),
                wakeTime: form.wakeTime,
                sleepTime: form.sleepTime,
                focusBlockMinutes: Number(form.focusBlockMinutes),
                breakMinutes: Number(form.breakMinutes),
                includeWeekends: form.includeWeekends,
                preferredSubjects: form.preferredSubjects,
            });

            persistTimetable(response);
            persistSavedPlans((currentPlans) => [buildSavedPlan(response), ...currentPlans].slice(0, 30));
            toast.success('Timetable generated successfully.');
        } catch (requestError) {
            const message = requestError.response?.data?.message || requestError.message || 'Failed to generate timetable.';
            setError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.15),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_38%,_#111827_100%)] text-white">
            <header className="shrink-0 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-2xl shadow-cyan-500/10">
                            <CalendarClock className="h-6 w-6 text-cyan-300" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Personal Learning</p>
                            <h1 className="text-xl font-semibold sm:text-2xl">Timetable Generator</h1>
                        </div>
                    </div>

                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/30 hover:bg-white/10"
                    >
                        <ChevronLeft size={16} />
                        Back to Main App
                    </Link>
                </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                <div className="mx-auto max-w-7xl px-4 py-6 pb-10 sm:px-6 lg:px-8 lg:py-8">
                    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
                        <motion.section
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6 lg:sticky lg:top-6 lg:self-start"
                        >
                            <div className="mb-5 flex items-center gap-3">
                                <div className="rounded-2xl bg-cyan-400/15 p-3 text-cyan-200 ring-1 ring-inset ring-cyan-300/20">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold">Plan Your Week</h2>
                                    <p className="text-sm text-slate-300">Tune the rhythm to match your goal and energy.</p>
                                </div>
                            </div>

                            <form onSubmit={generateTimetable} className="space-y-4">
                                <label className="block space-y-2">
                                    <span className="text-sm font-medium text-slate-200">Learning goal</span>
                                    <textarea
                                        value={form.goal}
                                        onChange={updateField('goal')}
                                        rows={4}
                                        placeholder="Example: Master Python for data science and prepare for weekly practice tests"
                                        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                                    />
                                </label>

                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block space-y-2">
                                        <span className="text-sm font-medium text-slate-200">Study hours / day</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="14"
                                            value={form.studyHoursPerDay}
                                            onChange={updateField('studyHoursPerDay')}
                                            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-sm font-medium text-slate-200">Study days / week</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="7"
                                            value={form.studyDaysPerWeek}
                                            onChange={updateField('studyDaysPerWeek')}
                                            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                                        />
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block space-y-2">
                                        <span className="text-sm font-medium text-slate-200">Wake time</span>
                                        <input
                                            type="time"
                                            value={form.wakeTime}
                                            onChange={updateField('wakeTime')}
                                            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-sm font-medium text-slate-200">Sleep time</span>
                                        <input
                                            type="time"
                                            value={form.sleepTime}
                                            onChange={updateField('sleepTime')}
                                            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                                        />
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block space-y-2">
                                        <span className="text-sm font-medium text-slate-200">Focus block</span>
                                        <input
                                            type="number"
                                            min="20"
                                            max="180"
                                            value={form.focusBlockMinutes}
                                            onChange={updateField('focusBlockMinutes')}
                                            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-sm font-medium text-slate-200">Break minutes</span>
                                        <input
                                            type="number"
                                            min="5"
                                            max="60"
                                            value={form.breakMinutes}
                                            onChange={updateField('breakMinutes')}
                                            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                                        />
                                    </label>
                                </div>

                                <label className="block space-y-2">
                                    <span className="text-sm font-medium text-slate-200">Preferred subjects or topics</span>
                                    <input
                                        type="text"
                                        value={form.preferredSubjects}
                                        onChange={updateField('preferredSubjects')}
                                        placeholder="Example: Python, Statistics, Machine Learning"
                                        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                                    />
                                </label>

                                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                                    <input
                                        type="checkbox"
                                        checked={form.includeWeekends}
                                        onChange={updateField('includeWeekends')}
                                        className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-400/30"
                                    />
                                    <span className="text-sm text-slate-200">
                                        Include weekends in the timetable.
                                        <span className="mt-1 block text-xs text-slate-400">
                                            This can stretch the plan to a full week when you need extra practice time.
                                        </span>
                                    </span>
                                </label>

                                <div className="pt-1">
                                    <Button
                                        type="submit"
                                        isLoading={isLoading}
                                        fullWidth
                                        className="rounded-2xl py-3"
                                        leftIcon={<CalendarDays size={18} />}
                                        rightIcon={<ArrowRight size={18} />}
                                    >
                                        Generate Timetable
                                    </Button>
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={saveCurrentPlan}
                                    className="w-full rounded-2xl py-3"
                                >
                                    Save Current Plan
                                </Button>

                                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
                                    <span>Subjects tracked</span>
                                    <span className="font-semibold text-white">{subjectCount}</span>
                                </div>

                                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                    <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Saved Plans</div>
                                    {savedPlans.length === 0 ? (
                                        <p className="text-xs text-slate-400">No saved plans yet. Generate or save one to see it here.</p>
                                    ) : (
                                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                                            {savedPlans.map((planItem) => (
                                                <div
                                                    key={planItem.id}
                                                    className="rounded-xl border border-white/10 bg-slate-950/50 p-2"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => openSavedPlan(planItem)}
                                                        className="w-full text-left"
                                                    >
                                                        <div className="text-sm font-semibold text-white line-clamp-1">{planItem.title}</div>
                                                        <div className="mt-1 text-xs text-slate-400 line-clamp-2">{planItem.goal}</div>
                                                        <div className="mt-1 text-[11px] text-slate-500">
                                                            {new Date(planItem.createdAt).toLocaleString()}
                                                        </div>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSavedPlan(planItem.id)}
                                                        className="mt-2 rounded-lg border border-rose-400/30 px-2 py-1 text-[11px] text-rose-200 transition hover:bg-rose-500/20"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </form>
                        </motion.section>

                        <section className="space-y-5">
                            <AnimatePresence mode="wait">
                                {isLoading && (
                                    <motion.div
                                        key="timetable-loading"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-center shadow-2xl shadow-black/20 backdrop-blur-xl"
                                    >
                                        <Loader2 className="mx-auto h-10 w-10 animate-spin text-cyan-300" />
                                        <h3 className="mt-4 text-xl font-semibold">Generating your timetable</h3>
                                        <p className="mt-2 text-sm text-slate-300">Balancing study blocks, breaks, and your available hours.</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {!isLoading && error && (
                                <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-6 text-rose-100 shadow-xl shadow-rose-950/20">
                                    <p className="font-semibold">{error}</p>
                                </div>
                            )}

                            {!isLoading && timetable && (
                                <motion.div
                                    initial={{ opacity: 0, y: 18 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-5"
                                >
                                    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">Generated Plan</p>
                                                <h2 className="mt-2 text-2xl font-semibold">{timetable.title}</h2>
                                                <p className="mt-2 max-w-2xl text-sm text-slate-300">{timetable.summary}</p>
                                            </div>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleExportTimetable}
                                                leftIcon={<Download size={16} />}
                                            >
                                                Export PDF
                                            </Button>
                                        </div>

                                        <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                                <div className="flex items-center gap-2 text-xs text-slate-400"><Target size={14} /> Goal</div>
                                                <div className="mt-1 text-sm font-semibold">{timetable.settings.goal}</div>
                                            </div>
                                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                                <div className="flex items-center gap-2 text-xs text-slate-400"><Clock3 size={14} /> Study / day</div>
                                                <div className="mt-1 text-sm font-semibold">{timetable.settings.studyHoursPerDay} hours</div>
                                            </div>
                                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                                <div className="flex items-center gap-2 text-xs text-slate-400"><TimerReset size={14} /> Focus block</div>
                                                <div className="mt-1 text-sm font-semibold">{timetable.settings.focusBlockMinutes} minutes</div>
                                            </div>
                                        </div>

                                        <div className="mt-6 grid gap-3 md:grid-cols-3">
                                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Days</div>
                                                <div className="mt-2 text-2xl font-semibold">{timetable.settings.studyDaysPerWeek}</div>
                                            </div>
                                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Total study minutes</div>
                                                <div className="mt-2 text-2xl font-semibold">{timetable.metrics.totalStudyMinutes}</div>
                                            </div>
                                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Slots created</div>
                                                <div className="mt-2 text-2xl font-semibold">{timetable.metrics.totalSlots}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid gap-4">
                                        {timetable.days.map((day) => (
                                            <motion.article
                                                key={day.dayLabel}
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20 backdrop-blur-xl"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                                                    <div>
                                                        <div className="flex items-center gap-2 text-cyan-200">
                                                            <BookOpen size={16} />
                                                            <span className="text-sm uppercase tracking-[0.22em]">{day.dayLabel}</span>
                                                        </div>
                                                        <h3 className="mt-2 text-xl font-semibold">{day.topic}</h3>
                                                    </div>
                                                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                                                        <span className="font-semibold text-white">{day.totalStudyMinutes}</span> minutes planned
                                                    </div>
                                                </div>

                                                <div className="mt-4 space-y-3">
                                                    {day.slots.map((slot) => (
                                                        <div
                                                            key={`${day.dayLabel}-${slot.startTime}-${slot.endTime}-${slot.title}`}
                                                            className={`rounded-2xl border px-4 py-3 ${dayToneStyles[slot.kind] || 'bg-white/5 text-white border-white/10'}`}
                                                        >
                                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                                <div>
                                                                    <div className="text-xs uppercase tracking-[0.22em] opacity-80">{slot.kind}</div>
                                                                    <div className="mt-1 text-base font-semibold">{slot.title}</div>
                                                                    <p className="mt-1 text-sm opacity-90">{slot.description}</p>
                                                                </div>
                                                                <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/90">
                                                                    {slot.startTime} - {slot.endTime}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.article>
                                        ))}
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20 backdrop-blur-xl">
                                            <div className="flex items-center gap-2 text-cyan-200">
                                                <BrainCircuit size={16} />
                                                <h3 className="text-lg font-semibold">Practical Tips</h3>
                                            </div>
                                            <ul className="mt-4 space-y-3 text-sm text-slate-300">
                                                {timetable.tips.map((tip) => (
                                                    <li key={tip} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">{tip}</li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20 backdrop-blur-xl">
                                            <div className="flex items-center gap-2 text-cyan-200">
                                                <CalendarDays size={16} />
                                                <h3 className="text-lg font-semibold">Settings Snapshot</h3>
                                            </div>
                                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                                    <div className="text-xs text-slate-400">Wake</div>
                                                    <div className="mt-1 font-semibold">{timetable.settings.wakeTime}</div>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                                    <div className="text-xs text-slate-400">Sleep</div>
                                                    <div className="mt-1 font-semibold">{timetable.settings.sleepTime}</div>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                                    <div className="text-xs text-slate-400">Break length</div>
                                                    <div className="mt-1 font-semibold">{timetable.settings.breakMinutes} minutes</div>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                                    <div className="text-xs text-slate-400">Subjects</div>
                                                    <div className="mt-1 font-semibold">{timetable.settings.preferredSubjects.length || 0}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {!isLoading && !timetable && !error && (
                                <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/45 p-8 text-center shadow-xl shadow-black/20 backdrop-blur-xl">
                                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
                                        <CalendarDays size={28} />
                                    </div>
                                    <h2 className="mt-4 text-xl font-semibold">Generate a timetable to begin</h2>
                                    <p className="mt-2 text-sm text-slate-300">
                                        The builder sits on the right side of the app as well, above document analysis and below the live concept map.
                                    </p>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default TimetablePage;
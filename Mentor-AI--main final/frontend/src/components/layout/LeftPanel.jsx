// frontend/src/components/layout/LeftPanel.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAppState } from '../../contexts/AppStateContext.jsx';
import DocumentUpload from '../documents/DocumentUpload.jsx';
import KnowledgeSourceList from '../documents/KnowledgeSourceList.jsx';
import SubjectList from '../documents/SubjectList.jsx';
import {
    PanelLeftClose, ChevronDown, ChevronUp, FilePlus, Settings2,
    Bot, BookOpen, Lightbulb, Library, Timer, Flame, Clock3, HeartPulse, Award, StickyNote, Users, Sparkles
} from 'lucide-react';
import IconButton from '../core/IconButton.jsx';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:2000/api';

const PROMPT_PRESETS = [
     { id: 'friendly_tutor', name: 'Friendly Tutor', icon: Bot, text: "You are a friendly, patient, and encouraging tutor specializing in engineering and scientific topics for PhD students. Explain concepts clearly, break down complex ideas, use analogies, and offer positive reinforcement. Ask follow-up questions to ensure understanding." },
     { id: 'concept_explorer', name: 'Concept Explorer', icon: BookOpen, text: "You are an expert academic lecturer introducing a new, complex engineering or scientific concept. Your goal is to provide a deep, structured explanation. Define terms rigorously, outline the theory, provide relevant mathematical formulations (using Markdown), illustrative examples, and discuss applications or limitations pertinent to PhD-level research." },
     { id: 'knowledge_check', name: 'Knowledge Check', icon: Lightbulb, text: "You are assessing understanding of engineering/scientific topics. Ask targeted questions to test knowledge, identify misconceptions, and provide feedback on the answers. Start by asking the user what topic they want to be quizzed on." },
     { id: 'custom', name: 'Custom Prompt', icon: Settings2, text: "You are a helpful AI engineering tutor." }
];

function LeftPanel({ isChatProcessing }) {
    const {
        setIsLeftPanelOpen,
        systemPrompt, setSystemPrompt,
        selectDocumentForAnalysis, selectedDocumentForAnalysis,
        selectedSubject, setSelectedSubject
    } = useAppState();

    const [isPromptSectionOpen, setIsPromptSectionOpen] = useState(false);
    const [isSubjectSectionOpen, setIsSubjectSectionOpen] = useState(false);
    const [isKnowledgeBaseOpen, setIsKnowledgeBaseOpen] = useState(false);

    const [selectedPresetId, setSelectedPresetId] = useState('custom');
    const [availableSubjects, setAvailableSubjects] = useState([]);
    const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
    const [subjectFetchError, setSubjectFetchError] = useState('');
    const [refreshKey, setRefreshKey] = useState(Date.now());
    const [focusStats, setFocusStats] = useState({
        todaySessionsCount: 0,
        currentStreak: 0,
        totalFocusMinutesThisWeek: 0,
    });
    const [wellnessStats, setWellnessStats] = useState({
        wellnessXpToday: 0,
        totalXpFromWellness: 0,
        activitiesCompletedToday: 0,
        totalActivitiesCompleted: 0,
        dailyGoal: 3,
        dailyGoalProgress: 0,
        weeklyStreakDays: 0,
    });

    useEffect(() => {
        const matchedPreset = PROMPT_PRESETS.find(p => p.text === systemPrompt);
        setSelectedPresetId(matchedPreset ? matchedPreset.id : 'custom');
    }, [systemPrompt]);

    const fetchSubjects = useCallback(async () => {
        setIsLoadingSubjects(true);
        setSubjectFetchError('');
        try {
            const response = await api.getSubjects();
            const subjects = Array.isArray(response.subjects) ? response.subjects : [];
            setAvailableSubjects(subjects);
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message || "Failed to load subjects.";
            toast.error(errorMsg);
            setSubjectFetchError(errorMsg);
        } finally {
            setIsLoadingSubjects(false);
        }
    }, []);

    useEffect(() => {
        fetchSubjects();
    }, [fetchSubjects]);

    const fetchFocusStats = useCallback(async () => {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await axios.get(`${API_BASE}/focus/streak`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = response.data || {};
            setFocusStats({
                todaySessionsCount: data.todaySessionsCount || 0,
                currentStreak: data.currentStreak || 0,
                totalFocusMinutesThisWeek: data.totalFocusMinutesThisWeek || 0,
            });
        } catch (error) {
            // Keep this silent to avoid noisy toasts in the main tutoring interface.
        }
    }, []);

    const fetchWellnessStats = useCallback(async () => {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const headers = { headers: { Authorization: `Bearer ${token}` } };
            const [statsResult, todayResult] = await Promise.allSettled([
                axios.get(`${API_BASE}/wellness/stats`, headers),
                axios.get(`${API_BASE}/wellness/today`, headers),
            ]);

            const statsData = statsResult.status === 'fulfilled' ? (statsResult.value.data || {}) : {};
            const todayData = todayResult.status === 'fulfilled' ? (todayResult.value.data || {}) : {};

            const todayCount = Number.isFinite(todayData.count)
                ? todayData.count
                : Array.isArray(todayData.activities)
                    ? todayData.activities.length
                    : 0;
            const lifetimeXpFromTodayEndpoint = Number.isFinite(todayData.totalXpFromWellness)
                ? todayData.totalXpFromWellness
                : 0;
            const lifetimeCountFromTodayEndpoint = Number.isFinite(todayData.totalActivitiesCompleted)
                ? todayData.totalActivitiesCompleted
                : 0;

            const todayXp = Number.isFinite(statsData.wellnessXpToday)
                ? statsData.wellnessXpToday
                : Number.isFinite(todayData.totalXpToday)
                    ? todayData.totalXpToday
                    : 0;

            setWellnessStats((prev) => ({
                wellnessXpToday: todayXp,
                totalXpFromWellness: Number.isFinite(statsData.totalXpFromWellness)
                    ? statsData.totalXpFromWellness
                    : (lifetimeXpFromTodayEndpoint || prev.totalXpFromWellness),
                activitiesCompletedToday: Number.isFinite(statsData.activitiesCompletedToday) ? statsData.activitiesCompletedToday : todayCount,
                totalActivitiesCompleted: Number.isFinite(statsData.totalActivitiesCompleted)
                    ? statsData.totalActivitiesCompleted
                    : (lifetimeCountFromTodayEndpoint || prev.totalActivitiesCompleted),
                dailyGoal: Number.isFinite(statsData.dailyGoal) ? statsData.dailyGoal : (prev.dailyGoal || 3),
                dailyGoalProgress: Number.isFinite(statsData.dailyGoalProgress)
                    ? statsData.dailyGoalProgress
                    : Math.min(Number.isFinite(statsData.dailyGoal) ? statsData.dailyGoal : (prev.dailyGoal || 3), todayCount),
                weeklyStreakDays: Number.isFinite(statsData.weeklyStreakDays) ? statsData.weeklyStreakDays : (prev.weeklyStreakDays || 0),
            }));
        } catch (error) {
            // Keep this silent to avoid noisy toasts in the main tutoring interface.
        }
    }, []);

    useEffect(() => {
        fetchFocusStats();
        fetchWellnessStats();

        const interval = setInterval(() => {
            fetchFocusStats();
            fetchWellnessStats();
        }, 30000);

        const handleVisibilityOrFocus = () => {
            fetchFocusStats();
            fetchWellnessStats();
        };

        const handleFocusUpdate = () => {
            fetchFocusStats();
        };

        const handleWellnessUpdate = () => {
            fetchWellnessStats();
        };

        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        window.addEventListener('focus-session-updated', handleFocusUpdate);
        window.addEventListener('wellness-stats-updated', handleWellnessUpdate);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleVisibilityOrFocus);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('focus-session-updated', handleFocusUpdate);
            window.removeEventListener('wellness-stats-updated', handleWellnessUpdate);
        };
    }, [fetchFocusStats, fetchWellnessStats]);

    const weeklyHours = (focusStats.totalFocusMinutesThisWeek / 60).toFixed(1);

    const handlePresetChange = (event) => {
        const presetId = event.target.value;
        setSelectedPresetId(presetId);
        const selectedPreset = PROMPT_PRESETS.find(p => p.id === presetId);
        if (selectedPreset) setSystemPrompt(selectedPreset.text);
    };

    const handleSourceAdded = () => {
        toast.success("New source added! Refreshing list...", { id: 'refresh-toast' });
        setRefreshKey(Date.now());
    };

    const togglePromptSection = () => {
        const nextState = !isPromptSectionOpen;
        setIsPromptSectionOpen(nextState);
        if (nextState) {
            setIsSubjectSectionOpen(false);
            setIsKnowledgeBaseOpen(false);
        }
    };

    const toggleSubjectSection = () => {
        const nextState = !isSubjectSectionOpen;
        setIsSubjectSectionOpen(nextState);
        if (nextState) {
            setIsPromptSectionOpen(false);
            setIsKnowledgeBaseOpen(false);
        }
    };

    const toggleKnowledgeBaseSection = () => {
        const nextState = !isKnowledgeBaseOpen;
        setIsKnowledgeBaseOpen(nextState);
        if (nextState) {
            setIsPromptSectionOpen(false);
            setIsSubjectSectionOpen(false);
        }
    };
    
    const sectionVariants = {
        open: {
            height: 'auto',
            opacity: 1,
            transition: { type: 'spring', stiffness: 400, damping: 40 }
        },
        closed: {
            height: 0,
            opacity: 0,
            transition: { type: 'spring', stiffness: 400, damping: 40 }
        }
    };

    const SelectedPresetIcon = PROMPT_PRESETS.find(p => p.id === selectedPresetId)?.icon || Settings2;

    return (
        <div className={`flex flex-col min-h-full ${isChatProcessing ? 'processing-overlay' : ''}`}>
            <div className="flex items-center justify-between mb-3 px-1 pt-1">
                <h2 className="text-sm font-semibold text-text-light dark:text-text-dark">Assistant Controls</h2>
                <IconButton
                    icon={PanelLeftClose}
                    onClick={() => setIsLeftPanelOpen(false)}
                    title="Close Assistant Panel"
                    variant="ghost" size="sm"
                    className="text-text-muted-light dark:text-text-muted-dark hover:text-primary"
                />
            </div>

            <div className="mb-4 rounded-lg border border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-text-muted-light dark:text-text-muted-dark">Focus Mode</p>
                    <Link
                        to="/focus"
                        className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-dark transition-colors"
                    >
                        Open
                    </Link>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-md bg-white dark:bg-gray-900 border border-border-light dark:border-border-dark p-2">
                        <p className="flex items-center gap-1 text-text-muted-light dark:text-text-muted-dark"><Timer size={12} /> Today</p>
                        <p className="mt-1 text-sm font-bold text-text-light dark:text-text-dark">{focusStats.todaySessionsCount}</p>
                    </div>
                    <div className="rounded-md bg-white dark:bg-gray-900 border border-border-light dark:border-border-dark p-2">
                        <p className="flex items-center gap-1 text-text-muted-light dark:text-text-muted-dark"><Flame size={12} /> Streak</p>
                        <p className="mt-1 text-sm font-bold text-text-light dark:text-text-dark">{focusStats.currentStreak}d</p>
                    </div>
                    <div className="rounded-md bg-white dark:bg-gray-900 border border-border-light dark:border-border-dark p-2">
                        <p className="flex items-center gap-1 text-text-muted-light dark:text-text-muted-dark"><Clock3 size={12} /> Week</p>
                        <p className="mt-1 text-sm font-bold text-text-light dark:text-text-dark">{weeklyHours}h</p>
                    </div>
                </div>
            </div>

            <div className="mb-4 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-950/30 dark:to-cyan-950/20 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        <HeartPulse size={12} /> Wellness
                    </p>
                    <Link
                        to="/challenges"
                        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                    >
                        Open Challenges
                    </Link>
                </div>
                <p className="mt-2 text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
                    Quick habits for energy, focus, and consistency.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-md bg-white/80 dark:bg-gray-900/80 border border-emerald-200/70 dark:border-emerald-900 p-2">
                        <p className="text-emerald-700 dark:text-emerald-300">XP Today</p>
                        <p className="mt-1 text-sm font-bold text-text-light dark:text-text-dark">{wellnessStats.wellnessXpToday}</p>
                    </div>
                    <div className="rounded-md bg-white/80 dark:bg-gray-900/80 border border-emerald-200/70 dark:border-emerald-900 p-2">
                        <p className="text-emerald-700 dark:text-emerald-300">Done Today</p>
                        <p className="mt-1 text-sm font-bold text-text-light dark:text-text-dark">{wellnessStats.activitiesCompletedToday}</p>
                    </div>
                    <div className="rounded-md bg-white/80 dark:bg-gray-900/80 border border-emerald-200/70 dark:border-emerald-900 p-2">
                        <p className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><Award size={11} /> Total XP</p>
                        <p className="mt-1 text-sm font-bold text-text-light dark:text-text-dark">{wellnessStats.totalXpFromWellness}</p>
                    </div>
                    <div className="rounded-md bg-white/80 dark:bg-gray-900/80 border border-emerald-200/70 dark:border-emerald-900 p-2">
                        <p className="text-emerald-700 dark:text-emerald-300">All Activities</p>
                        <p className="mt-1 text-sm font-bold text-text-light dark:text-text-dark">{wellnessStats.totalActivitiesCompleted}</p>
                    </div>
                </div>
                <p className="mt-2 text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
                    Streak: {wellnessStats.weeklyStreakDays}d · Goal: {wellnessStats.dailyGoalProgress}/{wellnessStats.dailyGoal}
                </p>
            </div>

            <div className="mb-4 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50 to-sky-50 dark:from-indigo-950/30 dark:to-sky-950/20 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                        <StickyNote size={12} /> Smart Notepad
                    </p>
                    <Link
                        to="/notepad"
                        className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                    >
                        Open
                    </Link>
                </div>
                <p className="mt-2 text-[11px] text-indigo-900/80 dark:text-indigo-200/80">
                    Rich notes plus calendar tasks in one focused workspace.
                </p>
            </div>

            <div className="mb-4 rounded-lg border border-cyan-200 dark:border-cyan-900 bg-gradient-to-br from-cyan-50 to-slate-50 dark:from-cyan-950/30 dark:to-slate-950/20 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
                        <Sparkles size={12} /> AI Summarizer
                    </p>
                    <Link
                        to="/summarizer"
                        className="rounded-md bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-cyan-700 transition-colors"
                    >
                        Open
                    </Link>
                </div>
                <p className="mt-2 text-[11px] text-cyan-900/80 dark:text-cyan-200/80">
                    Paste text, upload a file, or summarize a URL in multiple formats.
                </p>
            </div>

            <div className="mb-4 rounded-lg border border-cyan-200 dark:border-cyan-900 bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/20 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
                        <BookOpen size={12} /> Interview & Exam Prep
                    </p>
                    <Link
                        to="/prep-mode"
                        className="rounded-md bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-cyan-700 transition-colors"
                    >
                        Open
                    </Link>
                </div>
                <p className="mt-2 text-[11px] text-cyan-900/80 dark:text-cyan-200/80">
                    Generate practice questions, evaluate answers, and track prep history.
                </p>
            </div>

            <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                        <Lightbulb size={12} /> Smart Doubt Resolver
                    </p>
                    <Link
                        to="/doubt-resolver"
                        className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                    >
                        Open
                    </Link>
                </div>
                <p className="mt-2 text-[11px] text-amber-900/80 dark:text-amber-200/80">
                    Get root-cause guidance, 5-step hints, analogy, and save doubts for revision.
                </p>
            </div>

            {/* Custom Prompt Section */}
            <div className="mb-4">
                <button onClick={togglePromptSection} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left text-text-light dark:text-text-dark bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md focus:outline-none shadow-sm border border-border-light dark:border-border-dark" aria-expanded={isPromptSectionOpen}>
                    <span className="flex items-center gap-2"><SelectedPresetIcon size={16} className="text-primary dark:text-primary-light" /> Custom Prompt</span>
                    {isPromptSectionOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <AnimatePresence initial={false}>
                    {isPromptSectionOpen && (
                        <motion.div 
                            key="prompt-section-content" 
                            variants={sectionVariants}
                            initial="closed"
                            animate="open"
                            exit="closed"
                            className="mt-2 p-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-md shadow-inner overflow-hidden">
                             <label htmlFor="prompt-preset-select" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark mb-1">Prompt Mode:</label>
                             <select id="prompt-preset-select" value={selectedPresetId} onChange={handlePresetChange} className="input-field mb-2 text-xs py-1.5">
                                 {PROMPT_PRESETS.map(preset => (<option key={preset.id} value={preset.id}>{preset.name}</option>))}
                             </select>
                             <label htmlFor="system-prompt-area" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark mb-1">System Prompt (Editable):</label>
                             <textarea id="system-prompt-area" value={systemPrompt} onChange={(e) => { setSystemPrompt(e.target.value); setSelectedPresetId('custom'); }} rows="5" className="input-field text-xs custom-scrollbar" placeholder="Enter system prompt..."/>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Admin Subjects Section */}
            <div className="mb-4">
                <button onClick={toggleSubjectSection} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left text-text-light dark:text-text-dark bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md focus:outline-none shadow-sm border border-border-light dark:border-border-dark" aria-expanded={isSubjectSectionOpen}>
                    <span className="flex items-center gap-2"><Library size={16} className="text-primary dark:text-primary-light" /> Admin Subjects</span>
                    {isSubjectSectionOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <AnimatePresence initial={false}>
                    {isSubjectSectionOpen && (
                        <motion.div 
                            key="subject-select-content" 
                            variants={sectionVariants}
                            initial="closed"
                            animate="open"
                            exit="closed"
                            className="mt-2 p-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-md shadow-inner overflow-hidden">
                           <SubjectList
                                subjects={availableSubjects}
                                selectedSubject={selectedSubject}
                                onSelectSubject={setSelectedSubject}
                                isLoading={isLoadingSubjects}
                                error={subjectFetchError}
                           />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* User's Knowledge Base Section */}
            <div className="mb-2">
                <button onClick={toggleKnowledgeBaseSection} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left text-text-light dark:text-text-dark bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md focus:outline-none shadow-sm border border-border-light dark:border-border-dark mb-2" aria-expanded={isKnowledgeBaseOpen}>
                    <span className="flex items-center gap-2"><FilePlus size={16} className="text-primary dark:text-primary-light" /> My Knowledge Base</span>
                    {isKnowledgeBaseOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <AnimatePresence initial={false}>
                    {isKnowledgeBaseOpen && (
                        <motion.div 
                            key="knowledge-base-content" 
                            variants={sectionVariants}
                            initial="closed"
                            animate="open"
                            exit="closed"
                            className="p-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-md shadow-inner">
                            <DocumentUpload onSourceAdded={handleSourceAdded}  />
                            <div className="mt-3 max-h-72 overflow-y-auto custom-scrollbar">
                                <KnowledgeSourceList
                                    key={refreshKey}
                                    onSelectSource={selectDocumentForAnalysis}
                                    selectedSource={selectedDocumentForAnalysis}
                                    onRefreshNeeded={refreshKey}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
export default LeftPanel;
// frontend/src/App.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth as useRegularAuth } from './hooks/useAuth.jsx';
import { useAppState } from './contexts/AppStateContext.jsx';
import AuthModal from './components/auth/AuthModal.jsx';
import TopNav from './components/layout/TopNav.jsx';
import LeftPanel from './components/layout/LeftPanel.jsx';
import CenterPanel from './components/layout/CenterPanel.jsx';
import RightPanel from './components/layout/RightPanel.jsx';
import LeftCollapsedNav from './components/layout/LeftCollapsedNav.jsx';
import RightCollapsedNav from './components/layout/RightCollapsedNav.jsx';
import ChatHistoryModal from './components/chat/ChatHistoryModal.jsx';
import AdminDashboardPage from './components/admin/AdminDashboardPage.jsx';
import AdminProtectedRoute from './components/admin/AdminProtectedRoute.jsx';
import CodeExecutorPage from './components/tools/CodeExecutorPage.jsx';
import StudyPlanPage from './components/learning/StudyPlanPage.jsx';
import QuizGeneratorPage from './components/tools/QuizGeneratorPage.jsx';
import api from './services/api.js';
import axios from 'axios';
import toast from 'react-hot-toast';
import { GraduationCap, Timer, Flame, Pause, Play, Square, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from './components/core/Button.jsx';
import AcademicIntegrityPage from './components/tools/AcademicIntegrityPage.jsx';
import LandingPage from './components/landing/LandingPage.jsx';
import OnboardingFlow from './components/onboarding/OnboardingFlow.jsx';
import AnalyticsDashboardPage from './components/admin/AnalyticsDashboardPage.jsx';
// Gamification Components
import BountyCreditsPage from './components/gamification/BountyCreditsPage.jsx';
import BossBattles from './components/gamification/BossBattles.jsx';
import BadgesShowcase from './components/gamification/BadgesShowcase.jsx';
import LearningProfile from './components/learning/LearningProfile.jsx';
import SkillTreeMap from './components/gamification/SkillTreeMap.jsx';
import SkillTreeLanding from './components/gamification/SkillTreeLanding.jsx';
import SkillTreeGameMap from './components/gamification/SkillTreeGameMap.jsx';
import SkillTreeGames from './components/gamification/SkillTreeGames.jsx';
import { useBadgeSocket } from './hooks/useBadgeSocket.js';
import BadgeTotem from './components/gamification/BadgeTotem.jsx';
import SkillTreePage from './pages/SkillTreePage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import ChallengesPage from './pages/ChallengesPage.jsx';
import FocusTrackerPage from './pages/FocusTrackerPage.jsx';
import NotepadPage from './pages/NotepadPage.jsx';
import TimetablePage from './pages/TimetablePage.jsx';
import PrepModePage from './pages/PrepModePage.jsx';
import DoubtResolverPage from './pages/DoubtResolverPage.jsx';
import SummarizerPage from './pages/SummarizerPage.jsx';

const focusApi = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:2000/api',
});

function getFocusAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
}



function SessionLoadingModal() {
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]">
            <motion.div
                key="session-loading-modal"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl p-8 w-full max-w-md text-center"
            >
                <div className="flex justify-center items-center mb-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-b-4 border-primary"></div>
                </div>
                <h2 className="text-xl font-bold text-text-light dark:text-text-dark mb-2">Finalizing Session...</h2>
                <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
                    Summarizing key points and identifying topics for your future recommendations.
                </p>
            </motion.div>
        </div>
    );
}

function FocusDock() {
    const location = useLocation();
    const [activeSession, setActiveSession] = useState(null);
    const [displaySeconds, setDisplaySeconds] = useState(0);
    const [loading, setLoading] = useState(false);
    const completingRef = useRef(false);

    const remainingSeconds = displaySeconds;
    const plannedMinutes = activeSession?.plannedMinutes ?? 25;
    const isPaused = activeSession?.status === 'paused';

    const formatSeconds = (totalSeconds) => {
        const safeSeconds = Math.max(0, totalSeconds);
        const minutes = Math.floor(safeSeconds / 60);
        const seconds = safeSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const refreshSummary = useCallback(async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            setActiveSession(null);
            setDisplaySeconds(0);
            return;
        }

        try {
            const response = await focusApi.get('/focus/summary', { headers: getFocusAuthHeaders() });
            const active = response.data?.activeSession || null;
            setActiveSession(active);
            setDisplaySeconds(Math.max(0, active?.remainingSeconds ?? 0));
        } catch {
            setActiveSession(null);
            setDisplaySeconds(0);
        }
    }, []);

    useEffect(() => {
        refreshSummary();
        const interval = setInterval(refreshSummary, 30000);
        return () => clearInterval(interval);
    }, [refreshSummary]);

    useEffect(() => {
        if (!activeSession || isPaused) return;

        const interval = setInterval(() => {
            setDisplaySeconds((prev) => Math.max(0, prev - 1));
        }, 1000);

        return () => clearInterval(interval);
    }, [activeSession, isPaused]);

    useEffect(() => {
        if (remainingSeconds === 0 && activeSession && !isPaused) {
            refreshSummary();
        }
    }, [remainingSeconds, activeSession, isPaused, refreshSummary]);

    const pauseResume = async () => {
        if (!activeSession) return;
        setLoading(true);
        try {
            const endpoint = isPaused ? '/focus/resume' : '/focus/pause';
            await focusApi.post(endpoint, {}, { headers: getFocusAuthHeaders() });
            await refreshSummary();
            window.dispatchEvent(new CustomEvent('focus-session-updated'));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not update focus session.');
        } finally {
            setLoading(false);
        }
    };

    const cancel = async () => {
        if (!activeSession) return;
        setLoading(true);
        try {
            await focusApi.post('/focus/cancel', {}, { headers: getFocusAuthHeaders() });
            setActiveSession(null);
            setDisplaySeconds(0);
            toast.success('Focus session canceled.');
            window.dispatchEvent(new CustomEvent('focus-session-updated'));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not cancel focus session.');
        } finally {
            setLoading(false);
        }
    };

    const completeFromDock = useCallback(async () => {
        if (!activeSession || completingRef.current) return;

        completingRef.current = true;
        setLoading(true);
        try {
            const response = await focusApi.post(
                '/focus/complete',
                { completionToken: activeSession.sessionToken || null },
                { headers: getFocusAuthHeaders() }
            );

            const xpAwarded = response.data?.xpAwarded || 0;
            toast.success(`Focus session complete! +${xpAwarded} XP`);
            setActiveSession(null);
            setDisplaySeconds(0);
            window.dispatchEvent(new CustomEvent('focus-session-updated'));
        } catch (error) {
            if (error.response?.status === 409) {
                setActiveSession(null);
                setDisplaySeconds(0);
                window.dispatchEvent(new CustomEvent('focus-session-updated'));
            } else {
                toast.error(error.response?.data?.message || 'Could not finalize focus session.');
                await refreshSummary();
            }
        } finally {
            setLoading(false);
            completingRef.current = false;
        }
    }, [activeSession, refreshSummary]);

    useEffect(() => {
        if (activeSession && !isPaused && remainingSeconds === 0) {
            completeFromDock();
        }
    }, [activeSession, isPaused, remainingSeconds, completeFromDock]);

    if (!activeSession || location.pathname === '/focus') return null;

    return (
        <div className="fixed bottom-4 right-4 z-[70] w-[320px] max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-700/80 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">Focus Mode</p>
                    <p className="text-sm text-slate-300">Keep working, timer stays visible.</p>
                </div>
                <Link to="/focus" className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800">
                    Open <ExternalLink size={12} />
                </Link>
            </div>

            <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-center">
                <div className="mb-1 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                    <Timer size={14} /> Time Left
                </div>
                <div className="text-4xl font-black tracking-tight text-white">{formatSeconds(remainingSeconds)}</div>
                <div className="mt-1 text-xs text-slate-400">Planned {plannedMinutes} minutes</div>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2">
                    <div className="flex items-center gap-1 text-slate-400"><Flame size={12} /> Streak</div>
                    <div className="mt-1 text-lg font-bold">{isPaused ? 'Paused' : 'Active'}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2">
                    <div className="flex items-center gap-1 text-slate-400"><Timer size={12} /> Status</div>
                    <div className="mt-1 text-lg font-bold">{isPaused ? 'Hold' : 'Go'}</div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={pauseResume}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-900 transition hover:bg-white disabled:opacity-60"
                >
                    {isPaused ? <Play size={14} /> : <Pause size={14} />}
                    {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                    type="button"
                    onClick={cancel}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-rose-600 disabled:opacity-60"
                >
                    <Square size={14} /> Cancel
                </button>
            </div>
        </div>
    );
}

function MainAppLayout({
    orchestratorStatus,
    handleNewChat,
    isSessionLoading,
    messages,
    setMessages
}) {
    const location = useLocation();
    const { token: regularUserToken, user: regularUser, logout: regularUserLogout } = useRegularAuth();
    const {
        currentSessionId,
        selectedSubject,
        isLeftPanelOpen,
        isRightPanelOpen,
        setSessionId: setGlobalSessionId,
        initialPromptForNewSession,
        setInitialPromptForNewSession,
        initialActivityForNewSession,
        setInitialActivityForNewSession
    } = useAppState();
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isChatProcessing, setIsChatProcessing] = useState(false);
    const handleChatProcessingStatusChange = (isLoading) => {
        setIsChatProcessing(isLoading);
    };

    const handleRegularUserLogout = () => {
        regularUserLogout();
        setGlobalSessionId(null);
    };

    const handleSelectSessionFromHistory = (sessionId) => {
        if (sessionId && sessionId !== currentSessionId) {
            setGlobalSessionId(sessionId);
            toast.success(`Loading session...`);
        }
        setIsHistoryModalOpen(false);
    };

    if (location.pathname.startsWith('/summarizer')) {
        return <SummarizerPage />;
    }

    return (
        <>
            <AnimatePresence>
                {isSessionLoading && <SessionLoadingModal />}
            </AnimatePresence>

            <TopNav
                user={regularUser}
                onLogout={handleRegularUserLogout}
                onNewChat={handleNewChat}
                onHistoryClick={() => setIsHistoryModalOpen(true)}
                orchestratorStatus={orchestratorStatus}
                isChatProcessing={isChatProcessing}
            />
            <div className="flex flex-1 overflow-hidden pt-16 bg-background-light dark:bg-background-dark">
                <AnimatePresence mode="wait">
                    {isLeftPanelOpen ? (
                        <motion.aside key="left-panel-main" initial={{ x: '-100%' }} animate={{ x: '0%' }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="w-full md:w-72 lg:w-80 xl:w-96 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark overflow-y-auto min-h-0 p-3 sm:p-4 shadow-lg flex-shrink-0 custom-scrollbar">
                            <LeftPanel isChatProcessing={isChatProcessing} />
                        </motion.aside>
                    ) : (<LeftCollapsedNav isChatProcessing={isChatProcessing} />)}
                </AnimatePresence>
                <main className={`flex-1 flex flex-col overflow-hidden p-0 sm:p-2 md:p-4 transition-all duration-300 ease-in-out ${isLeftPanelOpen ? 'lg:ml-0' : 'ml-14 lg:ml-16 md:ml-14'} ${isRightPanelOpen ? 'lg:mr-0' : 'lg:mr-16 md:mr-14'}`}>
                    <CenterPanel
                        messages={messages}
                        setMessages={setMessages}
                        currentSessionId={currentSessionId}
                        onChatProcessingChange={handleChatProcessingStatusChange}
                        initialPromptForNewSession={initialPromptForNewSession}
                        setInitialPromptForNewSession={setInitialPromptForNewSession}
                        initialActivityForNewSession={initialActivityForNewSession}
                        setInitialActivityForNewSession={setInitialActivityForNewSession}
                    />
                </main>
                <AnimatePresence mode="wait">
                    {isRightPanelOpen ? (
                        <motion.aside key="right-panel-main" initial={{ x: '100%' }} animate={{ x: '0%' }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="hidden md:flex md:flex-col md:w-72 lg:w-80 xl:w-96 bg-surface-light dark:bg-surface-dark border-l border-border-light dark:border-border-dark overflow-y-auto min-h-0 p-3 sm:p-4 shadow-lg flex-shrink-0 custom-scrollbar">
                            <RightPanel isChatProcessing={isChatProcessing} /> {/* Pass the prop */}
                        </motion.aside>
                    ) : (<RightCollapsedNav isChatProcessing={isChatProcessing} />)} {/* Pass the prop */}
                </AnimatePresence>
            </div>
            <ChatHistoryModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} onSelectSession={handleSelectSessionFromHistory} />
        </>
    );
}

function App() {
    const { token: regularUserToken, user: regularUser, loading: regularUserAuthLoading, setUser: setRegularUserInAuthContext } = useRegularAuth();
    const {
        theme,
        setSessionId: setGlobalSessionId,
        currentSessionId,
        isAdminSessionActive,
        setIsAdminSessionActive,
    } = useAppState();
    const navigate = useNavigate();
    const location = useLocation();
    const [appInitializing, setAppInitializing] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [isLoginViewInModal, setIsLoginViewInModal] = useState(true);
    const [orchestratorStatus, setOrchestratorStatus] = useState({ status: "loading", message: "Connecting..." });
    const [isSessionLoading, setIsSessionLoading] = useState(false);
    const [appStateMessages, setAppStateMessages] = useState([]);
    const [isCreatingSession, setIsCreatingSession] = useState(false);
    const [isAwaitingOnboarding, setIsAwaitingOnboarding] = useState(false);
    const { newBadge, clearBadge } = useBadgeSocket();


    const handleNewChat = useCallback(async (callback, forceNewChat = false, skipSessionAnalysis = false) => {

        const actualCallback = typeof callback === 'function' ? callback : null;
        const messages = appStateMessages;

        if (!forceNewChat && messages.length === 0 && currentSessionId) {
            toast('This is already a new chat!', { icon: '✨' });
            if (actualCallback) currentSessionId(currentSessionId);
            return;
        }

        setIsSessionLoading(true);
        try {
            const data = await api.startNewSession(currentSessionId, skipSessionAnalysis);
            if (data && data.newSessionId) {
                setGlobalSessionId(data.newSessionId);
                if (data.studyPlanSuggestion) {
                    const { topic, reason } = data.studyPlanSuggestion;
                    toast.custom((t) => (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="bg-surface-light dark:bg-surface-dark shadow-lg rounded-lg p-4 w-96 border border-border-light dark:border-border-dark"
                        >
                            <div className="flex items-start">
                                <div className="flex-shrink-0 pt-0.5"><GraduationCap className="h-6 w-6 text-primary" /></div>
                                <div className="ml-3 flex-1">
                                    <p className="text-sm font-semibold text-text-light dark:text-text-dark">Personalized Study Plan Suggestion</p>
                                    <p className="mt-1 text-sm text-text-muted-light dark:text-text-muted-dark">{reason}</p>
                                    <div className="mt-4 flex gap-2">
                                        <Button size="sm" onClick={() => { navigate('/study-plan', { state: { prefilledGoal: topic } }); toast.dismiss(t.id); }}>
                                            Create Plan for "{topic}"
                                        </Button>
                                        <Button size="sm" variant="secondary" onClick={() => toast.dismiss(t.id)}>Dismiss</Button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ), { id: `study-plan-toast-${topic}`, duration: Infinity });
                }
                if (actualCallback) {
                    if (!skipSessionAnalysis) {
                        toast.success("New chat started!");
                    }
                    actualCallback(data.newSessionId);
                } else if (!skipSessionAnalysis) {
                    // If no callback, but it's a user-initiated new chat, still show the toast.
                    toast.success("New chat started!");
                }
            } else {
                toast.error(data.message || "Could not start new chat session.");
                if (actualCallback) actualCallback(null);
            }
        } catch (error) {
            toast.error(`Failed to start new chat: ${error.message}`);
            if (actualCallback) actualCallback(null);
        } finally {
            setIsSessionLoading(false);
        }
    }, [currentSessionId, setGlobalSessionId, navigate, appStateMessages]);

    const fetchChatHistory = useCallback(async (sid) => {
        if (!sid || !regularUserToken) {
            setAppStateMessages([]);
            return;
        }
        try {
            const sessionData = await api.getChatHistory(sid);
            setAppStateMessages(Array.isArray(sessionData.messages) ? sessionData.messages : []);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.warn("Stale session ID found. It will be replaced.");
                localStorage.removeItem('aiTutorSessionId');
                setGlobalSessionId(null);
            } else {
                toast.error(`History load failed: ${error.message}`);
            }
        }
    }, [regularUserToken, setGlobalSessionId]);

    useEffect(() => {
        if (currentSessionId && regularUserToken) {
            fetchChatHistory(currentSessionId);
        } else if (!regularUserToken) {
            setAppStateMessages([]);
        }
    }, [currentSessionId, regularUserToken, fetchChatHistory]);

    useEffect(() => { document.documentElement.className = theme; }, [theme]);
    useEffect(() => { api.getOrchestratorStatus().then(setOrchestratorStatus); }, []);

    useEffect(() => {
        const handleAuthAndSession = async () => {
            if (isAdminSessionActive) {
                setAppInitializing(false); setShowAuthModal(false);
                if (!location.pathname.startsWith('/admin')) navigate('/admin/dashboard', { replace: true });
                return;
            }
            if (regularUserAuthLoading) {
                setAppInitializing(true); return;
            }
            setAppInitializing(false);

            if (regularUserToken && regularUser?.isAdmin) {
                setShowAuthModal(false);
                setIsAdminSessionActive(true);
                if (!location.pathname.startsWith('/admin')) navigate('/admin/dashboard', { replace: true });
                return;
            }

            if (regularUserToken && regularUser) {
                if (regularUser.hasCompletedOnboarding === false) {
                    setIsAwaitingOnboarding(true);
                    return;
                }
                if (isAwaitingOnboarding) setIsAwaitingOnboarding(false);

                setShowAuthModal(false);
                document.body.classList.remove('landing-page-body');

                if (location.pathname.startsWith('/admin')) navigate('/', { replace: true });

                const shouldCreateSession = !currentSessionId && !location.pathname.startsWith('/tools') && !location.pathname.startsWith('/study-plan') && !location.pathname.startsWith('/timetable');
                if (shouldCreateSession && !isCreatingSession) {
                    setIsCreatingSession(true);
                    await handleNewChat(() => { }, true, true);
                    setIsCreatingSession(false);
                }
            } else {
                document.body.classList.add('landing-page-body');
            }
        };
        handleAuthAndSession();
    }, [
        regularUserAuthLoading, regularUserToken, regularUser, isAdminSessionActive,
        currentSessionId, navigate, location.pathname, handleNewChat, isCreatingSession, isAwaitingOnboarding
    ]);

    const handleAuthSuccess = (authData) => {
        setShowAuthModal(false);
        // --- THIS IS THE FIX (Part 1): Centralize state logic here ---
        if (authData?.isAdminLogin) {
            setIsAdminSessionActive(true);
            // The main useEffect will now handle the navigation
        } else if (authData?.token) {
            setGlobalSessionId(null);
            if (authData.email && authData._id) {
                const userForContext = {
                    id: authData._id,
                    email: authData.email,
                    username: authData.username,
                    isAdmin: Boolean(authData.isAdmin),
                    profile: authData.profile || {},
                    hasCompletedOnboarding: authData.hasCompletedOnboarding
                };
                setRegularUserInAuthContext(userForContext);
                // The main useEffect will handle onboarding check
            }
        }
    };

    const handleOnboardingComplete = () => {
        if (regularUser) {
            setRegularUserInAuthContext({ ...regularUser, hasCompletedOnboarding: true });
        }
        setIsAwaitingOnboarding(false);
    };

    const openAuthModal = (isLogin = true) => {
        setIsLoginViewInModal(isLogin);
        setShowAuthModal(true);
    };

    if (appInitializing) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-background-light dark:bg-background-dark">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen overflow-hidden font-sans">
            <BadgeTotem badge={newBadge} onComplete={clearBadge} />
            <FocusDock />
            <AnimatePresence>

                {showAuthModal && (
                    <AuthModal
                        isOpen={showAuthModal}
                        onClose={handleAuthSuccess}
                        initialViewIsLogin={isLoginViewInModal}
                    />
                )}
                {isAwaitingOnboarding &&
                    <OnboardingFlow onComplete={handleOnboardingComplete} />
                }
            </AnimatePresence>
            {/* --- THIS IS THE FIX (Part 2): Restructured Routing --- */}
            <Routes>
                {isAdminSessionActive ? (
                    <>
                        <Route path="/admin/dashboard" element={<AdminProtectedRoute><AdminDashboardPage /></AdminProtectedRoute>} />
                        <Route path="/admin/analytics" element={<AdminProtectedRoute><AnalyticsDashboardPage /></AdminProtectedRoute>} />
                        <Route path="/*" element={<Navigate to="/admin/dashboard" replace />} />
                    </>
                ) : regularUserToken && regularUser ? (
                    <>
                        <Route path="/tools/code-executor" element={<CodeExecutorPage />} />
                        <Route path="/study-plan" element={<StudyPlanPage handleNewChat={handleNewChat} />} />
                        <Route path="/tools/quiz-generator" element={<QuizGeneratorPage />} />
                        <Route path="/tools/integrity-checker" element={<AcademicIntegrityPage />} />
                        {/* Gamification Routes */}
                        <Route path="/gamification/bounties" element={<BountyCreditsPage />} />
                        <Route path="/gamification/credits" element={<BountyCreditsPage />} />
                        <Route path="/gamification/boss-battles" element={<BossBattles />} />
                        <Route path="/gamification/badges" element={<BadgesShowcase />} />
                        <Route path="/learning-profile" element={<LearningProfile />} />
                        <Route path="/gamification/skill-tree" element={<SkillTreeGames />} />
                        <Route path="/gamification/skill-tree/new" element={<SkillTreeLanding />} />
                        <Route path="/gamification/skill-tree/map" element={<SkillTreeGameMap />} />
                        <Route path="/gamification/skill-tree/classic" element={<SkillTreeMap />} />
                        <Route path="/skill-tree" element={<SkillTreePage />} />
                        <Route path="/timetable" element={<TimetablePage />} />
                        <Route path="/prep-mode" element={<PrepModePage />} />
                        <Route path="/doubt-resolver" element={<DoubtResolverPage />} />
                        <Route path="/leaderboard" element={<LeaderboardPage />} />
                        <Route path="/challenges" element={<ChallengesPage />} />
                        <Route path="/focus" element={<FocusTrackerPage />} />
                        <Route path="/notepad" element={<NotepadPage />} />
                        <Route path="/admin/dashboard" element={<Navigate to="/" replace />} />
                        <Route path="/*" element={
                            <MainAppLayout
                                orchestratorStatus={orchestratorStatus}
                                handleNewChat={handleNewChat}
                                isSessionLoading={isSessionLoading}
                                messages={appStateMessages}
                                setMessages={setAppStateMessages}
                            />
                        } />
                    </>
                ) : (
                    <Route path="/*" element={<LandingPage onLoginClick={openAuthModal} />} />
                )}
            </Routes>
        </div>
    );
}

function AppWrapper() {
    return (
        <Router>
            <App />
        </Router>
    );
}

export default AppWrapper;
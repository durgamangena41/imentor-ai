// frontend/src/components/layout/TopNav.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppState } from '../../contexts/AppStateContext';
import ThemeToggle from '../common/ThemeToggle.jsx';
import LLMSelectionModal from './LLMSelectionModal.jsx';
import ProfileSettingsModal from '../profile/ProfileSettingsModal.jsx';
import { Link } from 'react-router-dom';
import {
    LogOut, User, MessageSquare, History as HistoryIcon, Settings, Cpu, Zap, ServerCrash, Server, Wrench, GraduationCap, Brain,
    Trophy, Target, Star
} from 'lucide-react';
import ToolsModal from '../tools/ToolsModal.jsx';
import LevelBadge from '../gamification/LevelBadge.jsx';
import RankBadge from '../gamification/RankBadge.jsx';
import XPProgressModal from '../gamification/XPProgressModal.jsx';
import { useUserLevel } from '../../hooks/useUserLevel.jsx';



function TopNav({ user: authUser, onLogout, onNewChat, onHistoryClick, orchestratorStatus, isChatProcessing }) {
    const [isLLMModalOpen, setIsLLMModalOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
    const [isXPModalOpen, setIsXPModalOpen] = useState(false);
    const { level, xp, loading: levelLoading } = useUserLevel();
    const { selectedLLM, switchLLM, tutorMode, setTutorMode } = useAppState();
    const handleEnableTutorMode = () => {
        setTutorMode(true);
    };

    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
    const profileDropdownRef = useRef(null);

    // Memoize status indicator to prevent unnecessary re-renders
    const getStatusIndicator = useMemo(() => () => {
        if (!orchestratorStatus) return <div title="Status unavailable" className="w-4 h-4 bg-gray-400 rounded-full"></div>;
        if (orchestratorStatus.status === "ok") {
            return <Zap size={18} className="text-green-400 animate-pulse" title={`Backend Online: ${orchestratorStatus.message}`} />;
        } else if (orchestratorStatus.status === "loading") {
            return <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-yellow-400" title="Connecting..."></div>;
        } else {
            return <ServerCrash size={18} className="text-red-400" title={`Backend Offline: ${orchestratorStatus.message}`} />;
        }
    }, [orchestratorStatus]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
                setIsProfileDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [profileDropdownRef]);

    return (
        <>
            <nav className="fixed top-0 left-0 right-0 z-40 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark shadow-sm h-16 flex items-center justify-between px-2 sm:px-4">
                <div className="flex items-center gap-2">
                    <a href="/" className="flex items-center gap-1.5 sm:gap-2 text-lg sm:text-xl font-semibold text-text-light dark:text-text-dark">
                        <Server size={24} className="text-primary dark:text-primary-light" />
                        <span className="hidden sm:inline">iMentor</span>
                    </a>
                </div>

                <div className="flex-1 flex justify-center px-2">
                    <div className="flex items-center gap-1 sm:gap-2">
                        <button
                            onClick={onNewChat}
                            className={`flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-sky-700 dark:text-sky-300 bg-sky-500/10 dark:bg-sky-500/20 hover:bg-sky-500/20 dark:hover:bg-sky-500/30 transition-colors ${isChatProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isChatProcessing}
                            title="Start a new chat session"
                        >
                            <MessageSquare size={14} /> <span className="hidden sm:inline">New Chat</span>
                        </button>

                        <button
                            onClick={onHistoryClick}
                            className={`flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-teal-700 dark:text-teal-300 bg-teal-500/10 dark:bg-teal-500/20 hover:bg-teal-500/20 dark:hover:bg-teal-500/30 transition-colors ${isChatProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isChatProcessing}
                            title="View chat history"
                        >
                            <HistoryIcon size={14} /> <span className="hidden sm:inline">History</span>
                        </button>

                        <Link
                            to="/study-plan"
                            className={`hidden md:flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 dark:bg-indigo-500/20 hover:bg-indigo-500/20 dark:hover:bg-indigo-500/30 transition-colors ${isChatProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={(e) => isChatProcessing && e.preventDefault()}
                            title="Open your personalized Study Plan"
                        >
                            <GraduationCap size={14} /> <span className="hidden sm:inline">Study Plan</span>
                        </Link>





                        <Link
                            to="/challenges"
                            className={`hidden md:flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-red-700 dark:text-red-400 bg-red-500/10 dark:bg-red-500/20 hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors ${isChatProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={(e) => isChatProcessing && e.preventDefault()}
                            title="View Challenges"
                        >
                            <Target size={14} /> <span className="hidden sm:inline">Challenges</span>
                        </Link>

                        <button
                            onClick={() => setIsToolsModalOpen(true)}
                            className={`hidden md:flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-amber-700 dark:text-amber-400 bg-amber-400/20 dark:bg-amber-500/20 hover:bg-amber-400/30 dark:hover:bg-amber-500/30 transition-colors ${isChatProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isChatProcessing}
                            title="Open Tools"
                        >
                            <Wrench size={14} /> <span className="hidden sm:inline">Tools</span>
                        </button>

                        <button
                            onClick={() => setIsLLMModalOpen(true)}
                            className={`hidden md:flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-slate-500/10 dark:bg-slate-500/20 hover:bg-slate-500/20 dark:hover:bg-slate-500/30 transition-colors ${isChatProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isChatProcessing}
                            title={`Switch LLM (Current: ${selectedLLM.toUpperCase()})`}
                        >
                            <Cpu size={14} /> <span className="hidden sm:inline">{selectedLLM.toUpperCase()}</span>
                        </button>
                    </div>
                </div>


                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-8 h-8 flex items-center justify-center">
                        {getStatusIndicator()}
                    </div>
                    <ThemeToggle disabled={isChatProcessing} />
                    <div className="relative" ref={profileDropdownRef}>
                        {/* User Profile Button with Rank & Level Badges */}
                        <div className="flex items-center gap-2">
                            {/* Rank Badge (Bronze, Silver, Gold, etc.) */}
                            {/* Leaderboard / Level Summary Pill */}
                            {!levelLoading && level && (
                                <Link
                                    to="/leaderboard"
                                    className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-full text-xs font-bold text-text-light dark:text-text-dark hover:border-primary hover:text-primary transition-all group"
                                    title="Click to view Leaderboard"
                                >
                                    <span className="text-text-muted-light dark:text-text-muted-dark group-hover:text-primary transition-colors">LVL {level}</span>
                                    <span className="w-px h-3 bg-border-light dark:bg-border-dark"></span>
                                    <span className="flex items-center gap-1 text-amber-500">
                                        {xp || 0} <Star size={10} fill="currentColor" />
                                    </span>
                                </Link>
                            )}

                            {/* User Icon with Level Badge Overlay */}
                            <button
                                onClick={() => setIsProfileDropdownOpen(prev => !prev)}
                                className="relative p-1.5 bg-primary-light dark:bg-primary-dark text-white rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark focus:ring-primary"
                            >
                                <User size={18} />

                                {/* Level Number Badge */}
                                {!levelLoading && level && (
                                    <div className="absolute -bottom-1 -right-1 scale-90">
                                        <LevelBadge level={level} size="xs" />
                                    </div>
                                )}
                            </button>
                        </div>

                        {/* Profile Dropdown */}
                        <div
                            className={`absolute right-0 mt-2 w-48 bg-surface-light dark:bg-surface-dark rounded-md shadow-lg py-1 transition-all duration-150 ease-in-out transform origin-top-right z-50
                                ${isProfileDropdownOpen
                                    ? 'opacity-100 scale-100 visible'
                                    : 'opacity-0 scale-95 invisible'
                                }`
                            }
                        >
                            <div className="px-4 py-2 text-sm text-text-light dark:text-text-dark border-b border-border-light dark:border-border-dark">
                                Signed in as <br /><strong>{authUser?.username || 'User'}</strong>
                                {!levelLoading && level && (
                                    <div className="mt-2">
                                        <RankBadge level={level} size="sm" showLabel={true} />
                                    </div>
                                )}
                            </div>
                            <Link
                                to="/learning-profile"
                                onClick={() => setIsProfileDropdownOpen(false)}
                                className="w-full text-left px-4 py-2 text-sm text-text-light dark:text-text-dark hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                                <Brain size={16} /> Learning Memory
                            </Link>
                            <button
                                onClick={() => { setIsProfileModalOpen(true); setIsProfileDropdownOpen(false); }}
                                className="w-full text-left px-4 py-2 text-sm text-text-light dark:text-text-dark hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                                <Settings size={16} /> Profile Settings
                            </button>

                            {/* Mobile-only items moved from TopNav */}
                            <div className="md:hidden border-t border-border-light dark:border-border-dark mt-1 pt-1">
                                <Link
                                    to="/study-plan"
                                    onClick={() => setIsProfileDropdownOpen(false)}
                                    className="w-full text-left px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <GraduationCap size={16} /> Study Plan
                                </Link>
                                <button
                                    onClick={() => { setIsToolsModalOpen(true); setIsProfileDropdownOpen(false); }}
                                    className="w-full text-left px-4 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <Wrench size={16} /> Tools
                                </button>
                                <button
                                    onClick={() => { setIsLLMModalOpen(true); setIsProfileDropdownOpen(false); }}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <Cpu size={16} /> Switch LLM ({selectedLLM.toUpperCase()})
                                </button>
                            </div>
                            <button
                                onClick={() => { onLogout(); setIsProfileDropdownOpen(false); }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 flex items-center gap-2"
                            >
                                <LogOut size={16} /> Logout
                            </button>
                        </div>
                    </div>
                </div>
            </nav >
            <LLMSelectionModal
                isOpen={isLLMModalOpen}
                onClose={() => setIsLLMModalOpen(false)}
                currentLLM={selectedLLM}
                onSelectLLM={(llm) => {
                    switchLLM(llm);
                    setIsLLMModalOpen(false);
                }}
            />
            <ProfileSettingsModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
            />
            {/* The ToolsModal is now correctly managed here */}
            <ToolsModal
                isOpen={isToolsModalOpen}
                onClose={() => setIsToolsModalOpen(false)}
                onEnableTutorMode={handleEnableTutorMode}
            />
            {/* XP Progress Modal */}
            <XPProgressModal
                isOpen={isXPModalOpen}
                onClose={() => setIsXPModalOpen(false)}
                level={level}
            />
        </>
    );
}
export default TopNav;
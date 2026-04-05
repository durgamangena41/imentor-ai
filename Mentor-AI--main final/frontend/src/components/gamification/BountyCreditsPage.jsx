// frontend/src/components/gamification/BountyCreditsPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Award, TrendingUp, Clock, CheckCircle, Coins, Sparkles, Star, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:2000",
});

apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("authToken");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    // Prevent caching to always get fresh data
    config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    config.headers['Pragma'] = 'no-cache';
    config.headers['Expires'] = '0';
    // Add timestamp to bypass browser/proxy cache
    const separator = config.url.includes('?') ? '&' : '?';
    config.url = `${config.url}${separator}_t=${Date.now()}`;
    return config;
});

function BountyCreditsPage() {
    const navigate = useNavigate();
    const [bounties, setBounties] = useState([]);
    const [credits, setCredits] = useState(0);
    const [stats, setStats] = useState({
        bountiesCompleted: 0,
        totalEarned: 0,
        transactions: 0
    });
    const [loading, setLoading] = useState(true);
    const [submittingBounty, setSubmittingBounty] = useState(null);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const [levelUpData, setLevelUpData] = useState(null);

    useEffect(() => {
        fetchData();
        // Auto-refresh every 30 seconds to keep data current
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async (force = false) => {
        try {
            if (force || !loading) setLoading(true);

            // Force fresh data by adding random cache buster
            const cacheBuster = `_refresh=${Date.now()}_${Math.random()}`;

            const [bountiesRes, profileRes] = await Promise.all([
                apiClient.get(`/gamification/bounties?${cacheBuster}`),
                apiClient.get(`/gamification/profile?${cacheBuster}`)
            ]);

            console.log('[BountyCreditsPage] Fresh data loaded:', {
                credits: profileRes.data.learningCredits,
                bounties: bountiesRes.data.bounties?.length
            });

            setBounties(bountiesRes.data.bounties || []);
            setCredits(profileRes.data.learningCredits || 0);

            // Calculate stats from credits history
            const creditsHistory = profileRes.data.creditsHistory || [];
            const completed = creditsHistory.filter(h => h.reason === 'bounty_completed').length;
            const totalEarned = creditsHistory
                .filter(h => h.reason === 'bounty_completed')
                .reduce((sum, h) => sum + h.amount, 0);

            setStats({
                bountiesCompleted: completed,
                totalEarned: totalEarned,
                transactions: creditsHistory.length
            });
        } catch (error) {
            console.error('[BountyCreditsPage] Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitBounty = async (bountyId) => {
        // Find the bounty details
        const bounty = bounties.find(b => b.bountyId === bountyId);
        if (!bounty) return;

        // Show a custom toast notification with bounty details
        toast.custom((t) => (
            <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.8 }}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 rounded-lg shadow-2xl max-w-md"
            >
                <div className="flex items-start gap-3">
                    <Target className="flex-shrink-0 mt-1" size={24} />
                    <div>
                        <h3 className="font-bold text-lg mb-1">Bounty Challenge Started!</h3>
                        <p className="text-sm opacity-90 mb-2">{bounty.questionText.substring(0, 100)}...</p>
                        <div className="flex items-center gap-3 text-sm">
                            <span className="flex items-center gap-1">
                                <Coins size={16} />
                                {bounty.creditReward} Credits
                            </span>
                            <span className="flex items-center gap-1">
                                <Star size={16} />
                                {bounty.xpBonus} XP
                            </span>
                        </div>
                    </div>
                </div>
            </motion.div>
        ), { duration: 3000 });

        // Navigate to chat with the bounty question
        navigate('/', {
            state: {
                bountyQuestion: bounty.questionText,
                bountyId: bountyId,
                bountyCredits: bounty.creditReward,
                bountyXP: bounty.xpBonus,
                bountyTopic: bounty.topic,
                bountyDifficulty: bounty.difficulty
            }
        });
    };

    const handleBountyComplete = async (result) => {
        if (result.isCorrect) {
            // Show success notification with rewards
            toast.custom((t) => (
                <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 50 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 50 }}
                    className="bg-gradient-to-br from-green-500 to-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl"
                >
                    <div className="flex items-start gap-3">
                        <CheckCircle className="flex-shrink-0" size={32} />
                        <div>
                            <h3 className="font-bold text-xl mb-2">Bounty Completed! 🎉</h3>
                            <div className="space-y-1">
                                <p className="flex items-center gap-2">
                                    <Coins size={18} />
                                    <span className="font-semibold">+{result.creditsAwarded} Credits</span>
                                    <span className="text-sm opacity-80">(Total: {result.newCreditsBalance})</span>
                                </p>
                                <p className="flex items-center gap-2">
                                    <Star size={18} />
                                    <span className="font-semibold">+{result.xpAwarded} XP</span>
                                    <span className="text-sm opacity-80">(Total: {result.newXPTotal})</span>
                                </p>
                                <p className="flex items-center gap-2">
                                    <Award size={18} />
                                    <span className="font-semibold">Level {result.newLevel}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            ), { duration: 5000 });

            // Check for level up
            if (result.leveledUp) {
                setLevelUpData(result);
                setShowLevelUp(true);
                setTimeout(() => setShowLevelUp(false), 5000);
            }

            // Update local state with new values
            setCredits(result.newCreditsBalance);

            // Refresh data
            fetchData();
        } else {
            // Show failure notification
            toast.error(`Incorrect answer. ${result.explanation}`, {
                duration: 4000,
                icon: '❌'
            });
        }
    };

    const getDifficultyColor = (difficulty) => {
        const colors = {
            easy: 'bg-gray-100 text-gray-800 border-gray-300',
            medium: 'bg-gray-200 text-gray-900 border-gray-400',
            hard: 'bg-gray-800 text-white border-gray-600',
            expert: 'bg-black text-white border-gray-900'
        };
        return colors[difficulty] || colors.medium;
    };

    const getDifficultyIcon = (difficulty) => {
        // Keep stars as they are symbolic, but could use simple text if requested.
        // Keeping stars as standard symbols.
        const icons = {
            easy: '⭐',
            medium: '⭐⭐',
            hard: '⭐⭐⭐',
            expert: '⭐⭐⭐⭐'
        };
        return icons[difficulty] || icons.medium;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-black dark:border-white"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-black py-8 px-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-200 dark:scrollbar-track-gray-900">
            {/* Level Up Animation */}
            <AnimatePresence>
                {showLevelUp && levelUpData && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm"
                        onClick={() => setShowLevelUp(false)}
                    >
                        <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, rotate: 180 }}
                            transition={{ type: 'spring', duration: 0.8 }}
                            className="bg-white dark:bg-gray-900 border-2 border-black dark:border-white p-8 rounded-2xl shadow-2xl text-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <motion.div
                                animate={{
                                    scale: [1, 1.2, 1],
                                    rotate: [0, 360]
                                }}
                                transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    repeatType: 'loop'
                                }}
                                className="mb-4"
                            >
                                <Sparkles className="mx-auto text-black dark:text-white" size={64} />
                            </motion.div>
                            <h2 className="text-4xl font-bold text-black dark:text-white mb-2">LEVEL UP!</h2>
                            <p className="text-6xl font-black text-black dark:text-white mb-4">{levelUpData.newLevel}</p>
                            <p className="text-gray-600 dark:text-gray-300 text-lg">You're getting stronger! 💪</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="max-w-7xl mx-auto">
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/')}
                                className="p-2 rounded-lg bg-white dark:bg-black hover:bg-gray-100 dark:hover:bg-gray-800 transition-all shadow-sm border border-black dark:border-white"
                                title="Back to Main"
                            >
                                <ArrowLeft className="text-black dark:text-white" size={24} />
                            </button>
                            <h1 className="text-4xl font-bold text-black dark:text-white flex items-center gap-3">
                                <Target className="text-black dark:text-white" size={40} />
                                Bounty Questions & Credits
                            </h1>
                        </div>
                        <button
                            onClick={() => fetchData(true)}
                            className="p-3 rounded-full bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black transition-all hover:scale-110 border border-transparent dark:border-gray-300"
                            title="Refresh credits data"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">
                        Complete bounty challenges to earn learning credits
                    </p>
                </div>

                {/* Credits Overview Card */}
                <div className="bg-white dark:bg-black rounded-xl shadow-md border border-gray-200 dark:border-gray-800 p-6 mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-black dark:bg-white p-3 rounded-full">
                                <Coins className="text-white dark:text-black" size={28} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-black dark:text-white">
                                    {credits}
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Total Credits</p>
                            </div>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            Earn credits by completing bounty questions
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 text-black dark:text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <Award size={20} className="text-gray-700 dark:text-gray-300" />
                                <span className="text-xs opacity-80">Completed</span>
                            </div>
                            <div className="text-2xl font-bold">{stats.bountiesCompleted}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 text-black dark:text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingUp size={20} className="text-gray-700 dark:text-gray-300" />
                                <span className="text-xs opacity-80">Total Earned</span>
                            </div>
                            <div className="text-2xl font-bold">{stats.totalEarned}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 text-black dark:text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock size={20} className="text-gray-700 dark:text-gray-300" />
                                <span className="text-xs opacity-80">Transactions</span>
                            </div>
                            <div className="text-2xl font-bold">{stats.transactions}</div>
                        </div>
                    </div>
                </div>

                {/* Bounties Section */}
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-black dark:text-white mb-4 flex items-center gap-2">
                        <Target className="text-black dark:text-white" size={28} />
                        Active Bounties
                    </h2>
                </div>

                {bounties.length === 0 ? (
                    <div className="bg-white dark:bg-black rounded-xl shadow-md border border-gray-200 dark:border-gray-800 p-12 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                            <Target className="text-gray-500" size={32} />
                        </div>
                        <h3 className="text-xl font-semibold text-black dark:text-white mb-2">
                            No active bounties
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400">
                            New bounties are generated daily at 9 AM
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {bounties.map((bounty) => (
                            <div
                                key={bounty._id}
                                className={`bg-white dark:bg-gray-900 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-300 overflow-hidden group ${bounty.status === 'completed' ? 'opacity-75' : ''}`}
                            >
                                {/* Bounty Header */}
                                <div className={`p-4 ${bounty.status === 'completed' ? 'bg-gray-200 dark:bg-gray-800' : 'bg-black dark:bg-white'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex gap-2">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getDifficultyColor(bounty.difficulty)}`}>
                                                {getDifficultyIcon(bounty.difficulty)} {bounty.difficulty.toUpperCase()}
                                            </span>
                                            {bounty.isGlobal && (
                                                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white text-black border border-gray-500 flex items-center gap-1">
                                                    🌍 GLOBAL
                                                </span>
                                            )}
                                        </div>
                                        <div className={`flex items-center gap-1 font-bold ${bounty.status === 'completed' ? 'text-gray-600 dark:text-gray-400' : 'text-white dark:text-black'}`}>
                                            <Coins size={18} />
                                            <span>{bounty.creditReward}</span>
                                        </div>
                                    </div>
                                    <h3 className={`text-lg font-bold ${bounty.status === 'completed' ? 'text-gray-700 dark:text-gray-300' : 'text-white dark:text-black'}`}>
                                        {bounty.topic}
                                    </h3>
                                </div>

                                {/* Bounty Content */}
                                <div className="p-4">
                                    <p className="text-sm text-gray-800 dark:text-gray-200 mb-4 line-clamp-2">
                                        {bounty.questionText}
                                    </p>

                                    {bounty.status === 'completed' ? (
                                        <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 mb-4 flex items-center gap-3">
                                            <div className="bg-gray-700 dark:bg-gray-600 p-2 rounded-full">
                                                <CheckCircle className="text-white" size={16} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-gray-800 dark:text-gray-300">CLAIMED</p>
                                                <p className="text-[10px] text-gray-600 dark:text-gray-400">
                                                    Won by <span className="font-bold underline">{bounty.completedBy?.username || 'Learner'}</span>
                                                </p>
                                            </div>
                                        </div>
                                    ) : bounty.knowledgeGap && (
                                        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
                                            <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                                                💡 {bounty.knowledgeGap}
                                            </p>
                                        </div>
                                    )}

                                    {/* Rewards Info */}
                                    <div className="flex items-center justify-between mb-4 text-sm mt-auto">
                                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                            <Award size={16} />
                                            <span>+{bounty.xpBonus} XP</span>
                                        </div>
                                        <div className="text-gray-500 dark:text-gray-400 text-[10px]">
                                            Expires: {new Date(bounty.expiresAt).toLocaleDateString()}
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <button
                                        onClick={() => bounty.status !== 'completed' && handleSubmitBounty(bounty.bountyId)}
                                        disabled={bounty.status === 'completed'}
                                        className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-300 transform flex items-center justify-center gap-2 border ${bounty.status === 'completed'
                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 cursor-not-allowed'
                                            : 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white hover:bg-gray-800 dark:hover:bg-gray-200'
                                            }`}
                                    >
                                        <Target size={18} />
                                        {bounty.status === 'completed' ? 'Challenge Claimed' : 'Attempt Challenge'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Info Section */}
                <div className="mt-8 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-black dark:text-white mb-3">
                        💡 How Bounty Questions Work
                    </h3>
                    <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                        <li className="flex items-start gap-2">
                            <CheckCircle className="text-black dark:text-white mt-0.5 flex-shrink-0" size={18} />
                            <span>Complete bounty challenges to earn learning credits</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle className="text-black dark:text-white mt-0.5 flex-shrink-0" size={18} />
                            <span>Higher difficulty questions award more credits and XP</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle className="text-black dark:text-white mt-0.5 flex-shrink-0" size={18} />
                            <span>New bounties are generated daily at 9:00 AM</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle className="text-black dark:text-white mt-0.5 flex-shrink-0" size={18} />
                            <span>Use credits to unlock premium features and content</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default BountyCreditsPage;

// frontend/src/components/admin/GamificationDashboard.jsx
import React, { useState, useEffect } from 'react';
import {
    Users, Trophy, Target, Zap, Award, TrendingUp,
    Activity, Star, BookOpen, X
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const GamificationDashboard = () => {
    const [overview, setOverview] = useState(null);
    const [topPerformers, setTopPerformers] = useState([]);
    const [topCreditsEarners, setTopCreditsEarners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showStreaksModal, setShowStreaksModal] = useState(false);
    const [streakUsers, setStreakUsers] = useState([]);
    const [loadingStreaks, setLoadingStreaks] = useState(false);

    useEffect(() => {
        fetchOverview();
    }, []);

    const fetchOverview = async () => {
        try {
            setLoading(true);
            const data = await api.getGamificationOverview();
            setOverview(data.overview);
            setTopPerformers(data.topPerformers || []);
            setTopCreditsEarners(data.topCreditsEarners || []);
        } catch (error) {
            console.error('Error fetching gamification overview:', error);
            toast.error('Failed to load gamification data');
        } finally {
            setLoading(false);
        }
    };

    const fetchActiveStreaks = async () => {
        try {
            setLoadingStreaks(true);
            const data = await api.getActiveStreakUsers();
            setStreakUsers(data.users || []);
            setShowStreaksModal(true);
        } catch (error) {
            console.error('Error fetching active streaks:', error);
            toast.error('Failed to load active streak users');
        } finally {
            setLoadingStreaks(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!overview) {
        return (
            <div className="text-center text-gray-500 py-12">
                No gamification data available
            </div>
        );
    }

    const statCards = [
        {
            title: 'Active Users',
            value: overview.totalUsers,
            icon: Users,
            color: 'blue',
            bgColor: 'bg-blue-500/10',
            textColor: 'text-blue-600'
        },
        {
            title: 'Avg Level',
            value: Math.round(overview.averageLevel),
            icon: TrendingUp,
            color: 'green',
            bgColor: 'bg-green-500/10',
            textColor: 'text-green-600'
        },
        {
            title: 'Total Learning Credits Awarded',
            value: overview.totalLearningCreditsAwarded?.toLocaleString() || '0',
            icon: Star,
            color: 'yellow',
            bgColor: 'bg-yellow-500/10',
            textColor: 'text-yellow-600'
        },
        {
            title: 'Active Streaks',
            value: overview.activeStreaks,
            icon: Zap,
            color: 'orange',
            bgColor: 'bg-orange-500/10',
            textColor: 'text-orange-600',
            clickable: true,
            onClick: fetchActiveStreaks
        },
        {
            title: 'Boss Battles',
            value: overview.totalBossBattles || 0,
            icon: Trophy,
            color: 'red',
            bgColor: 'bg-red-500/10',
            textColor: 'text-red-600'
        },
        {
            title: 'Badges Earned',
            value: overview.totalBadges || 0,
            icon: Award,
            color: 'purple',
            bgColor: 'bg-purple-500/10',
            textColor: 'text-purple-600'
        },
        {
            title: 'Active Bounties',
            value: overview.activeBounties || 0,
            icon: Target,
            color: 'cyan',
            bgColor: 'bg-cyan-500/10',
            textColor: 'text-cyan-600'
        },
        {
            title: 'Credits Awarded',
            value: topCreditsEarners.length > 0 ? (topCreditsEarners[0]?.learningCredits || 0) : 0,
            icon: BookOpen,
            color: 'amber',
            bgColor: 'bg-amber-500/10',
            textColor: 'text-amber-600'
        }
    ];

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Gamification Dashboard
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Monitor student engagement and learning gamification
                    </p>
                </div>
                <button
                    onClick={fetchOverview}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                >
                    <Activity className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={`stat-${stat.title}-${index}`}
                            onClick={stat.clickable ? stat.onClick : undefined}
                            className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700 ${
                                stat.clickable ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        {stat.title}
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                                        {stat.value}
                                    </p>
                                </div>
                                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                                    <Icon className={`w-6 h-6 ${stat.textColor}`} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Performers */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                        <Trophy className="w-5 h-5 text-yellow-500" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Top Performers
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {topPerformers.slice(0, 5).map((performer, index) => (
                            <div
                                key={`performer-${performer.userId}-${index}`}
                                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${index === 0 ? 'bg-yellow-500 text-white' :
                                        index === 1 ? 'bg-gray-400 text-white' :
                                            index === 2 ? 'bg-orange-600 text-white' :
                                                'bg-gray-300 text-gray-700'
                                        }`}>
                                        {index + 1}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {performer.name}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Level {performer.level} • {performer.currentStreak} day streak
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-yellow-600 dark:text-yellow-500">
                                        {performer.totalLearningCredits?.toLocaleString() || '0'} XP Points
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Credits Awarded - Top Earners */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                        <BookOpen className="w-5 h-5 text-amber-500" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Credits Awarded - Top Earners
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {topCreditsEarners.length > 0 ? (
                            topCreditsEarners.slice(0, 5).map((earner, index) => (
                                <div
                                    key={`earner-${earner.userId}-${index}`}
                                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                                            index === 0 ? 'bg-amber-500 text-white' :
                                            index === 1 ? 'bg-amber-400 text-white' :
                                            index === 2 ? 'bg-amber-300 text-white' :
                                            'bg-gray-300 text-gray-700'
                                        }`}>
                                            {index + 1}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {earner.name}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Level {earner.level || 0} • {earner.currentStreak || 0} day streak
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-amber-600 dark:text-amber-500">
                                            {(earner.learningCredits || 0).toLocaleString()} Credits
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                                No credits data available yet
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
                <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <a
                        href="/admin/gamification/users"
                        className="bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-lg p-4 transition-colors flex items-center gap-3"
                    >
                        <Users className="w-5 h-5" />
                        <div>
                            <p className="font-medium">View All Users</p>
                            <p className="text-xs text-white/80">Manage user XP & levels</p>
                        </div>
                    </a>
                    <a
                        href="/admin/gamification/skill-tree"
                        className="bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-lg p-4 transition-colors flex items-center gap-3"
                    >
                        <Target className="w-5 h-5" />
                        <div>
                            <p className="font-medium">Manage Skill Tree</p>
                            <p className="text-xs text-white/80">Add & edit skills</p>
                        </div>
                    </a>
                    <a
                        href="/admin/gamification/contributions"
                        className="bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-lg p-4 transition-colors flex items-center gap-3"
                    >
                        <Award className="w-5 h-5" />
                        <div>
                            <p className="font-medium">Review Contributions</p>
                            <p className="text-xs text-white/80">Approve user content</p>
                        </div>
                    </a>
                </div>
            </div>

            {/* Active Streaks Modal */}
            {showStreaksModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowStreaksModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="bg-orange-500/10 p-3 rounded-lg">
                                    <Zap className="w-6 h-6 text-orange-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                        Active Streak Users
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Users with 1+ day streaks
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowStreaksModal(false)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
                            {loadingStreaks ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                                </div>
                            ) : streakUsers.length > 0 ? (
                                <div className="space-y-3">
                                    {streakUsers.map((user, index) => (
                                        <div
                                            key={`streak-${user.userId}-${index}`}
                                            className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold">
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {user.name}
                                                    </p>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {user.email} • Level {user.level || 0}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-right">
                                                    <p className="font-bold text-orange-600 dark:text-orange-500 text-lg">
                                                        {user.currentStreak} days
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {(user.totalLearningCredits || 0).toLocaleString()} Credits
                                                    </p>
                                                </div>
                                                <Zap className="w-5 h-5 text-orange-500" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <Zap className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                                    <p className="text-gray-500 dark:text-gray-400">
                                        No active streak users found
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GamificationDashboard;

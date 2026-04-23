import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Lock, Sparkles, CheckCircle, ArrowLeft, Search, Funnel, ArrowUpDown, X, ArrowRight } from 'lucide-react';
import api from '../../services/api';

const BadgesShowcase = () => {
    const navigate = useNavigate();
    const [badges, setBadges] = useState([]);
    const [summary, setSummary] = useState({ total: 0, earned: 0, locked: 0, completionRate: 0, byCategory: {} });
    const [nextUnlocks, setNextUnlocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'earned', 'locked'
    const [category, setCategory] = useState('all');
    const [sortBy, setSortBy] = useState('progress');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBadge, setSelectedBadge] = useState(null);

    useEffect(() => {
        fetchBadges();
    }, [filter, category, sortBy]);

    const fetchBadges = async () => {
        try {
            setLoading(true);
            const response = await api.getBadgeCollection({ filter, category, sortBy });
            setBadges(response.badges || []);
            setSummary(response.summary || { total: 0, earned: 0, locked: 0, completionRate: 0, byCategory: {} });
            setNextUnlocks(response.nextUnlocks || []);
            setLoading(false);
        } catch (error) {
            console.error('[Badges] Error:', error);
            setLoading(false);
        }
    };

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredBadges = badges.filter((badge) => {
        if (!normalizedSearch) return true;
        return (
            badge.name?.toLowerCase().includes(normalizedSearch) ||
            badge.description?.toLowerCase().includes(normalizedSearch) ||
            badge.category?.toLowerCase().includes(normalizedSearch)
        );
    });

    const earnedCount = summary.earned || badges.filter(b => b.earned).length;
    const totalCount = summary.total || badges.length;
    const lockedCount = summary.locked ?? Math.max(totalCount - earnedCount, 0);
    const completionRate = summary.completionRate || 0;
    const categoryStats = Object.entries(summary.byCategory || {});

    const getCategoryAction = (categoryName) => {
        const actions = {
            xp_milestone: {
                label: 'Earn XP from Bounties',
                path: '/gamification/bounties',
                tip: 'Complete daily bounty questions to collect steady XP.'
            },
            level_milestone: {
                label: 'Boost Level via Skill Tree',
                path: '/gamification/skill-tree',
                tip: 'Finish levels and maintain performance to rank up faster.'
            },
            streak: {
                label: 'Keep Daily Learning Streak',
                path: '/study-plan',
                tip: 'Study daily using your study plan to extend your streak.'
            },
            boss_battle: {
                label: 'Enter Boss Battles',
                path: '/gamification/boss-battles',
                tip: 'Challenge weak areas and chase perfect scores.'
            },
            bounty: {
                label: 'Solve Bounty Questions',
                path: '/gamification/bounties',
                tip: 'Answer bounty questions consistently for fast unlocks.'
            },
            credits: {
                label: 'Earn Learning Credits',
                path: '/gamification/bounties',
                tip: 'Complete gamification tasks to accumulate credits.'
            },
            general: {
                label: 'Continue Learning',
                path: '/',
                tip: 'Stay active across the platform to unlock more badges.'
            }
        };

        return actions[categoryName] || actions.general;
    };

    const nextUnlockActionCards = nextUnlocks.map((badge) => ({
        ...badge,
        action: getCategoryAction(badge.category)
    }));

    if (loading) {
        return <div className="text-center p-8 text-black dark:text-white font-mono">LOADING BADGE DATA...</div>;
    }

    return (
        <div className="min-h-screen bg-white dark:bg-black py-8 px-4 overflow-y-auto scrollbar-thin scrollbar-thumb-black scrollbar-track-zinc-100 dark:scrollbar-thumb-white dark:scrollbar-track-zinc-900">
            <div className="max-w-7xl mx-auto">
                {/* Back Button */}
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 mb-8 px-5 py-2 text-sm font-bold text-black dark:text-white border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all uppercase tracking-wider rounded-full"
                >
                    <ArrowLeft size={16} />
                    <span>Back to Home</span>
                </button>

                {/* Header */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 border-b-4 border-black dark:border-white pb-8">
                    <div className="flex items-center gap-6 mb-6 md:mb-0">
                        <div className="p-4 bg-black text-white dark:bg-white dark:text-black rounded-xl">
                            <Award size={48} strokeWidth={1.5} />
                        </div>
                        <div>
                            <h1 className="text-4xl md:text-5xl font-black text-black dark:text-white uppercase tracking-tighter">
                                Badge Collection
                            </h1>
                            <p className="text-zinc-500 font-bold uppercase tracking-widest mt-1 text-sm">
                                {earnedCount} / {totalCount} Badges Secured
                            </p>
                        </div>
                    </div>

                    {/* Progress Circle - Monochromatic */}
                    <div className="relative w-32 h-32">
                        <svg className="transform -rotate-90 w-32 h-32">
                            <circle
                                cx="64"
                                cy="64"
                                r="54"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="none"
                                className="text-zinc-200 dark:text-zinc-800"
                            />
                            <circle
                                cx="64"
                                cy="64"
                                r="54"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={`${2 * Math.PI * 54}`}
                                strokeDashoffset={`${2 * Math.PI * 54 * (1 - (totalCount > 0 ? earnedCount / totalCount : 0))}`}
                                className="text-black dark:text-white transition-all duration-1000"
                                strokeLinecap="square"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black text-black dark:text-white">
                                {completionRate}%
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Complete</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
                    <div className="border-2 border-black dark:border-white rounded-2xl p-4 bg-white dark:bg-zinc-950">
                        <p className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-500 mb-2">Near Unlock</p>
                        {nextUnlocks.length > 0 ? (
                            <>
                                <p className="font-black text-lg text-black dark:text-white">{nextUnlocks[0].name}</p>
                                <p className="text-xs text-zinc-500 mt-1">{nextUnlocks[0].progressPercent}% complete</p>
                                <p className="text-xs text-zinc-500">{nextUnlocks[0].remaining} left to unlock</p>
                            </>
                        ) : (
                            <p className="text-xs text-zinc-500">All badges collected.</p>
                        )}
                    </div>
                    <div className="border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-900">
                        <p className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-500 mb-2">Locked</p>
                        <p className="font-black text-3xl text-black dark:text-white">{lockedCount}</p>
                        <p className="text-xs text-zinc-500">Badges still to conquer</p>
                    </div>
                    <div className="border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-900">
                        <p className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-500 mb-2">Categories</p>
                        <p className="font-black text-3xl text-black dark:text-white">{categoryStats.length}</p>
                        <p className="text-xs text-zinc-500">Achievement tracks active</p>
                    </div>
                </div>

                {nextUnlockActionCards.length > 0 && (
                    <div className="mb-8 rounded-3xl border-2 border-black dark:border-white bg-white dark:bg-zinc-950 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-500">Unlock Action Center</p>
                                <h2 className="text-xl font-black text-black dark:text-white">Fastest Path to New Badges</h2>
                            </div>
                            <span className="text-xs uppercase font-bold text-zinc-500">Top {nextUnlockActionCards.length}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {nextUnlockActionCards.map((badge) => (
                                <div key={`next-${badge.badgeId}`} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-900">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="text-2xl">{badge.icon}</div>
                                        <span className="text-[10px] uppercase tracking-widest px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded-full text-zinc-500">
                                            {badge.rarity}
                                        </span>
                                    </div>
                                    <h3 className="mt-3 font-black text-sm uppercase tracking-wide text-black dark:text-white line-clamp-2">{badge.name}</h3>
                                    <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{badge.action.tip}</p>

                                    <div className="mt-3 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                                        <div className="h-full bg-black dark:bg-white" style={{ width: `${badge.progressPercent || 0}%` }} />
                                    </div>
                                    <p className="mt-2 text-[11px] text-zinc-500">{badge.progressPercent || 0}% • {badge.remaining || 0} left</p>

                                    <button
                                        onClick={() => navigate(badge.action.path)}
                                        className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-black dark:border-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all"
                                    >
                                        {badge.action.label}
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
                    <label className="flex items-center gap-2 border-2 border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-full">
                        <Search size={16} className="text-zinc-500" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search badges..."
                            className="w-full bg-transparent text-sm text-black dark:text-white outline-none"
                        />
                    </label>

                    <label className="flex items-center gap-2 border-2 border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-full">
                        <Funnel size={16} className="text-zinc-500" />
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full bg-transparent text-sm text-black dark:text-white outline-none"
                        >
                            <option value="all">All Categories</option>
                            {categoryStats.map(([key]) => (
                                <option key={key} value={key}>{key.replace(/_/g, ' ')}</option>
                            ))}
                        </select>
                    </label>

                    <label className="flex items-center gap-2 border-2 border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-full">
                        <ArrowUpDown size={16} className="text-zinc-500" />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="w-full bg-transparent text-sm text-black dark:text-white outline-none"
                        >
                            <option value="progress">Sort: Progress</option>
                            <option value="newest">Sort: Newest Earned</option>
                            <option value="rarity">Sort: Rarity</option>
                            <option value="name">Sort: Name</option>
                        </select>
                    </label>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-4 mb-10 overflow-x-auto pb-2">
                    {['all', 'earned', 'locked'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab)}
                            className={`px-6 py-2 font-bold uppercase tracking-wider transition-all text-sm border-2 rounded-full ${filter === tab
                                ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                                : 'bg-transparent text-zinc-500 border-zinc-200 dark:text-zinc-500 dark:border-zinc-800 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white'
                                }`}
                        >
                            {tab} <span className="text-[10px] ml-1 opacity-60">
                                {tab === 'earned' && `(${earnedCount})`}
                                {tab === 'locked' && `(${lockedCount})`}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Badges Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredBadges.map((badge) => (
                        <div
                            key={badge.badgeId}
                            onClick={() => setSelectedBadge(badge)}
                            className={`relative p-8 border-2 transition-all group rounded-3xl ${badge.earned
                                ? 'border-black bg-white dark:border-white dark:bg-zinc-950 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1'
                                : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 opacity-60 grayscale'
                                } cursor-pointer`}
                        >
                            {/* Badge Icon */}
                            <div className="flex items-center justify-center mb-6">
                                {badge.earned ? (
                                    <div className="relative">
                                        <div className="w-24 h-24 flex items-center justify-center text-7xl filter drop-shadow-xl grayscale hover:grayscale-0 transition-all duration-300">
                                            {badge.icon}
                                        </div>
                                        {badge.name.includes('Perfect') && (
                                            <Sparkles className="absolute -top-4 -right-4 text-black dark:text-white animate-pulse" size={24} />
                                        )}
                                    </div>
                                ) : (
                                    <div className="relative w-24 h-24 flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 rounded-full">
                                        <Lock className="text-zinc-400" size={32} />
                                    </div>
                                )}
                            </div>

                            {/* Badge Name */}
                            <h3 className={`text-center font-black text-lg mb-3 uppercase tracking-tight leading-tight ${badge.earned ? 'text-black dark:text-white' : 'text-zinc-500 dark:text-zinc-500'
                                }`}>
                                {badge.name}
                            </h3>

                            {/* Description */}
                            <p className={`text-center text-xs font-medium mb-6 leading-relaxed ${badge.earned ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-400 dark:text-zinc-600'
                                }`}>
                                {badge.description}
                            </p>

                            {!badge.earned && (
                                <div className="mb-6">
                                    <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                                        <div
                                            className="h-full bg-black dark:bg-white transition-all duration-700"
                                            style={{ width: `${badge.progressPercent || 0}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] mt-2 uppercase tracking-widest text-zinc-400 text-center">
                                        {badge.progressPercent || 0}% complete • {badge.remaining || 0} to go
                                    </p>
                                </div>
                            )}

                            <div className="flex items-center justify-center gap-2">
                                {badge.category && (
                                    <span className="text-[10px] uppercase tracking-widest px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded-full text-zinc-500">
                                        {badge.category.replace(/_/g, ' ')}
                                    </span>
                                )}
                                {badge.rarity && (
                                    <span className="text-[10px] uppercase tracking-widest px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded-full text-zinc-500">
                                        {badge.rarity}
                                    </span>
                                )}
                            </div>

                            {/* Earned Date */}
                            {badge.earned && badge.earnedAt && (
                                <div className="absolute top-4 right-4 text-black dark:text-white" title={`Earned on ${new Date(badge.earnedAt).toLocaleDateString()}`}>
                                    <CheckCircle size={16} fill="currentColor" className="text-black dark:text-white mix-blend-difference" />
                                </div>
                            )}

                            {/* Locked Overlay */}
                            {!badge.earned && (
                                <div className="absolute top-4 right-4">
                                    <Lock className="text-zinc-300 dark:text-zinc-700" size={16} />
                                </div>
                            )}

                            {/* Decorative Corner */}
                            {badge.earned && (
                                <div className="absolute bottom-0 right-0 w-4 h-4 bg-black dark:bg-white rounded-br-2xl"></div>
                            )}
                        </div>
                    ))}
                </div>

                {filteredBadges.length === 0 && (
                    <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-16 text-center rounded-3xl">
                        <p className="text-zinc-400 font-bold uppercase tracking-widest text-sm">No artifacts found in this sector</p>
                    </div>
                )}

                {selectedBadge && (
                    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedBadge(null)}>
                        <div
                            className="w-full max-w-2xl rounded-3xl border-2 border-black dark:border-white bg-white dark:bg-zinc-950 p-6"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="text-4xl">{selectedBadge.icon}</div>
                                    <div>
                                        <h3 className="text-xl font-black text-black dark:text-white uppercase tracking-tight">{selectedBadge.name}</h3>
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest">{selectedBadge.category?.replace(/_/g, ' ')} • {selectedBadge.rarity}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedBadge(null)}
                                    className="rounded-xl border border-zinc-300 dark:border-zinc-700 p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    aria-label="Close badge details"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-4">{selectedBadge.description}</p>

                            {!selectedBadge.earned && (
                                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 mb-4">
                                    <p className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-500 mb-2">Unlock Progress</p>
                                    <div className="h-3 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                                        <div className="h-full bg-black dark:bg-white" style={{ width: `${selectedBadge.progressPercent || 0}%` }} />
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                                        <span>{selectedBadge.currentValue || 0} / {selectedBadge.threshold || 0}</span>
                                        <span>{selectedBadge.remaining || 0} remaining</span>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Tier</p>
                                    <p className="text-sm font-bold text-black dark:text-white mt-1">{selectedBadge.tier}</p>
                                </div>
                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Status</p>
                                    <p className="text-sm font-bold text-black dark:text-white mt-1">{selectedBadge.earned ? 'Unlocked' : 'Locked'}</p>
                                </div>
                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Completion</p>
                                    <p className="text-sm font-bold text-black dark:text-white mt-1">{selectedBadge.progressPercent || 0}%</p>
                                </div>
                            </div>

                            {!selectedBadge.earned && (
                                <button
                                    onClick={() => navigate(getCategoryAction(selectedBadge.category).path)}
                                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-black dark:border-white px-4 py-3 text-sm font-bold uppercase tracking-wider text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all"
                                >
                                    {getCategoryAction(selectedBadge.category).label}
                                    <ArrowRight size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BadgesShowcase;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Lock, Sparkles, CheckCircle, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const BadgesShowcase = () => {
    const navigate = useNavigate();
    const [badges, setBadges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'earned', 'locked'

    useEffect(() => {
        fetchBadges();
    }, []);

    const fetchBadges = async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${import.meta.env.VITE_API_BASE_URL}/gamification/badges/all`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setBadges(response.data.badges || []);
            setLoading(false);
        } catch (error) {
            console.error('[Badges] Error:', error);
            setLoading(false);
        }
    };

    const filteredBadges = badges.filter(badge => {
        if (filter === 'earned') return badge.earned;
        if (filter === 'locked') return !badge.earned;
        return true;
    });

    const earnedCount = badges.filter(b => b.earned).length;

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
                                {earnedCount} / {badges.length} Badges Secured
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
                                strokeDashoffset={`${2 * Math.PI * 54 * (1 - earnedCount / badges.length)}`}
                                className="text-black dark:text-white transition-all duration-1000"
                                strokeLinecap="square"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black text-black dark:text-white">
                                {Math.round((earnedCount / badges.length) * 100)}%
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Complete</span>
                        </div>
                    </div>
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
                                {tab === 'locked' && `(${badges.length - earnedCount})`}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Badges Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredBadges.map((badge) => (
                        <div
                            key={badge.badgeId}
                            className={`relative p-8 border-2 transition-all group rounded-3xl ${badge.earned
                                ? 'border-black bg-white dark:border-white dark:bg-zinc-950 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1'
                                : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 opacity-60 grayscale'
                                }`}
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
            </div>
        </div>
    );
};

export default BadgesShowcase;

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, TrendingUp, Lock, Unlock, CheckCircle2, Award, Zap, MapPin } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const SkillTreeOverview = ({ onNavigateToMap }) => {
    const [stats, setStats] = useState(null);
    const [recentProgress, setRecentProgress] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${import.meta.env.VITE_API_BASE_URL}/gamification/profile`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const skillTreeStats = response.data.skillTree || {};
            setStats(skillTreeStats);
            setLoading(false);
        } catch (error) {
            console.error('[SkillTreeOverview] Error fetching stats:', error);
            toast.error('Failed to load skill tree statistics');
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Zap className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="text-center text-slate-400 py-8">
                <p>Unable to load skill tree data</p>
            </div>
        );
    }

    const progressPercentage = stats.progress || 0;
    const unlockedPercentage = stats.totalSkills > 0 
        ? Math.round((stats.unlockedCount / stats.totalSkills) * 100) 
        : 0;

    return (
        <div className="space-y-6">
            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Total Skills */}
                <motion.div
                    className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-4 border border-slate-700"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Total Skills</p>
                            <p className="text-3xl font-bold text-slate-100 mt-2">{stats.totalSkills || 0}</p>
                        </div>
                        <BookOpen className="w-8 h-8 text-blue-400 opacity-30" />
                    </div>
                </motion.div>

                {/* Unlocked Skills */}
                <motion.div
                    className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-4 border border-slate-700"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 300, delay: 0.05 }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Unlocked</p>
                            <p className="text-3xl font-bold text-blue-400 mt-2">{stats.unlockedCount || 0}</p>
                            <p className="text-xs text-slate-500 mt-1">{unlockedPercentage}% discovered</p>
                        </div>
                        <Unlock className="w-8 h-8 text-blue-400 opacity-30" />
                    </div>
                </motion.div>

                {/* Mastered Skills */}
                <motion.div
                    className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-4 border border-slate-700"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Mastered</p>
                            <p className="text-3xl font-bold text-green-400 mt-2">{stats.masteredCount || 0}</p>
                            <p className="text-xs text-slate-500 mt-1">{progressPercentage}% progress</p>
                        </div>
                        <CheckCircle2 className="w-8 h-8 text-green-400 opacity-30" />
                    </div>
                </motion.div>

                {/* Locked Skills */}
                <motion.div
                    className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-4 border border-slate-700"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 300, delay: 0.15 }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Locked</p>
                            <p className="text-3xl font-bold text-slate-500 mt-2">{stats.lockedCount || 0}</p>
                            <p className="text-xs text-slate-500 mt-1">to discover</p>
                        </div>
                        <Lock className="w-8 h-8 text-slate-500 opacity-30" />
                    </div>
                </motion.div>
            </div>

            {/* Overall Progress */}
            <motion.div
                className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-400" />
                        Overall Mastery Progress
                    </h3>
                    <span className="text-2xl font-bold text-blue-400">{progressPercentage}%</span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-3">
                    <div className="w-full h-4 bg-slate-700 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-green-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPercentage}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                        />
                    </div>

                    {/* Milestone indicators */}
                    <div className="flex justify-between text-xs text-slate-500">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                    </div>
                </div>

                {/* Status text */}
                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
                    <p className="text-sm text-blue-200">
                        {progressPercentage === 100
                            ? '🎊 You\'ve mastered all available skills! Keep learning new ones!'
                            : progressPercentage >= 75
                            ? '🚀 You\'re almost there! Keep up the great progress!'
                            : progressPercentage >= 50
                            ? '⚡ Halfway there! Keep practicing to master more skills!'
                            : progressPercentage >= 25
                            ? '🌱 Great start! Unlock and master more skills to progress!'
                            : '📚 Start your skill tree journey by unlocking the first skill!'}
                    </p>
                </div>
            </motion.div>

            {/* CTA Button */}
            <motion.button
                onClick={onNavigateToMap}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 rounded-lg font-semibold text-white flex items-center justify-center gap-3 transition-all shadow-lg hover:shadow-xl"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
            >
                <MapPin className="w-5 h-5" />
                Explore Full Skill Tree Map
                <Zap className="w-5 h-5" />
            </motion.button>

            {/* Info Box */}
            <motion.div
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
            >
                <div className="space-y-2 text-xs text-slate-400">
                    <p className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-600" />
                        Locked skills are hidden until you master their prerequisites
                    </p>
                    <p className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Unlocked skills are available for assessment and practice
                    </p>
                    <p className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Mastered skills contribute to your overall progress
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default SkillTreeOverview;

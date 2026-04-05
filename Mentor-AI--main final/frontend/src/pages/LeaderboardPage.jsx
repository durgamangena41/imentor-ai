// frontend/src/pages/LeaderboardPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Medal, Star, Crown, Loader2, ArrowUp, ArrowDown, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import Card from '../components/core/Card.jsx';
import Badge from '../components/core/Badge.jsx';
import { motion } from 'framer-motion';

const LeaderboardPage = () => {
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const data = await api.getLeaderboard();
                setLeaderboard(data || []);
            } catch (err) {
                console.error("Failed to fetch leaderboard:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchLeaderboard();
    }, []);

    const getRankIcon = (rank) => {
        switch (rank) {
            case 1: return <Crown className="text-yellow-500" size={24} />;
            case 2: return <Medal className="text-slate-400" size={24} />;
            case 3: return <Medal className="text-amber-600" size={24} />;
            default: return <span className="text-lg font-black text-text-muted-light">#{rank}</span>;
        }
    };

    const navigate = useNavigate();

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
                <Loader2 className="animate-spin text-primary w-12 h-12" />
                <p className="text-text-muted-light animate-pulse font-medium">Calculating Rankings...</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 pt-20 max-w-5xl">
            {/* Back Button */}
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 mb-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
                <ArrowLeft size={20} />
                <span>Back</span>
            </button>

            <div className="flex flex-col md:flex-row items-center gap-6 mb-12">
                <div className="p-5 bg-yellow-500/10 rounded-2xl ring-4 ring-yellow-500/5">
                    <Trophy className="text-yellow-600 dark:text-yellow-400" size={48} />
                </div>
                <div className="text-center md:text-left">
                    <h1 className="text-4xl font-black text-text-light dark:text-text-dark tracking-tight mb-2 uppercase">
                        Student Leaderboard
                    </h1>
                    <p className="text-text-muted-light dark:text-text-muted-dark font-medium">
                        The top achievers in the iMentor learning community
                    </p>
                </div>
            </div>

            {/* Top 3 Spotlight */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {leaderboard.slice(0, 3).map((student, idx) => (
                    <motion.div
                        key={student.username}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                    >
                        <Card className={`text-center p-6 border-2 ${idx === 0 ? 'border-yellow-500 bg-yellow-500/5 scale-105 z-10' : 'border-border-light'}`}>
                            <div className="flex justify-center mb-4">
                                {getRankIcon(student.rank)}
                            </div>
                            <h3 className="text-xl font-bold mb-1 truncate">{student.username}</h3>
                            <Badge variant={idx === 0 ? 'primary' : 'secondary'} className="mb-4">LEVEL {student.level}</Badge>
                            <div className="text-3xl font-black text-primary">{student.totalXP} XP</div>
                            <p className="text-[10px] font-black text-text-muted-light uppercase mt-2 tracking-widest">
                                Global Rank #{student.rank}
                            </p>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Ranking Table */}
            <Card className="overflow-hidden border-none shadow-2xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-border-light dark:border-border-dark">
                            <th className="px-6 py-4 text-xs font-black text-text-muted-light uppercase tracking-widest">Rank</th>
                            <th className="px-6 py-4 text-xs font-black text-text-muted-light uppercase tracking-widest">Student</th>
                            <th className="px-6 py-4 text-xs font-black text-text-muted-light uppercase tracking-widest text-right">Level</th>
                            <th className="px-6 py-4 text-xs font-black text-text-muted-light uppercase tracking-widest text-right">Testing Credits</th>
                            <th className="px-6 py-4 text-xs font-black text-text-muted-light uppercase tracking-widest text-right">Total XP</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light dark:divide-border-dark">
                        {leaderboard.map((student) => (
                            <motion.tr
                                key={student.username}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="hover:bg-primary/5 transition-colors group cursor-default"
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${student.rank <= 3 ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-text-muted-light'
                                            }`}>
                                            {student.rank}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div>
                                        <div className="font-bold text-text-light dark:text-text-dark group-hover:text-primary transition-colors">{student.username}</div>
                                        <div className="text-[10px] text-text-muted-light font-medium uppercase">Active Learner</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <Badge variant="outline" className="font-black">LVL {student.level}</Badge>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className="text-sm font-bold text-rose-500">{Math.round(student.testingCredits || 0)}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <span className="text-lg font-black text-primary">{student.totalXP}</span>
                                        <Star size={14} className="text-yellow-500 fill-current" />
                                    </div>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
                {leaderboard.length === 0 && (
                    <div className="p-20 text-center">
                        <Trophy size={48} className="mx-auto text-gray-200 mb-4" />
                        <p className="text-text-muted-light font-medium">No students have earned XP yet. Be the first!</p>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default LeaderboardPage;

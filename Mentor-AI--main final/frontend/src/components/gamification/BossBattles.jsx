import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Swords, Trophy, Clock, X, CheckCircle, XCircle, Sparkles, Award, TrendingUp, Zap, Star, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const BossBattles = () => {
    const navigate = useNavigate();
    const [battles, setBattles] = useState([]);
    const [history, setHistory] = useState([]);
    const [activeBattle, setActiveBattle] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [view, setView] = useState('list'); // 'list', 'battle', 'result'

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('authToken');
            const [battlesRes, historyRes] = await Promise.all([
                axios.get(`${import.meta.env.VITE_API_BASE_URL}/gamification/boss-battles`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                axios.get(`${import.meta.env.VITE_API_BASE_URL}/gamification/boss-battles/history`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            setBattles(battlesRes.data.battles || []);
            setHistory(historyRes.data.history || []);
            setLoading(false);
        } catch (error) {
            console.error('[BossBattles] Error:', error);
            setLoading(false);
        }
    };

    const startBattle = (battle) => {
        setActiveBattle(battle);
        setCurrentQuestion(0);
        setAnswers(new Array(battle.questions.length).fill({ userAnswer: '', timeSpent: 0 }));
        setView('battle');
    };

    const selectAnswer = (answer) => {
        const newAnswers = [...answers];
        const isCorrect = answer === activeBattle.questions[currentQuestion].correctAnswer;
        newAnswers[currentQuestion] = { userAnswer: answer, timeSpent: 10, isCorrect };
        setAnswers(newAnswers);
    };

    const nextQuestion = () => {
        if (currentQuestion < activeBattle.questions.length - 1) {
            setCurrentQuestion(currentQuestion + 1);
        }
    };

    const submitBattle = async () => {
        if (submitting) return; // Prevent duplicate submissions

        setSubmitting(true);
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.post(
                `${import.meta.env.VITE_API_BASE_URL}/gamification/boss-battle/${activeBattle.battleId}/submit`,
                { answers },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const battleResult = response.data;
            setResult(battleResult);
            setView('result');

            // Show success/failure toast with detailed scoring - Monochromatic
            if (battleResult.status === 'completed') {
                toast.custom((t) => (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5, y: 50 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.5, y: 50 }}
                        className="bg-black text-white px-6 py-4 rounded-lg shadow-2xl border border-white/20"
                    >
                        <div className="flex items-start gap-3">
                            <Trophy className="flex-shrink-0 text-white" size={32} />
                            <div>
                                <h3 className="font-black text-xl mb-2 uppercase tracking-wide">Victory Reclaimed</h3>
                                <div className="space-y-1 text-zinc-300">
                                    <p className="flex items-center gap-2">
                                        <TrendingUp size={18} />
                                        <span className="font-semibold text-white">Score: {battleResult.score}%</span>
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <Star size={18} />
                                        <span className="font-semibold text-white">+{battleResult.earnedXP} XP</span>
                                        <span className="text-sm opacity-80">(Total: {battleResult.newXPTotal})</span>
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <Award size={18} />
                                        <span className="font-semibold text-white">Level {battleResult.newLevel}</span>
                                    </p>
                                    {battleResult.earnedBadge && (
                                        <p className="flex items-center gap-2">
                                            <Sparkles size={18} />
                                            <span className="font-semibold text-white">Badge: {battleResult.earnedBadge}</span>
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ), { duration: 6000 });

                // Show level up animation if leveled up - Monochromatic
                if (battleResult.leveledUp) {
                    setTimeout(() => {
                        toast.custom((t) => (
                            <motion.div
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                exit={{ scale: 0, rotate: 180 }}
                                transition={{ type: 'spring', duration: 0.8 }}
                                className="bg-white text-black p-6 rounded-2xl shadow-2xl text-center border-4 border-black"
                            >
                                <Sparkles className="mx-auto mb-2 text-black" size={48} />
                                <h2 className="text-3xl font-black mb-1 tracking-tighter uppercase">LEVEL UP</h2>
                                <p className="text-5xl font-black">{battleResult.newLevel}</p>
                            </motion.div>
                        ), { duration: 4000 });
                    }, 2000);
                }
            } else {
                toast.error(
                    `Battle failed with ${battleResult.score}%. Review the revision plan and try again.`,
                    {
                        duration: 4000,
                        icon: '✖',
                        style: {
                            background: '#000',
                            color: '#fff',
                            border: '1px solid #333'
                        }
                    }
                );
            }

            // Remove the submitted battle from active battles immediately
            setBattles(prevBattles =>
                prevBattles.filter(b => b.battleId !== activeBattle.battleId)
            );

            // Add to history immediately for better UX
            if (battleResult.status === 'completed' || battleResult.status === 'failed') {
                setHistory(prevHistory => [
                    {
                        ...activeBattle,
                        ...battleResult,
                        completedAt: new Date()
                    },
                    ...prevHistory
                ]);
            }

            // Refresh complete data after showing result (reduced to 4 seconds)
            setTimeout(async () => {
                await fetchData();
                setView('list');
                setActiveBattle(null);
                setResult(null);
                setSubmitting(false);
            }, 4000);

        } catch (error) {
            console.error('[BossBattles] Submit error:', error);
            toast.error(error.response?.data?.message || 'Error submitting battle', {
                style: {
                    background: '#000',
                    color: '#fff',
                    border: '1px solid #333'
                }
            });
            setSubmitting(false);
        }
    };

    const getDifficultyColor = (difficulty) => {
        const colors = {
            easy: 'bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600',
            medium: 'bg-zinc-200 text-zinc-900 border-zinc-400 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-500',
            hard: 'bg-zinc-800 text-white border-black dark:bg-zinc-900 dark:text-white dark:border-zinc-500'
        };
        return colors[difficulty] || colors.medium;
    };

    const getDifficultyIcon = (difficulty) => {
        // Using monochromatic symbols instead of colored stars
        const icons = {
            easy: '●',
            medium: '●●',
            hard: '●●●'
        };
        return icons[difficulty] || icons.medium;
    };

    // Battle View
    if (view === 'battle' && activeBattle) {
        const question = activeBattle.questions[currentQuestion];
        const progress = ((currentQuestion + 1) / activeBattle.questions.length) * 100;
        const allAnswered = answers.every(a => a.userAnswer);

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-black overflow-y-auto scrollbar-thin scrollbar-thumb-black scrollbar-track-zinc-100 dark:scrollbar-thumb-white dark:scrollbar-track-zinc-900 py-10 px-4">
                <div className="max-w-3xl mx-auto flex flex-col justify-center min-h-[80vh]">
                    <div className="bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl p-8 border-2 border-black dark:border-zinc-700">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-black text-white dark:bg-white dark:text-black rounded-lg">
                                    <Swords size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-black dark:text-white uppercase tracking-tight">
                                        Boss Battle: <span className="underline decoration-2 underline-offset-4">{activeBattle.targetWeakness}</span>
                                    </h2>
                                    <div className="mt-1">
                                        <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-widest border ${getDifficultyColor(activeBattle.difficulty)}`}>
                                            {activeBattle.difficulty}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to exit this battle? Your progress will be lost.')) {
                                        setView('list');
                                        setActiveBattle(null);
                                        setCurrentQuestion(0);
                                        setAnswers([]);
                                    }
                                }}
                                className="text-zinc-400 hover:text-black dark:hover:text-white transition-colors p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full"
                                title="Exit Battle"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Boss Health Bar - Monochromatic */}
                        <div className="mb-10 p-5 bg-zinc-100 dark:bg-zinc-900 border-2 border-black dark:border-zinc-600 relative rounded-2xl">
                            <div className="flex justify-between items-end mb-3 relative z-10 text-black dark:text-white">
                                <div>
                                    <h3 className="text-xl font-black italic tracking-tighter uppercase">
                                        {activeBattle.bossName || 'The Knowledge Guardian'}
                                    </h3>
                                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                                        "{activeBattle.bossTaunt}"
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="text-2xl font-black">HP {Math.max(0, activeBattle.questions.length - answers.filter(a => a.userAnswer && a.isCorrect === false).length)}/{activeBattle.questions.length}</span>
                                </div>
                            </div>
                            <div className="w-full bg-white dark:bg-zinc-950 h-5 border border-black dark:border-zinc-500 overflow-hidden relative rounded-full">
                                {/* Striped Background Pattern */}
                                <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_50%,#000_50%,#000_75%,transparent_75%,transparent)] bg-[length:20px_20px]"></div>

                                <motion.div
                                    className="h-full bg-black dark:bg-white"
                                    initial={{ width: "100%" }}
                                    animate={{ width: `${(Math.max(0, activeBattle.questions.length - answers.filter(a => a.userAnswer && a.isCorrect === false).length) / activeBattle.questions.length) * 100}%` }}
                                    transition={{ type: "spring", stiffness: 50 }}
                                />
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-8">
                            <div className="flex justify-between text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                                <span>Question {currentQuestion + 1} / {activeBattle.questions.length}</span>
                                <span>{Math.round(progress)}% Complete</span>
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                                <div
                                    className="bg-black dark:bg-white h-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>

                        {/* Question */}
                        <div className="mb-8">
                            <p className="text-xl font-serif font-medium text-black dark:text-zinc-100 mb-6 leading-relaxed">
                                {question.questionText}
                            </p>

                            {/* Options */}
                            <div className="space-y-3">
                                {question.options.map((option, index) => (
                                    <button
                                        key={index}
                                        onClick={() => selectAnswer(option)}
                                        className={`w-full text-left p-5 border-2 transition-all group rounded-2xl ${answers[currentQuestion]?.userAnswer === option
                                            ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                                            : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 text-zinc-700 dark:text-zinc-300'
                                            }`}
                                    >
                                        <div className="flex items-start">
                                            <span className={`font-mono font-bold mr-4 px-2 border rounded-md ${answers[currentQuestion]?.userAnswer === option ? 'border-white text-white dark:border-black dark:text-black' : 'border-black text-black dark:border-white dark:text-white'}`}>
                                                {String.fromCharCode(65 + index)}
                                            </span>
                                            <span className="font-medium">{option}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Navigation */}
                        <div className="flex justify-between items-center pt-6 border-t border-zinc-100 dark:border-zinc-800">
                            <button
                                onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                                disabled={currentQuestion === 0}
                                className="px-6 py-2 border border-black dark:border-white text-black dark:text-white font-bold uppercase tracking-wider text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-xl"
                            >
                                Previous
                            </button>

                            <div className="flex gap-3">
                                {currentQuestion < activeBattle.questions.length - 1 && (
                                    <button
                                        onClick={nextQuestion}
                                        disabled={!answers[currentQuestion]?.userAnswer}
                                        className="px-8 py-2 bg-black text-white dark:bg-white dark:text-black font-bold uppercase tracking-wider text-xs hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity rounded-xl"
                                    >
                                        Next
                                    </button>
                                )}

                                {currentQuestion === activeBattle.questions.length - 1 && (
                                    <button
                                        onClick={submitBattle}
                                        disabled={!allAnswered || submitting}
                                        className="px-8 py-2 bg-black text-white dark:bg-white dark:text-black font-bold uppercase tracking-wider text-xs hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity flex items-center gap-2 rounded-xl"
                                    >
                                        {submitting ? (
                                            <>
                                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-zinc-500 border-t-white" />
                                                Processing
                                            </>
                                        ) : (
                                            <>
                                                <Trophy size={14} />
                                                Submit Battle
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Result View
    if (view === 'result' && result) {
        const passed = result.status === 'completed';

        return (
            <div className="fixed inset-0 z-50 bg-zinc-50 dark:bg-black overflow-y-auto scrollbar-thin scrollbar-thumb-black scrollbar-track-zinc-100 dark:scrollbar-thumb-white dark:scrollbar-track-zinc-900">
                <div className="min-h-screen flex flex-col justify-center items-center p-6">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className={`w-full max-w-2xl p-10 border-4 relative overflow-hidden bg-white dark:bg-zinc-950 shadow-2xl rounded-3xl ${passed
                            ? 'border-black dark:border-white'
                            : 'border-zinc-400 dark:border-zinc-600'
                            }`}
                    >
                        {/* Close Button */}
                        <button
                            onClick={async () => {
                                await fetchData();
                                setView('list');
                                setActiveBattle(null);
                                setResult(null);
                                setSubmitting(false);
                            }}
                            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-black dark:hover:text-white transition-colors z-20 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full"
                        >
                            <X size={24} />
                        </button>

                        {/* Confetti effect for victory - Monochromatic */}
                        {passed && (
                            <div className="absolute inset-0 pointer-events-none">
                                {[...Array(30)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{
                                            x: '50%',
                                            y: '50%',
                                            opacity: 1,
                                            scale: Math.random() * 0.5 + 0.5
                                        }}
                                        animate={{
                                            x: `${Math.random() * 100}%`,
                                            y: `${Math.random() * 100}%`,
                                            opacity: 0,
                                            rotate: Math.random() * 360
                                        }}
                                        transition={{ duration: 2.5, delay: i * 0.05 }}
                                        className="absolute w-2 h-2 bg-black dark:bg-white"
                                        style={{
                                            clipPath: i % 2 === 0 ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'circle(50% at 50% 50%)'
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        <motion.div
                            animate={{
                                scale: passed ? [1, 1.1, 1] : [1, 0.95, 1],
                                rotate: passed ? [0, 5, -5, 0] : 0
                            }}
                            transition={{ duration: 0.5 }}
                            className="mb-8"
                        >
                            {passed ? (
                                <Trophy className="mx-auto text-black dark:text-white" size={80} strokeWidth={1.5} />
                            ) : (
                                <XCircle className="mx-auto text-zinc-400 dark:text-zinc-600" size={80} strokeWidth={1.5} />
                            )}
                        </motion.div>

                        <h2 className="text-4xl font-black text-center mb-2 uppercase tracking-tighter text-black dark:text-white leading-none">
                            {passed ? 'Victory Reclaimed' : 'Defeat'}
                        </h2>
                        <p className="text-center text-zinc-500 uppercase tracking-widest text-xs font-bold mb-8">
                            {passed ? 'Knowledge Synchronized' : 'Synchronization Failed'}
                        </p>

                        <div className="bg-zinc-100 dark:bg-zinc-900 p-8 mb-8 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                            <div className="flex justify-center items-baseline gap-1 mb-6">
                                <span className="text-6xl font-black text-black dark:text-white">{result.score}</span>
                                <span className="text-2xl font-bold text-zinc-400">%</span>
                            </div>

                            <div className="grid grid-cols-2 gap-px bg-zinc-300 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-700">
                                <div className="text-center bg-white dark:bg-zinc-900 p-4">
                                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Correct</p>
                                    <p className="text-2xl font-bold text-black dark:text-white">
                                        {result.correctAnswers}/{result.totalQuestions}
                                    </p>
                                </div>
                                <div className="text-center bg-white dark:bg-zinc-900 p-4">
                                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Pass Mark</p>
                                    <p className="text-2xl font-bold text-black dark:text-white">60%</p>
                                </div>
                            </div>

                            {passed && (
                                <div className="space-y-0 mt-8">
                                    <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                                        <span className="flex items-center gap-3 text-black dark:text-white font-bold uppercase text-sm tracking-wider">
                                            <Star size={18} />
                                            XP Earned
                                        </span>
                                        <span className="text-xl font-black text-black dark:text-white">
                                            +{result.earnedXP}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                                        <span className="flex items-center gap-3 text-black dark:text-white font-bold uppercase text-sm tracking-wider">
                                            <TrendingUp size={18} />
                                            Total XP
                                        </span>
                                        <span className="text-xl font-black text-black dark:text-white">
                                            {result.newXPTotal}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                                        <span className="flex items-center gap-3 text-black dark:text-white font-bold uppercase text-sm tracking-wider">
                                            <Award size={18} />
                                            Level
                                        </span>
                                        <span className="text-xl font-black text-black dark:text-white flex items-center gap-2">
                                            {result.newLevel}
                                            {result.leveledUp && (
                                                <span className="text-xs bg-black text-white px-2 py-0.5 rounded-full dark:bg-white dark:text-black">UP</span>
                                            )}
                                        </span>
                                    </div>

                                    {result.earnedBadge && (
                                        <div className="flex items-center justify-between p-4 bg-black text-white dark:bg-white dark:text-black mt-2">
                                            <span className="flex items-center gap-3 font-bold uppercase text-sm tracking-wider">
                                                <Sparkles size={18} />
                                                Badge
                                            </span>
                                            <span className="text-lg font-black uppercase">
                                                {result.earnedBadge}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {result.revisionPlan && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                className="mt-6 p-6 bg-zinc-50 dark:bg-zinc-900 border-l-4 border-black dark:border-white text-left"
                            >
                                <h3 className="font-bold mb-3 flex items-center gap-2 text-black dark:text-white uppercase tracking-wider text-sm">
                                    <Zap className="text-black dark:text-white" size={16} fill="currentColor" />
                                    AI Revision Protocol
                                </h3>
                                <p className="text-sm font-serif text-zinc-700 dark:text-zinc-300 mb-4 leading-relaxed italic">
                                    "{result.revisionPlan.aiSuggestions}"
                                </p>
                                {result.revisionPlan.recommendedTopics && (
                                    <div>
                                        <p className="text-xs font-bold text-zinc-500 uppercase mb-2 tracking-widest">Focus Vectors:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {result.revisionPlan.recommendedTopics.map((topic, i) => (
                                                <span key={i} className="px-3 py-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-black dark:text-white text-xs font-medium uppercase">
                                                    {topic}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        <button
                            onClick={async () => {
                                await fetchData();
                                setView('list');
                                setActiveBattle(null);
                                setResult(null);
                                setSubmitting(false);
                            }}
                            className="mt-8 w-full px-8 py-4 bg-black text-white dark:bg-white dark:text-black hover:opacity-80 transition-opacity font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-3"
                        >
                            <Swords size={18} />
                            Return to Hub
                        </button>

                        <p className="text-[10px] text-zinc-400 mt-4 flex items-center justify-center gap-1 uppercase tracking-widest">
                            <Clock size={10} />
                            Auto-redirecting
                        </p>
                    </motion.div>
                </div>
            </div>
        );
    }

    // List View
    return (
        <div className="min-h-screen bg-white dark:bg-black py-8 px-4 overflow-y-auto scrollbar-thin scrollbar-thumb-black scrollbar-track-zinc-100 dark:scrollbar-thumb-white dark:scrollbar-track-zinc-900">
            <div className="max-w-7xl mx-auto">
                {/* Header Section */}
                <div className="mb-12 border-b border-black dark:border-white pb-6">
                    <div className="flex items-center gap-6 mb-4">
                        <button
                            onClick={() => navigate('/')}
                            className="p-3 bg-white dark:bg-black border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors rounded-full"
                            title="Back to Main"
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <h1 className="text-5xl font-black text-black dark:text-white uppercase tracking-tighter flex items-center gap-4 mb-2">
                                <div className="p-2 bg-black text-white dark:bg-white dark:text-black rounded-lg">
                                    <Swords size={32} />
                                </div>
                                Boss Battles
                            </h1>
                            <p className="text-zinc-600 dark:text-zinc-400 font-serif italic text-lg ml-1">
                                "Challenge the guardians. Prove your mastery."
                            </p>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex flex-wrap gap-4 mb-10">
                    <button
                        className="px-8 py-3 bg-black text-white dark:bg-white dark:text-black font-bold uppercase tracking-widest text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-2 rounded-xl"
                    >
                        <Swords size={18} />
                        Active Battles
                    </button>
                    <button
                        onClick={() => document.querySelector('.battle-history')?.scrollIntoView({ behavior: 'smooth' })}
                        className="px-8 py-3 bg-white text-black border-2 border-black dark:bg-black dark:text-white dark:border-white font-bold uppercase tracking-widest text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all flex items-center gap-2 rounded-xl"
                    >
                        <Trophy size={18} />
                        Battle History
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="ml-auto px-6 py-3 border-2 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-black hover:text-black dark:hover:border-white dark:hover:text-white transition-all font-bold uppercase tracking-wider text-xs flex items-center gap-2 rounded-xl"
                    >
                        Reload
                    </button>
                </div>

                {/* Active Battles */}
                <div className="mb-16 active-battles">
                    <h2 className="text-2xl font-black text-black dark:text-white mb-6 uppercase tracking-tight flex items-center gap-3">
                        <span className="w-8 h-1 bg-black dark:bg-white inline-block"></span>
                        Active Challenges
                    </h2>

                    {battles.length === 0 ? (
                        <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-3xl p-16 text-center">
                            <div className="inline-flex items-center justify-center w-20 h-20 bg-zinc-100 dark:bg-zinc-900 rounded-full mb-6 text-zinc-400">
                                <Swords size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-black dark:text-white mb-2 uppercase tracking-wide">
                                All Clear
                            </h3>
                            <p className="text-zinc-500 font-serif">
                                No guardians detected. Check back at 1000 hours.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {battles.map((battle) => (
                                <div
                                    key={battle.battleId}
                                    className="bg-white dark:bg-zinc-950 border-4 border-black dark:border-white group cursor-pointer hover:-translate-y-2 transition-transform duration-300 rounded-3xl overflow-hidden"
                                    onClick={() => startBattle(battle)}
                                >
                                    {/* Battle Header */}
                                    <div className="bg-black text-white dark:bg-white dark:text-black p-6 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-20">
                                            <Swords size={60} />
                                        </div>
                                        <div className="flex items-center justify-between mb-3 relative z-10">
                                            <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border border-current ${battle.difficulty === 'hard' ? 'bg-white text-black dark:bg-black dark:text-white' : ''
                                                }`}>
                                                {getDifficultyIcon(battle.difficulty)} {battle.difficulty}
                                            </span>
                                        </div>
                                        <h3 className="text-2xl font-black uppercase leading-none relative z-10">
                                            {battle.targetWeakness}
                                        </h3>
                                        <div className="mt-2 flex items-center gap-1 font-mono text-sm opacity-80">
                                            <span>REWARD:</span>
                                            <span className="font-bold">{battle.xpReward || (battle.difficulty === 'hard' ? 100 : 50)} XP</span>
                                        </div>
                                    </div>

                                    {/* Battle Content */}
                                    <div className="p-6">
                                        <div className="flex items-center justify-between mb-6 text-xs font-bold uppercase tracking-wider text-zinc-500">
                                            <span>
                                                {battle.totalQuestions} Questions
                                            </span>
                                            <span>
                                                EXP: {new Date(battle.expiresAt).toLocaleDateString()}
                                            </span>
                                        </div>

                                        {/* Action Button */}
                                        <button
                                            className="w-full bg-white dark:bg-black text-black dark:text-white border-2 border-black dark:border-white py-3 px-4 font-bold uppercase tracking-wider hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors flex items-center justify-center gap-2 rounded-xl"
                                        >
                                            Engage
                                            <ArrowLeft size={16} className="rotate-180" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Battle History */}
                <div className="battle-history">
                    <h2 className="text-2xl font-black text-black dark:text-white mb-6 uppercase tracking-tight flex items-center gap-3">
                        <span className="w-8 h-1 bg-black dark:bg-white inline-block"></span>
                        Battle History
                    </h2>

                    {history.length === 0 ? (
                        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center rounded-3xl">
                            <p className="text-zinc-500 uppercase tracking-widest text-xs font-bold">No records found</p>
                        </div>
                    ) : (
                        <div className="border border-black dark:border-white rounded-3xl overflow-hidden">
                            {history.map((battle, index) => (
                                <div
                                    key={battle.battleId}
                                    className={`p-5 flex flex-col md:flex-row justify-between items-center hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors ${index !== history.length - 1 ? 'border-b border-zinc-200 dark:border-zinc-800' : ''
                                        }`}
                                >
                                    <div className="flex items-center gap-4 mb-4 md:mb-0 w-full md:w-auto">
                                        <div className={`p-2 border-2 rounded-full ${battle.status === 'completed'
                                            ? 'border-black text-black dark:border-white dark:text-white'
                                            : 'border-zinc-300 text-zinc-300 dark:border-zinc-700 dark:text-zinc-700'
                                            }`}>
                                            {battle.status === 'completed' ? (
                                                <CheckCircle size={20} />
                                            ) : (
                                                <XCircle size={20} />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-bold text-black dark:text-white uppercase tracking-wide">{battle.targetWeakness}</p>
                                            <p className="text-xs text-zinc-500 font-mono">
                                                {new Date(battle.completedAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Score</p>
                                            <span className="font-black text-xl text-black dark:text-white">{battle.score}%</span>
                                        </div>
                                        {battle.earnedXP > 0 && (
                                            <div className="text-right">
                                                <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">XP</p>
                                                <p className="font-bold text-black dark:text-white">+{battle.earnedXP}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BossBattles;

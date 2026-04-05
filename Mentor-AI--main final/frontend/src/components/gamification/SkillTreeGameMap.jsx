import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Lock, Star, CheckCircle2, Play, Trophy, Zap,
    ChevronLeft, ChevronRight, BookOpen, Target, Sparkles,
    ArrowLeft, Loader2, Crown, Flame, Gift, Medal
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import api from '../../services/api';

const SkillTreeGameMap = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const scrollRef = useRef(null);
    const canvasRef = useRef(null); // Canvas for starfield
    const starsRef = useRef([]); // Ref to hold star data
    const animationFrameRef = useRef(); // Ref for animation loop

    // Initialize stars
    useEffect(() => {
        if (!canvasRef.current) return;

        // Create stars only if empty
        if (starsRef.current.length === 0) {
            for (let i = 0; i < 100; i++) {
                starsRef.current.push({
                    x: Math.random() * window.innerWidth,
                    y: Math.random() * window.innerHeight,
                    size: Math.random() * 2,
                    opacity: Math.random(),
                    twinkleSpeed: (Math.random() - 0.5) * 0.03
                });
            }
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const render = () => {
            if (!canvas) return;

            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;

            // DPI scaling
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            // Clear
            ctx.clearRect(0, 0, width, height);

            // Draw stars
            starsRef.current.forEach(star => {
                star.opacity += star.twinkleSpeed;
                if (star.opacity > 1 || star.opacity < 0.1) star.twinkleSpeed = -star.twinkleSpeed;

                ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                ctx.fill();
            });

            animationFrameRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        }
    }, []);

    const { topic, assessmentResult, answers, gameId, savedLevels } = location.state || {};

    const [levels, setLevels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedLevel, setSelectedLevel] = useState(null);
    const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
    const [showLevelModal, setShowLevelModal] = useState(false);
    const [playingLevel, setPlayingLevel] = useState(null);
    const [levelQuestions, setLevelQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [score, setScore] = useState(0);
    const [finalScore, setFinalScore] = useState(0); // Store final score for results display
    const [showResults, setShowResults] = useState(false);
    const [currentGameId, setCurrentGameId] = useState(gameId || null);

    useEffect(() => {
        if (topic) {
            if (savedLevels && savedLevels.length > 0) {
                // Use saved levels from database
                setLevels(savedLevels);
                const firstUnlocked = savedLevels.findIndex(l => l.status === 'unlocked');
                if (firstUnlocked !== -1) {
                    setCurrentLevelIndex(firstUnlocked);
                }
                setLoading(false);
            } else {
                // Generate new levels
                generateLevels();
            }
        } else {
            // No topic provided, redirect back
            navigate('/gamification/skill-tree');
        }
    }, [topic]);

    // Auto-save progress when component unmounts or levels change
    useEffect(() => {
        // Save progress to localStorage as backup
        if (levels.length > 0 && topic) {
            const progressBackup = {
                topic,
                assessmentResult,
                levels,
                gameId: currentGameId,
                lastSaved: new Date().toISOString()
            };
            localStorage.setItem(`skillTree_backup_${topic}`, JSON.stringify(progressBackup));
        }
    }, [levels, currentGameId]);

    const generateLevels = async () => {
        setLoading(true);
        try {
            const response = await api.generateLevels({
                topic,
                assessmentResult,
                answers
            });

            const generatedLevels = response.levels || [];

            if (generatedLevels.length === 0) {
                console.warn('[SkillTreeGameMap] API returned empty levels, using fallback');
                generateFallbackLevels();
                return;
            }

            setLevels(generatedLevels);

            // Find the first unlocked level
            const firstUnlocked = generatedLevels.findIndex(l => l.status === 'unlocked');
            if (firstUnlocked !== -1) {
                setCurrentLevelIndex(firstUnlocked);
            }

            // Save the game with generated levels
            await saveGameProgress(generatedLevels);
        } catch (error) {
            console.error('[SkillTreeGameMap] Error generating levels:', error.response?.data || error.message);
            // Use fallback levels silently - no error toast needed
            console.info('[SkillTreeGameMap] Using fallback level generation');
            generateFallbackLevels();
        } finally {
            setLoading(false);
        }
    };

    const saveGameProgress = async (levelsData) => {
        try {
            const response = await api.saveGame({
                topic,
                assessmentResult,
                levels: levelsData
            });
            if (response.game?._id) {
                setCurrentGameId(response.game._id);
                console.log('[SkillTreeGameMap] Game saved with ID:', response.game._id);
            }
        } catch (error) {
            console.error('[SkillTreeGameMap] Error saving game:', error);
            toast.error('Failed to save game progress');
        }
    };

    const generateFallbackLevels = () => {
        const knowledgeLevel = assessmentResult?.level || 'Beginner';
        const totalLevels = knowledgeLevel === 'Expert' ? 20 :
            knowledgeLevel === 'Advanced' ? 25 :
                knowledgeLevel === 'Intermediate' ? 30 : 35;

        const stages = [
            'Introduction to', 'Basics of', 'Understanding', 'Exploring', 'Learning',
            'Fundamentals of', 'Core Concepts', 'Key Principles', 'Essential', 'Building Blocks',
            'Intermediate', 'Developing', 'Practicing', 'Applying', 'Working with',
            'Advanced', 'Deep Dive into', 'Mastering', 'Expert Level', 'Professional'
        ];

        const suffixes = [
            'Concepts', 'Techniques', 'Methods', 'Approaches', 'Skills',
            'Strategies', 'Applications', 'Patterns', 'Practices', 'Principles'
        ];

        const fallbackLevels = Array.from({ length: totalLevels }, (_, i) => {
            const stageIdx = Math.floor(i / 5) % stages.length;
            const suffixIdx = i % suffixes.length;
            return {
                id: i + 1,
                name: `${stages[stageIdx]} ${topic} ${suffixes[suffixIdx]}`,
                description: `Master ${topic} - Stage ${Math.floor(i / 5) + 1}`,
                difficulty: i < Math.floor(totalLevels * 0.3) ? 'easy' :
                    i < Math.floor(totalLevels * 0.7) ? 'medium' : 'hard',
                status: i === 0 ? 'unlocked' : 'locked',
                stars: 0,
                xp: (i + 1) * 10
            };
        });

        setLevels(fallbackLevels);
        setCurrentLevelIndex(0);

        // Save fallback levels to database
        saveGameProgress(fallbackLevels);
    };

    const handleLevelClick = (level, index) => {
        if (level.status === 'locked') {
            toast.error('Complete previous levels to unlock this one!');
            return;
        }
        setSelectedLevel(level);
        setShowLevelModal(true);
    };

    const startLevel = async () => {
        if (!selectedLevel) return;

        setShowLevelModal(false);
        setPlayingLevel(selectedLevel);
        setCurrentQuestionIndex(0);
        setScore(0);
        setSelectedAnswer(null);
        setShowResults(false);

        // Fetch questions for this level
        await fetchLevelQuestions(selectedLevel);
    };

    const handleAnswerSelect = (index) => {
        if (selectedAnswer !== null) return;
        setSelectedAnswer(index);

        const isCorrect = index === levelQuestions[currentQuestionIndex].correctIndex;
        const newScore = isCorrect ? score + 1 : score;

        if (isCorrect) {
            setScore(newScore);
        }

        // Move to next question after delay
        setTimeout(() => {
            if (currentQuestionIndex < levelQuestions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
            } else {
                // Level complete - pass the final score directly
                completeLevelHandler(newScore);
            }
        }, 1500);
    };

    const completeLevelHandler = async (completedScore) => {
        const totalQuestions = levelQuestions.length;
        const percentage = (completedScore / totalQuestions) * 100;
        const earnedStars = percentage >= 90 ? 3 : percentage >= 70 ? 2 : percentage >= 50 ? 1 : 0;

        setFinalScore(completedScore); // Store for results display
        setShowResults(true);

        // Calculate updated levels
        const updatedLevels = levels.map((level, idx) => {
            if (level.id === playingLevel.id) {
                return { ...level, status: 'completed', stars: Math.max(level.stars, earnedStars) };
            }
            // Unlock next level
            if (idx === levels.findIndex(l => l.id === playingLevel.id) + 1 && level.status === 'locked') {
                return { ...level, status: 'unlocked' };
            }
            return level;
        });

        // Update level status
        if (earnedStars > 0) {
            setLevels(updatedLevels);

            // Save progress to the game document if we have a gameId
            if (currentGameId) {
                try {
                    const response = await api.saveLevelProgress(currentGameId, playingLevel.id, {
                        stars: earnedStars,
                        score: completedScore,
                        totalQuestions,
                        status: 'completed'
                    });
                    // Show XP earned if any
                    if (response.xpEarned > 0) {
                        toast.success(`+${response.xpEarned} XP earned!`, { icon: '⭐' });
                    }
                } catch (error) {
                    console.error('Error saving level progress to game:', error);
                    toast.error('Failed to save progress');
                }
            } else {
                // Save as new game if no gameId
                await saveGameProgress(updatedLevels);
            }

            // Also save to gamification profile for XP
            try {
                await api.completeLevel({
                    topic,
                    levelId: playingLevel.id,
                    stars: earnedStars,
                    score: completedScore,
                    totalQuestions
                });
            } catch (error) {
                console.error('Error saving level progress:', error);
            }
        }
    };

    const closeLevel = () => {
        setPlayingLevel(null);
        setLevelQuestions([]);
        setShowResults(false);
        setScore(0);
        setFinalScore(0);
        setSelectedAnswer(null);
    };

    const goToNextLevel = () => {
        // Find current level index and get next level
        const currentIndex = levels.findIndex(l => l.id === playingLevel.id);
        const nextLevel = levels[currentIndex + 1];

        if (nextLevel && nextLevel.status === 'unlocked') {
            // Reset current level state
            setLevelQuestions([]);
            setShowResults(false);
            setScore(0);
            setFinalScore(0);
            setCurrentQuestionIndex(0);
            setSelectedAnswer(null);

            // Set next level as selected and start it
            setSelectedLevel(nextLevel);
            setPlayingLevel(nextLevel);

            // Fetch questions for next level
            fetchLevelQuestions(nextLevel);
        } else {
            // No next level or it's locked - go back to map
            closeLevel();
        }
    };

    const fetchLevelQuestions = async (level) => {
        try {
            const response = await api.getLevelQuestions({
                topic,
                levelId: level.id,
                levelName: level.name,
                difficulty: level.difficulty
            });
            setLevelQuestions(response.questions || []);
        } catch (error) {
            console.error('[SkillTreeGameMap] Error fetching questions:', error);
            // Generate fallback questions
            const fallbackQuestions = generateFallbackQuestions(level);
            setLevelQuestions(fallbackQuestions);
        }
    };

    const generateFallbackQuestions = (level) => {
        return Array.from({ length: 5 }, (_, i) => ({
            question: `Question ${i + 1} about ${level.name}`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctIndex: Math.floor(Math.random() * 4)
        }));
    };

    // Get path positions for candy crush style layout - CURVED PATH
    const getLevelPosition = (index, total) => {
        const amplitude = 35; // How far left/right the zigzag goes
        const verticalSpacing = 100; // Space between levels vertically

        // Create a smooth sine wave pattern
        const x = 50 + Math.sin(index * 0.8) * amplitude;
        const y = 60 + (index * verticalSpacing);

        return { x, y, index };
    };

    // Get level colors based on difficulty - MONOCHROME/ZINC THEME
    const getLevelColors = (level, index) => {
        if (level.status === 'completed') {
            return {
                bg: 'bg-white',
                style: { background: 'radial-gradient(circle at 30% 30%, #ffffff, #d4d4d8)' },
                shadow: 'shadow-[0_0_20px_rgba(255,255,255,0.4)]',
                glow: 'bg-white'
            };
        }
        if (level.status === 'unlocked') {
            // Variations of Zinc for unlocked
            const colors = [
                {
                    bg: 'bg-zinc-800',
                    style: { background: 'radial-gradient(circle at 30% 30%, #3f3f46, #18181b)' },
                    shadow: 'shadow-zinc-800/50',
                    glow: 'bg-zinc-400'
                },
                {
                    bg: 'bg-zinc-800',
                    style: { background: 'radial-gradient(circle at 30% 30%, #52525b, #18181b)' }, // Slightly lighter variant
                    shadow: 'shadow-zinc-800/50',
                    glow: 'bg-zinc-400'
                },
            ];
            return colors[index % colors.length];
        }
        // Locked
        return {
            bg: 'bg-black',
            style: { background: 'radial-gradient(circle at 30% 30%, #27272a, #000000)' },
            shadow: 'shadow-none',
            glow: 'bg-zinc-800'
        };
    };

    const renderStars = (count, size = 'sm') => {
        const sizeClass = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
        return (
            <div className="flex gap-0.5">
                {[1, 2, 3].map(star => (
                    <Star
                        key={star}
                        className={`${sizeClass} ${star <= count ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`}
                    />
                ))}
            </div>
        );
    };

    // Capitalize first letter of each word
    const formatTopic = (str) => {
        if (!str) return '';
        return str.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center"
                >
                    <Loader2 className="w-16 h-16 text-white animate-spin mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Building Your Skill Tree</h2>
                    <p className="text-zinc-500">Personalizing levels for {topic}...</p>
                </motion.div>
            </div>
        );
    }

    // Show error state if API failed
    // Playing a level
    if (playingLevel && levelQuestions.length > 0) {
        const currentQuestion = levelQuestions[currentQuestionIndex];

        if (showResults) {
            const percentage = (finalScore / levelQuestions.length) * 100;
            const earnedStars = percentage >= 90 ? 3 : percentage >= 70 ? 2 : percentage >= 50 ? 1 : 0;

            return (
                <div className="min-h-screen bg-black flex items-center justify-center p-6">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-zinc-900 rounded-3xl p-8 max-w-md w-full text-center border border-zinc-800"
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring' }}
                            className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${earnedStars >= 2 ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)]' :
                                earnedStars === 1 ? 'bg-zinc-700 text-white' :
                                    'bg-zinc-900 border-2 border-zinc-700 text-zinc-500'
                                }`}
                        >
                            {earnedStars >= 2 ? (
                                <Trophy className="w-12 h-12" />
                            ) : earnedStars === 1 ? (
                                <CheckCircle2 className="w-12 h-12" />
                            ) : (
                                <Target className="w-12 h-12" />
                            )}
                        </motion.div>

                        <h2 className="text-3xl font-bold text-white mb-2">
                            {earnedStars >= 2 ? 'Excellent!' : earnedStars === 1 ? 'Good Job!' : 'Keep Trying!'}
                        </h2>

                        <p className="text-zinc-400 mb-4">{playingLevel.name} Complete</p>

                        <div className="flex justify-center mb-6">
                            {renderStars(earnedStars, 'lg')}
                        </div>

                        <div className="bg-zinc-950 rounded-xl p-4 mb-6 border border-zinc-800">
                            <div className="flex justify-between text-sm text-zinc-500 mb-2 font-mono uppercase">
                                <span>Score</span>
                                <span className="text-white font-bold">{finalScore}/{levelQuestions.length}</span>
                            </div>
                            <div className="flex justify-between text-sm text-zinc-500 mb-2 font-mono uppercase">
                                <span>Accuracy</span>
                                <span className="text-white font-bold">{Math.round(percentage)}%</span>
                            </div>
                            {playingLevel.status !== 'completed' && earnedStars > 0 && (
                                <div className="flex justify-between text-sm text-zinc-500 font-mono uppercase">
                                    <span>XP Earned</span>
                                    <span className="text-white font-bold">+{earnedStars === 3 ? 10 : earnedStars === 2 ? 8 : 5} XP</span>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <motion.button
                                onClick={closeLevel}
                                className="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-white transition-colors"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                Back to Map
                            </motion.button>
                            {earnedStars === 0 ? (
                                // No stars - show Retry button
                                <motion.button
                                    onClick={() => {
                                        setShowResults(false);
                                        setCurrentQuestionIndex(0);
                                        setScore(0);
                                        setFinalScore(0);
                                        setSelectedAnswer(null);
                                    }}
                                    className="flex-1 px-6 py-3 bg-white hover:bg-zinc-200 text-black rounded-xl font-bold"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    Retry
                                </motion.button>
                            ) : (
                                // At least 1 star - show Next Level button
                                <motion.button
                                    onClick={goToNextLevel}
                                    className="flex-1 px-6 py-3 bg-white hover:bg-zinc-200 text-black rounded-xl font-bold"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    Next Level →
                                </motion.button>
                            )}
                        </div>
                    </motion.div>
                </div>
            );
        }

        return (
            <div className="min-h-screen max-h-screen overflow-hidden bg-black p-6">
                <div className="max-w-2xl mx-auto h-full flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4 flex-shrink-0">
                        <button
                            onClick={closeLevel}
                            className="p-2 rounded-lg bg-zinc-900 text-zinc-500 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-white">{playingLevel.name}</h3>
                            <p className="text-sm text-zinc-500">{topic}</p>
                        </div>
                        <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1 border border-zinc-800">
                            <Zap className="w-4 h-4 text-white fill-white" />
                            <span className="text-white font-bold">{score}</span>
                        </div>
                    </div>

                    {/* Progress */}
                    <div className="mb-4 flex-shrink-0">
                        <div className="flex justify-between text-sm text-zinc-500 mb-2 font-mono uppercase">
                            <span>Question {currentQuestionIndex + 1} of {levelQuestions.length}</span>
                        </div>
                        <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-white"
                                initial={{ width: 0 }}
                                animate={{ width: `${((currentQuestionIndex + 1) / levelQuestions.length) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Question Card - Scrollable */}
                    <div className="flex-1 overflow-y-auto pr-2 game-scrollbar">
                        <motion.div
                            key={currentQuestionIndex}
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-4"
                        >
                            <h2 className="text-xl font-bold text-white mb-6 leading-relaxed">
                                {currentQuestion.question}
                            </h2>

                            <div className="space-y-3">
                                {currentQuestion.options.map((option, idx) => {
                                    const isSelected = selectedAnswer === idx;
                                    const isCorrect = idx === currentQuestion.correctIndex;
                                    const showResult = selectedAnswer !== null;

                                    return (
                                        <motion.button
                                            key={idx}
                                            onClick={() => handleAnswerSelect(idx)}
                                            disabled={selectedAnswer !== null}
                                            className={`w-full p-4 rounded-xl text-left transition-all ${showResult
                                                ? isCorrect
                                                    ? 'bg-white text-black font-bold'
                                                    : isSelected
                                                        ? 'bg-zinc-800 border-2 border-zinc-700 text-zinc-500 line-through'
                                                        : 'bg-zinc-950 text-zinc-600'
                                                : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-900'
                                                }`}
                                            whileHover={selectedAnswer === null ? { scale: 1.02 } : {}}
                                            whileTap={selectedAnswer === null ? { scale: 0.98 } : {}}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${showResult && isCorrect ? 'bg-black text-white' :
                                                    showResult && isSelected ? 'bg-zinc-600 text-white' :
                                                        'bg-zinc-800 text-zinc-500'
                                                    }`}>
                                                    {String.fromCharCode(65 + idx)}
                                                </span>
                                                <span className="flex-1">{option}</span>
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black overflow-hidden">
            {/* Animated Background Particles */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                {[...Array(20)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-white/20 rounded-full"
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                        }}
                        animate={{
                            opacity: [0.2, 0.5, 0.2],
                            scale: [1, 1.5, 1],
                        }}
                        transition={{
                            duration: 2 + Math.random() * 2,
                            repeat: Infinity,
                            delay: Math.random() * 2,
                        }}
                    />
                ))}
            </div>

            {/* Header */}
            <div className="sticky top-0 z-20 bg-black/90 pb-4 border-b border-zinc-900">
                <div className="p-4">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        <button
                            onClick={() => navigate('/gamification/skill-tree')}
                            className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span>Back</span>
                        </button>
                        <div className="text-center">
                            <h1 className="text-xl font-bold text-white capitalize tracking-tight">{formatTopic(topic)}</h1>
                            <p className="text-sm text-zinc-500">Skill Tree Adventure</p>
                        </div>
                        <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5 border border-zinc-800">
                            <Trophy className="w-4 h-4 text-white" />
                            <span className="text-white font-bold">
                                {levels.filter(l => l.status === 'completed').length}/{levels.length}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="max-w-md mx-auto mt-3 px-6">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-white"
                                initial={{ width: 0 }}
                                animate={{ width: `${(levels.filter(l => l.status === 'completed').length / levels.length) * 100}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-white fill-white" />
                            <span className="text-sm font-bold text-white">
                                {levels.reduce((sum, l) => sum + (l.stars || 0), 0)}
                            </span>
                        </div>
                    </div>
                </div>
            </div> {/* Closing sticky header */}

            {/* Level Map */}
            <div
                ref={scrollRef}
                className="overflow-y-auto px-4 py-4"
                style={{ height: 'calc(100vh - 120px)' }}
            >
                <div
                    className="relative max-w-sm mx-auto"
                    style={{ minHeight: `${levels.length * 100 + 100}px` }}
                >
                    {/* Starfield Background Canvas for Map Area */}
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full opacity-60 pointer-events-none"
                    />

                    {/* Decorative path background */}
                    <div className="absolute inset-0 pointer-events-none">
                        <svg
                            className="absolute inset-0 w-full h-full"
                            style={{ minHeight: `${levels.length * 100 + 100}px` }}
                            viewBox={`0 0 100 ${levels.length * 100 + 100}`}
                            preserveAspectRatio="none"
                        >
                            <defs>
                                <linearGradient id="pathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="rgba(82, 82, 91, 0.3)" /> {/* Zinc-600 */}
                                    <stop offset="100%" stopColor="rgba(63, 63, 70, 0.3)" /> {/* Zinc-700 */}
                                </linearGradient>
                                <filter id="glow">
                                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            {/* Main curved path */}
                            {levels.length > 1 && (
                                <path
                                    d={levels.map((_, idx) => {
                                        const pos = getLevelPosition(idx, levels.length);
                                        return idx === 0
                                            ? `M ${pos.x} ${pos.y}`
                                            : `L ${pos.x} ${pos.y}`;
                                    }).join(' ')}
                                    fill="none"
                                    stroke="url(#pathGradient)"
                                    strokeWidth="1"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    filter="url(#glow)"
                                    vectorEffect="non-scaling-stroke"
                                />
                            )}

                            {/* Completed path overlay */}
                            {levels.some(l => l.status === 'completed') && (
                                <path
                                    d={levels.slice(0, levels.findIndex(l => l.status !== 'completed') + 1 || levels.length).map((_, idx) => {
                                        const pos = getLevelPosition(idx, levels.length);
                                        return idx === 0
                                            ? `M ${pos.x} ${pos.y}`
                                            : `L ${pos.x} ${pos.y}`;
                                    }).join(' ')}
                                    fill="none"
                                    stroke="rgba(255, 255, 255, 0.6)"
                                    strokeWidth="1"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                />
                            )}
                        </svg>
                    </div>

                    {/* Level nodes */}
                    {levels.map((level, idx) => {
                        const pos = getLevelPosition(idx, levels.length);
                        const isLocked = level.status === 'locked';
                        const isCompleted = level.status === 'completed';
                        const isUnlocked = level.status === 'unlocked';
                        const colors = getLevelColors(level, idx);
                        const isBossLevel = (idx + 1) % 5 === 0; // Every 5th level is a boss

                        return (
                            <motion.div
                                key={level.id}
                                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                                style={{ left: `${pos.x}%`, top: pos.y }}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: idx * 0.03, type: 'spring', stiffness: 200 }}
                            >
                                {/* Decorative ring for special levels */}
                                {isBossLevel && !isLocked && (
                                    <motion.div
                                        className="absolute inset-0 -m-3 rounded-full border-4 border-white/30"
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                                    >
                                        <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
                                    </motion.div>
                                )}

                                <motion.button
                                    onClick={() => handleLevelClick(level, idx)}
                                    className={`relative flex items-center justify-center shadow-xl transition-all ${isBossLevel
                                        ? 'w-20 h-20 rounded-2xl rotate-45'
                                        : 'w-16 h-16 rounded-full'
                                        } ${colors.shadow} ${isLocked ? 'opacity-80' : ''
                                        }`}
                                    style={colors.style}
                                    whileHover={!isLocked ? { scale: 1.15, rotate: isBossLevel ? 45 : 0 } : {}}
                                    whileTap={!isLocked ? { scale: 0.95 } : {}}
                                    disabled={isLocked}
                                >
                                    {/* Inner content - counter-rotate for boss levels */}
                                    <div className={isBossLevel ? '-rotate-45' : ''}>
                                        {isLocked ? (
                                            <Lock className="w-6 h-6 text-zinc-500" />
                                        ) : isCompleted ? (
                                            <div className="flex flex-col items-center">
                                                <CheckCircle2 className="w-6 h-6 text-black" />
                                            </div>
                                        ) : isBossLevel ? (
                                            <Crown className="w-7 h-7 text-white" />
                                        ) : (
                                            <span className="text-2xl font-black text-zinc-300 drop-shadow-lg">{level.id}</span>
                                        )}
                                    </div>
                                </motion.button>

                                {/* Pulse animation for unlocked levels */}
                                {isUnlocked && (
                                    <>
                                        <motion.div
                                            className={`absolute inset-0 pointer-events-none ${isBossLevel ? 'rounded-2xl' : 'rounded-full'} ${colors.glow}`}
                                            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                        />
                                        {/* Sparkle effect */}
                                        <motion.div
                                            className="absolute -top-1 -right-1 pointer-events-none"
                                            animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                        >
                                            <Sparkles className="w-4 h-4 text-white" />
                                        </motion.div>
                                    </>
                                )}

                                {/* Flame effect for streak */}
                                {isUnlocked && idx > 0 && levels[idx - 1]?.status === 'completed' && (
                                    <motion.div
                                        className="absolute -top-3 left-1/2 transform -translate-x-1/2"
                                        animate={{ y: [-2, 2, -2] }}
                                        transition={{ duration: 0.5, repeat: Infinity }}
                                    >
                                        <Flame className="w-5 h-5 text-zinc-400" />
                                    </motion.div>
                                )}

                                {/* Level name label */}
                                {!isLocked && (
                                    <motion.div
                                        className={`absolute ${pos.x > 50 ? 'right-full mr-3' : 'left-full ml-3'} top-1/2 transform -translate-y-1/2 whitespace-nowrap`}
                                        initial={{ opacity: 0, x: pos.x > 50 ? 10 : -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.03 + 0.2 }}
                                    >
                                        <div className="bg-zinc-900/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-zinc-700">
                                            <p className="text-xs font-semibold text-white truncate max-w-[120px]">{level.name}</p>
                                            {isCompleted && level.stars > 0 && (
                                                <div className="flex gap-0.5 mt-0.5">
                                                    {[1, 2, 3].map(star => (
                                                        <Star
                                                            key={star}
                                                            className={`w-3 h-3 ${star <= level.stars ? 'text-white fill-white' : 'text-zinc-600'}`}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        );
                    })}

                    {/* End goal decoration */}
                    <motion.div
                        className="absolute transform -translate-x-1/2"
                        style={{
                            left: `${getLevelPosition(levels.length - 1, levels.length).x}%`,
                            top: getLevelPosition(levels.length - 1, levels.length).y + 80
                        }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <div className="flex flex-col items-center">
                            <motion.div
                                animate={{ y: [-5, 5, -5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                <Gift className="w-10 h-10 text-white" />
                            </motion.div>
                            <p className="text-sm font-bold text-zinc-400 mt-2">Master {formatTopic(topic)}!</p>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Level Modal - MONOCHROME */}
            <AnimatePresence>
                {showLevelModal && selectedLevel && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowLevelModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0, y: 50 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.8, opacity: 0, y: 50 }}
                            className="relative bg-zinc-900 rounded-3xl p-6 max-w-sm w-full border border-zinc-800 shadow-2xl shadow-zinc-900/50"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Decorative top banner */}
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                                <div className={`text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg border border-zinc-700 ${selectedLevel.difficulty === 'hard'
                                    ? 'bg-zinc-800'
                                    : selectedLevel.difficulty === 'medium'
                                        ? 'bg-zinc-700'
                                        : 'bg-zinc-600'
                                    }`}>
                                    {selectedLevel.difficulty?.toUpperCase() || 'EASY'}
                                </div>
                            </div>

                            <div className="text-center mb-6 pt-2">
                                {/* Level icon with animation */}
                                <motion.div
                                    className={`w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center relative ${selectedLevel.status === 'completed'
                                        ? 'bg-white text-black'
                                        : 'bg-zinc-800 border-2 border-zinc-700'
                                        }`}
                                    animate={{ rotate: [0, 5, -5, 0] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                >
                                    {selectedLevel.status === 'completed' ? (
                                        <Trophy className="w-12 h-12" />
                                    ) : (
                                        <span className="text-4xl font-black text-white drop-shadow-lg">{selectedLevel.id}</span>
                                    )}

                                    {/* Sparkles around */}
                                    <motion.div
                                        className="absolute -top-2 -right-2"
                                        animate={{ scale: [1, 1.2, 1], rotate: 360 }}
                                        transition={{ duration: 3, repeat: Infinity }}
                                    >
                                        <Sparkles className="w-6 h-6 text-white" />
                                    </motion.div>
                                </motion.div>

                                <h3 className="text-2xl font-bold text-white mb-2">{selectedLevel.name}</h3>
                                <p className="text-zinc-400 text-sm">{selectedLevel.description}</p>

                                {selectedLevel.status === 'completed' && (
                                    <motion.div
                                        className="flex justify-center mt-4 gap-1"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.2 }}
                                    >
                                        {[1, 2, 3].map(star => (
                                            <motion.div
                                                key={star}
                                                initial={{ rotate: -30, scale: 0 }}
                                                animate={{ rotate: 0, scale: 1 }}
                                                transition={{ delay: 0.1 * star }}
                                            >
                                                <Star
                                                    className={`w-8 h-8 ${star <= selectedLevel.stars ? 'text-white fill-white' : 'text-zinc-700'}`}
                                                />
                                            </motion.div>
                                        ))}
                                    </motion.div>
                                )}
                            </div>

                            {/* Stats grid */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <div className="bg-zinc-950 rounded-xl p-3 text-center border border-zinc-800">
                                    <Target className="w-5 h-5 text-zinc-400 mx-auto mb-1" />
                                    <p className="text-xs text-zinc-500 uppercase font-mono">Questions</p>
                                    <p className="text-lg font-bold text-white">5</p>
                                </div>
                                <div className="bg-zinc-950 rounded-xl p-3 text-center border border-zinc-800">
                                    <Zap className="w-5 h-5 text-white mx-auto mb-1" />
                                    <p className="text-xs text-zinc-500 uppercase font-mono">XP Reward</p>
                                    <p className="text-lg font-bold text-white">
                                        {selectedLevel.status === 'completed' ? '✓' : '5-10'}
                                    </p>
                                </div>
                            </div>

                            {/* XP breakdown */}
                            {selectedLevel.status !== 'completed' && (
                                <div className="bg-zinc-800/50 rounded-xl p-3 mb-6 border border-zinc-700/50">
                                    <p className="text-xs text-center text-zinc-500 mb-2 uppercase font-mono">XP based on stars earned</p>
                                    <div className="flex justify-around">
                                        <div className="text-center">
                                            <Star className="w-4 h-4 text-white fill-white mx-auto" />
                                            <p className="text-sm font-bold text-white">5 XP</p>
                                        </div>
                                        <div className="text-center">
                                            <div className="flex">
                                                <Star className="w-4 h-4 text-white fill-white" />
                                                <Star className="w-4 h-4 text-white fill-white" />
                                            </div>
                                            <p className="text-sm font-bold text-white">8 XP</p>
                                        </div>
                                        <div className="text-center">
                                            <div className="flex">
                                                <Star className="w-4 h-4 text-white fill-white" />
                                                <Star className="w-4 h-4 text-white fill-white" />
                                                <Star className="w-4 h-4 text-white fill-white" />
                                            </div>
                                            <p className="text-sm font-bold text-white">10 XP</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <motion.button
                                    onClick={() => setShowLevelModal(false)}
                                    className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-white transition-colors"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    Close
                                </motion.button>
                                <motion.button
                                    onClick={startLevel}
                                    className="flex-1 px-4 py-3 bg-white hover:bg-zinc-200 text-black rounded-xl font-bold flex items-center justify-center gap-2"
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Play className="w-5 h-5 fill-current" />
                                    {selectedLevel.status === 'completed' ? 'Replay' : 'Play!'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SkillTreeGameMap;

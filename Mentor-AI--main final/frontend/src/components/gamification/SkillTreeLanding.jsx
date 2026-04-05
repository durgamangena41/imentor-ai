import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Gamepad2, MapPin, Star,
    ChevronRight, Sparkles, BookOpen, ArrowLeft,
    Brain, Loader2, CheckCircle2, MessageCircle
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import api from '../../services/api';

const SkillTreeLanding = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const hasGames = location.state?.hasGames ?? false;
    const [isHovering, setIsHovering] = useState(false);
    const [step, setStep] = useState('start'); // 'start', 'topic', 'assessment', 'complete'
    const [topic, setTopic] = useState('');
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [currentAnswer, setCurrentAnswer] = useState('');
    const [loading, setLoading] = useState(false);
    const [assessmentResult, setAssessmentResult] = useState(null);

    const handleStartGame = () => {
        setStep('topic');
    };

    const handleNext = async () => {
        if (topic.trim()) {
            setLoading(true);
            try {
                // Use the centralized API client
                const response = await api.getDiagnosticQuiz(topic.trim());

                const questions = response.questions || [];
                if (questions.length > 0) {
                    setQuestions(questions);
                    setStep('assessment');
                } else {
                    // No questions returned - skip assessment
                    toast.success('Skipping assessment - starting as Beginner');
                    proceedWithoutAssessment();
                }
            } catch (error) {
                console.error('[SkillTreeLanding] Error generating questions:', error);
                toast.error('Network warning: Starting as Beginner (Assessment unavailable)');
                // Fallback: proceed directly to map without assessment
                proceedWithoutAssessment();
            } finally {
                setLoading(false);
            }
        }
    };

    const proceedWithoutAssessment = () => {
        // Navigate directly to map with beginner assessment
        navigate('/gamification/skill-tree/map', {
            state: {
                topic: topic.trim(),
                assessmentResult: { level: 'Beginner', summary: 'Starting fresh!' }
            }
        });
    };

    const handleAnswerSubmit = () => {
        if (!currentAnswer.trim()) return;

        const newAnswers = [...answers, {
            question: questions[currentQuestionIndex].question,
            answer: currentAnswer.trim()
        }];
        setAnswers(newAnswers);
        setCurrentAnswer('');

        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        } else {
            // All questions answered - submit assessment
            submitAssessment(newAnswers);
        }
    };

    const submitAssessment = async (finalAnswers) => {
        setLoading(true);
        try {
            const result = await api.submitDiagnosticQuiz(topic.trim(), finalAnswers);
            setAssessmentResult(result);
            setStep('complete');
        } catch (error) {
            console.error('[SkillTreeLanding] Error submitting assessment:', error);
            toast.error('Failed to analyze responses, defaulting to Beginner.');
            // Proceed anyway - go to games page with new game data
            navigate('/gamification/skill-tree', {
                state: {
                    newGame: {
                        topic: topic.trim(),
                        assessmentResult: { level: 'Beginner' },
                        answers: finalAnswers
                    }
                }
            });
        } finally {
            setLoading(false);
        }
    };

    const handleProceedToMap = () => {
        // Navigate to games page with new game data
        navigate('/gamification/skill-tree', {
            state: {
                newGame: {
                    topic: topic.trim(),
                    assessmentResult,
                    answers
                }
            }
        });
    };

    const handleBack = () => {
        if (step === 'topic') {
            setStep('start');
            setTopic('');
        } else if (step === 'assessment') {
            setStep('topic');
            setQuestions([]);
            setCurrentQuestionIndex(0);
            setAnswers([]);
            setCurrentAnswer('');
        }
    };

    return (
        <div className="min-h-screen max-h-screen overflow-y-auto bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
            <div className="max-w-4xl mx-auto pb-20">
                {/* Back Button */}
                <motion.button
                    onClick={() => navigate(hasGames ? '/gamification/skill-tree' : '/')}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    whileHover={{ x: -5 }}
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back</span>
                </motion.button>

                {/* Hero Section */}
                <motion.div
                    className="text-center mb-12"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    {/* Animated Icon */}
                    <motion.div
                        className="relative inline-block mb-6"
                        animate={{
                            rotate: [0, 5, -5, 0],
                        }}
                        transition={{
                            duration: 4,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    >
                        <div className="w-24 h-24 bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30">
                            <MapPin className="w-12 h-12 text-white" />
                        </div>
                        {/* Floating particles */}
                        <motion.div
                            className="absolute -top-2 -right-2"
                            animate={{ y: [-5, 5, -5], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            <Sparkles className="w-6 h-6 text-yellow-400" />
                        </motion.div>
                        <motion.div
                            className="absolute -bottom-1 -left-2"
                            animate={{ y: [5, -5, 5], opacity: [0.7, 1, 0.7] }}
                            transition={{ duration: 2.5, repeat: Infinity }}
                        >
                            <Star className="w-5 h-5 text-cyan-400" />
                        </motion.div>
                    </motion.div>

                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        Skill Tree
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400"> Adventure</span>
                    </h1>
                    <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                        Embark on your learning journey! Explore the fog of war, unlock new skills,
                        and master topics to reveal the complete knowledge map.
                    </p>
                </motion.div>

                <AnimatePresence mode="wait">
                    {step === 'start' && (
                        /* Start Game Button */
                        <motion.div
                            key="start-button"
                            className="flex justify-center mb-12"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ delay: 0.4 }}
                        >
                            <motion.button
                                onClick={handleStartGame}
                                onMouseEnter={() => setIsHovering(true)}
                                onMouseLeave={() => setIsHovering(false)}
                                className="relative group px-12 py-5 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 rounded-2xl font-bold text-xl text-white shadow-2xl shadow-blue-500/30 overflow-hidden"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {/* Animated background */}
                                <motion.div
                                    className="absolute inset-0 bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                />

                                {/* Shine effect */}
                                <motion.div
                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                                    initial={{ x: '-200%' }}
                                    animate={isHovering ? { x: '200%' } : { x: '-200%' }}
                                    transition={{ duration: 0.8 }}
                                />

                                {/* Button content */}
                                <span className="relative flex items-center gap-3">
                                    <Gamepad2 className="w-7 h-7" />
                                    Start the Game
                                    <motion.span
                                        animate={{ x: [0, 5, 0] }}
                                        transition={{ duration: 1, repeat: Infinity }}
                                    >
                                        <ChevronRight className="w-6 h-6" />
                                    </motion.span>
                                </span>
                            </motion.button>
                        </motion.div>
                    )}

                    {step === 'topic' && (
                        /* Topic Input Section */
                        <motion.div
                            key="topic-input"
                            className="max-w-xl mx-auto mb-12"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4 }}
                        >
                            <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center">
                                        <BookOpen className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-white">Choose Your Topic</h3>
                                        <p className="text-sm text-slate-400">Enter a course or topic to explore</p>
                                    </div>
                                </div>

                                <input
                                    type="text"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !loading && handleNext()}
                                    className="w-full px-5 py-4 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all text-lg"
                                    autoFocus
                                    disabled={loading}
                                />

                                <div className="flex gap-4 mt-6">
                                    <motion.button
                                        onClick={handleBack}
                                        disabled={loading}
                                        className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-slate-300 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                        Back
                                    </motion.button>
                                    <motion.button
                                        onClick={handleNext}
                                        disabled={!topic.trim() || loading}
                                        className={`flex-1 px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${topic.trim() && !loading
                                            ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/30'
                                            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                            }`}
                                        whileHover={topic.trim() && !loading ? { scale: 1.02 } : {}}
                                        whileTap={topic.trim() && !loading ? { scale: 0.98 } : {}}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Preparing...
                                            </>
                                        ) : (
                                            <>
                                                Next
                                                <ChevronRight className="w-5 h-5" />
                                            </>
                                        )}
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 'assessment' && (
                        /* Socratic Assessment Section */
                        <motion.div
                            key="assessment"
                            className="max-w-2xl mx-auto mb-12"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4 }}
                        >
                            <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50">
                                {/* Header */}
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                                        <Brain className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-white">Knowledge Assessment</h3>
                                        <p className="text-sm text-slate-400">Let's understand your current knowledge of {topic}</p>
                                    </div>
                                </div>

                                {/* Progress */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
                                        <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
                                        <span>{Math.round(((currentQuestionIndex) / questions.length) * 100)}% complete</span>
                                    </div>
                                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${((currentQuestionIndex) / questions.length) * 100}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                </div>

                                {/* Question */}
                                {questions[currentQuestionIndex] && (
                                    <motion.div
                                        key={currentQuestionIndex}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="mb-6"
                                    >
                                        <div className="flex items-start gap-3 mb-4">
                                            <MessageCircle className="w-5 h-5 text-purple-400 mt-1 shrink-0" />
                                            <p className="text-lg text-white leading-relaxed">
                                                {questions[currentQuestionIndex].question}
                                            </p>
                                        </div>

                                        <textarea
                                            value={currentAnswer}
                                            onChange={(e) => setCurrentAnswer(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey && !loading) {
                                                    e.preventDefault();
                                                    handleAnswerSubmit();
                                                }
                                            }}
                                            placeholder="Share your thoughts... (Press Enter to submit)"
                                            className="w-full px-5 py-4 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all resize-none"
                                            rows={4}
                                            autoFocus
                                            disabled={loading}
                                        />
                                    </motion.div>
                                )}

                                {/* Buttons */}
                                <div className="flex gap-4">
                                    <motion.button
                                        onClick={handleBack}
                                        disabled={loading}
                                        className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-slate-300 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                        Back
                                    </motion.button>
                                    <motion.button
                                        onClick={handleAnswerSubmit}
                                        disabled={!currentAnswer.trim() || loading}
                                        className={`flex-1 px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${currentAnswer.trim() && !loading
                                            ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                                            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                            }`}
                                        whileHover={currentAnswer.trim() && !loading ? { scale: 1.02 } : {}}
                                        whileTap={currentAnswer.trim() && !loading ? { scale: 0.98 } : {}}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Analyzing...
                                            </>
                                        ) : currentQuestionIndex < questions.length - 1 ? (
                                            <>
                                                Next Question
                                                <ChevronRight className="w-5 h-5" />
                                            </>
                                        ) : (
                                            <>
                                                Complete Assessment
                                                <CheckCircle2 className="w-5 h-5" />
                                            </>
                                        )}
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 'complete' && (
                        /* Assessment Complete Section */
                        <motion.div
                            key="complete"
                            className="max-w-xl mx-auto mb-12"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4 }}
                        >
                            <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50 text-center">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', delay: 0.2 }}
                                    className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6"
                                >
                                    <CheckCircle2 className="w-10 h-10 text-white" />
                                </motion.div>

                                <h3 className="text-2xl font-bold text-white mb-2">Assessment Complete!</h3>
                                <p className="text-slate-400 mb-6">
                                    We've analyzed your responses and prepared a personalized skill tree for <span className="text-cyan-400 font-semibold">{topic}</span>
                                </p>

                                {assessmentResult && (
                                    <div className="bg-slate-900/50 rounded-xl p-4 mb-6 text-left">
                                        <p className="text-sm text-slate-400 mb-2">Your starting level:</p>
                                        <p className="text-lg font-semibold text-white">{assessmentResult.level || 'Beginner'}</p>
                                        {assessmentResult.summary && (
                                            <p className="text-sm text-slate-400 mt-2">{assessmentResult.summary}</p>
                                        )}
                                    </div>
                                )}

                                <motion.button
                                    onClick={handleProceedToMap}
                                    className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 rounded-xl font-bold text-lg text-white shadow-xl shadow-blue-500/30 flex items-center justify-center gap-3"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <MapPin className="w-6 h-6" />
                                    Explore Your Skill Tree
                                    <ChevronRight className="w-6 h-6" />
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Instructions */}
                <motion.div
                    className="bg-slate-800/30 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                >
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Gamepad2 className="w-5 h-5 text-blue-400" />
                        How to Play
                    </h3>
                    <ul className="space-y-3 text-sm text-slate-400">
                        <li className="flex items-start gap-3">
                            <span className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-xs font-bold shrink-0">1</span>
                            <span>Enter a <strong className="text-slate-300">topic you want to learn</strong> and complete a quick assessment</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center text-cyan-400 text-xs font-bold shrink-0">2</span>
                            <span>AI generates <strong className="text-cyan-400">personalized levels</strong> based on your knowledge level</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 text-xs font-bold shrink-0">3</span>
                            <span>Complete quiz levels to <strong className="text-emerald-400">earn stars</strong> (⭐50%, ⭐⭐70%, ⭐⭐⭐90%) and unlock the next level</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="w-6 h-6 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-400 text-xs font-bold shrink-0">4</span>
                            <span>Earn <strong className="text-yellow-400">XP rewards</strong> on first completion: ⭐5xp, ⭐⭐8xp, ⭐⭐⭐10xp</span>
                        </li>
                    </ul>
                </motion.div>
            </div>
        </div>
    );
};

export default SkillTreeLanding;

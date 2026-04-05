import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, XCircle, Loader, TrendingUp, Award, Zap } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const SkillAssessmentModal = ({ skill, onClose, onSuccess }) => {
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [showResults, setShowResults] = useState(false);

    useEffect(() => {
        fetchQuestions();
    }, [skill]);

    const fetchQuestions = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${import.meta.env.VITE_API_BASE_URL}/gamification/skill/${skill.skillId}/assessment`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setQuestions(response.data.questions || []);
            setUserAnswers(new Array(response.data.questions?.length || 0).fill(null));
            setLoading(false);
        } catch (error) {
            console.error('[SkillAssessment] Error fetching questions:', error);
            toast.error('Failed to load assessment questions');
            setLoading(false);
        }
    };

    const handleAnswerSelect = (answer) => {
        const newAnswers = [...userAnswers];
        newAnswers[currentQuestionIndex] = answer;
        setUserAnswers(newAnswers);
    };

    const handleNext = () => {
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        }
    };

    const handlePrevious = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(currentQuestionIndex - 1);
        }
    };

    const handleSubmit = async () => {
        if (userAnswers.some(answer => answer === null)) {
            toast.error('Please answer all questions before submitting');
            return;
        }

        try {
            setSubmitting(true);
            const token = localStorage.getItem('authToken');
            const response = await axios.post(
                `${import.meta.env.VITE_API_BASE_URL}/gamification/skill/${skill.skillId}/assessment`,
                { answers: userAnswers },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setResult(response.data);
            setShowResults(true);

            // Show success message
            if (response.data.justMastered) {
                toast.success('🎉 Skill Mastered! Great progress!');
            } else {
                toast.success(`Assessment completed! Score: ${response.data.score}%`);
            }

            // Call callback after a delay
            setTimeout(() => {
                onSuccess?.(response.data);
            }, 3000);

        } catch (error) {
            console.error('[SkillAssessment] Error submitting assessment:', error);
            toast.error('Failed to submit assessment');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <motion.div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className="bg-slate-900 rounded-lg p-8 w-full max-w-2xl border border-slate-700"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-center gap-3">
                        <Loader className="w-6 h-6 text-blue-400 animate-spin" />
                        <p className="text-slate-300">Loading assessment questions...</p>
                    </div>
                </motion.div>
            </motion.div>
        );
    }

    if (showResults) {
        const passed = result.score >= skill.masteryThreshold;
        const correct = result.results.filter(r => r.isCorrect).length;

        return (
            <motion.div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-lg w-full max-w-2xl border border-slate-700 overflow-hidden"
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className={`p-6 text-center border-b border-slate-700 ${
                        passed ? 'bg-green-900/20' : 'bg-amber-900/20'
                    }`}>
                        <motion.div
                            className="flex justify-center mb-4"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring', stiffness: 150 }}
                        >
                            {passed ? (
                                <CheckCircle2 className="w-16 h-16 text-green-400" />
                            ) : (
                                <TrendingUp className="w-16 h-16 text-amber-400" />
                            )}
                        </motion.div>
                        <h2 className="text-2xl font-bold text-slate-100 mb-2">
                            {passed ? '🎉 Excellent Work!' : '📊 Assessment Complete'}
                        </h2>
                        <p className="text-slate-400">
                            {passed ? 'You\'ve mastered this skill!' : 'Keep practicing to improve!'}
                        </p>
                    </div>

                    {/* Results */}
                    <div className="p-6 space-y-6">
                        {/* Score Display */}
                        <div className="grid grid-cols-3 gap-4">
                            <motion.div
                                className="bg-slate-800 rounded-lg p-4 text-center border border-slate-700"
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: 0.1 }}
                            >
                                <p className="text-slate-400 text-sm">Score</p>
                                <p className="text-3xl font-bold text-blue-400 mt-2">{result.score}%</p>
                            </motion.div>
                            <motion.div
                                className="bg-slate-800 rounded-lg p-4 text-center border border-slate-700"
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                            >
                                <p className="text-slate-400 text-sm">Correct</p>
                                <p className="text-3xl font-bold text-green-400 mt-2">
                                    {correct}/{questions.length}
                                </p>
                            </motion.div>
                            <motion.div
                                className="bg-slate-800 rounded-lg p-4 text-center border border-slate-700"
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: 0.3 }}
                            >
                                <p className="text-slate-400 text-sm">Mastery</p>
                                <p className="text-3xl font-bold text-cyan-400 mt-2">
                                    {result.newMastery}%
                                </p>
                            </motion.div>
                        </div>

                        {/* Mastery Progress */}
                        <div>
                            <p className="text-sm font-semibold text-slate-300 mb-2">
                                Skill Mastery Progress
                            </p>
                            <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${result.newMastery}%` }}
                                    transition={{ duration: 1, delay: 0.3 }}
                                />
                            </div>
                            <p className="text-xs text-slate-400 mt-2">
                                {result.newMastery >= skill.masteryThreshold
                                    ? '✓ Mastery Unlocked!'
                                    : `Need ${skill.masteryThreshold - result.newMastery}% more for mastery`}
                            </p>
                        </div>

                        {/* New Unlocks */}
                        {result.newlyUnlocked && result.newlyUnlocked.length > 0 && (
                            <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
                                <p className="text-sm font-semibold text-green-300 flex items-center gap-2 mb-3">
                                    <Award className="w-4 h-4" />
                                    New Skills Unlocked!
                                </p>
                                <div className="space-y-1">
                                    {result.newlyUnlocked.map(skillId => (
                                        <motion.p
                                            key={skillId}
                                            className="text-sm text-green-200"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                        >
                                            ✓ {skillId}
                                        </motion.p>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Question Review */}
                        <div className="max-h-64 overflow-y-auto">
                            <p className="text-sm font-semibold text-slate-300 mb-3">Review</p>
                            <div className="space-y-2">
                                {result.results.map((res, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-3 rounded-lg border ${
                                            res.isCorrect
                                                ? 'bg-green-900/10 border-green-700'
                                                : 'bg-red-900/10 border-red-700'
                                        }`}
                                    >
                                        <div className="flex items-start gap-2 text-sm">
                                            {res.isCorrect ? (
                                                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                            ) : (
                                                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                            )}
                                            <div className="flex-1">
                                                <p className={res.isCorrect ? 'text-green-200' : 'text-red-200'}>
                                                    Question {idx + 1}
                                                </p>
                                                {!res.isCorrect && (
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        Correct: {res.correctAnswer}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="p-6 border-t border-slate-700 flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold transition-colors"
                        >
                            Close
                        </button>
                        {!passed && (
                            <button
                                onClick={() => {
                                    setShowResults(false);
                                    setCurrentQuestionIndex(0);
                                    setUserAnswers(new Array(questions.length).fill(null));
                                }}
                                className="flex-1 py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
                            >
                                Try Again
                            </button>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        );
    }

    if (questions.length === 0) {
        return (
            <motion.div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className="bg-slate-900 rounded-lg p-8 w-full max-w-2xl border border-slate-700 text-center"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="text-slate-300">No assessment questions available</p>
                </motion.div>
            </motion.div>
        );
    }

    const currentQuestion = questions[currentQuestionIndex];
    const isAnswered = userAnswers[currentQuestionIndex] !== null;
    const answersComplete = userAnswers.every(a => a !== null);

    return (
        <motion.div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-lg w-full max-w-2xl max-h-[90vh] border border-slate-700 overflow-hidden flex flex-col"
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-700 to-slate-800 p-4 border-b border-slate-600 flex items-center justify-between">
                    <div className="flex-1">
                        <p className="text-xs text-slate-400 mb-1">SKILL ASSESSMENT</p>
                        <h2 className="text-xl font-bold text-slate-100">{skill.name}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-200 p-2"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Progress */}
                <div className="px-6 pt-4 pb-2">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-400">
                            Question {currentQuestionIndex + 1} of {questions.length}
                        </p>
                        <p className="text-xs text-slate-400">
                            {userAnswers.filter(a => a !== null).length} answered
                        </p>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400"
                            animate={{
                                width: `${((currentQuestionIndex + 1) / questions.length) * 100}%`
                            }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Question */}
                    <motion.div
                        key={currentQuestionIndex}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <p className="text-lg font-semibold text-slate-100 mb-4">
                            {currentQuestion.question}
                        </p>

                        {/* Options */}
                        <div className="space-y-3">
                            {currentQuestion.options.map((option, idx) => (
                                <motion.button
                                    key={idx}
                                    onClick={() => handleAnswerSelect(option)}
                                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                                        userAnswers[currentQuestionIndex] === option
                                            ? 'bg-blue-900/40 border-blue-500'
                                            : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                                    }`}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                userAnswers[currentQuestionIndex] === option
                                                    ? 'bg-blue-500 border-blue-500'
                                                    : 'border-slate-600'
                                            }`}
                                        >
                                            {userAnswers[currentQuestionIndex] === option && (
                                                <div className="w-2 h-2 bg-white rounded-full" />
                                            )}
                                        </div>
                                        <span className="text-slate-200">{option}</span>
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Navigation */}
                <div className="p-6 border-t border-slate-700 bg-slate-900 flex gap-3">
                    <button
                        onClick={handlePrevious}
                        disabled={currentQuestionIndex === 0}
                        className="flex-1 py-2 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-100 font-semibold transition-colors"
                    >
                        Previous
                    </button>
                    {currentQuestionIndex < questions.length - 1 ? (
                        <button
                            onClick={handleNext}
                            disabled={!isAnswered}
                            className="flex-1 py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
                        >
                            Next
                        </button>
                    ) : (
                        <motion.button
                            onClick={handleSubmit}
                            disabled={!answersComplete || submitting}
                            className="flex-1 py-2 px-4 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors flex items-center justify-center gap-2"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {submitting ? (
                                <>
                                    <Loader className="w-4 h-4 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Submit Assessment
                                </>
                            )}
                        </motion.button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default SkillAssessmentModal;

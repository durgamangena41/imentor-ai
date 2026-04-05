// frontend/src/components/learning/StudyPlanPage.jsx - REDESIGNED WITH PREMIUM UI
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../../contexts/AppStateContext.jsx';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Plus, Loader2, AlertTriangle, CheckCircle, Lock, Circle, GraduationCap, FileText, Globe, Code, BookMarked, ChevronLeft, Sparkles, Trash2, ChevronDown, ChevronUp, Target, TrendingUp, Zap, Star, Clock, Award, ArrowRight } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import Button from '../core/Button';
import Modal from '../core/Modal.jsx';
import IconButton from '../core/IconButton.jsx';
import { motion, AnimatePresence } from 'framer-motion';

const iconMap = {
    direct_answer: GraduationCap,
    document_review: FileText,
    web_search: Globe,
    academic_search: BookMarked,
    code_executor: Code,
};

const ModuleItem = ({ module, pathId, onModuleUpdate, isNextUp, handleNewChat, onLocalModuleUpdate }) => {
    const navigate = useNavigate();
    const [isUpdating, setIsUpdating] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const { setInitialPromptForNewSession, setInitialActivityForNewSession } = useAppState();

    const handleStatusToggle = async () => {
        setIsUpdating(true);
        const newStatus = module.status === 'completed' ? 'not_started' : 'completed';
        onLocalModuleUpdate(module.moduleId, newStatus);

        try {
            await api.updateModuleStatus(pathId, module.moduleId, newStatus);
            toast.success(`Module '${module.title}' marked as ${newStatus}.`, {
                icon: newStatus === 'completed' ? '✅' : '🔄',
                duration: 2000
            });
        } catch (error) {
            toast.error(`Failed to update module: ${error.message}`);
            onLocalModuleUpdate(module.moduleId, module.status);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleStartModule = () => {
        const { activity } = module;

        if (activity.type === 'code_executor') {
            navigate('/tools/code-executor');
            return;
        }

        setInitialPromptForNewSession(activity.suggestedPrompt);
        setInitialActivityForNewSession(activity);

        handleNewChat((newSessionId) => {
            if (activity.type === 'direct_answer' || activity.type === 'web_search' || activity.type === 'academic_search' || activity.type === 'document_review') {
                navigate('/');
            }
        }, true, true);
    };

    const ActivityIcon = iconMap[module.activity.type] || GraduationCap;
    const isLocked = module.status === 'locked';
    const isCompleted = module.status === 'completed';

    return (
        <motion.div
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01, y: -2 }}
            transition={{ duration: 0.2 }}
            className={`group relative overflow-hidden rounded-2xl transition-all duration-300 backdrop-blur-sm ${isCompleted
                ? 'bg-black dark:bg-white border-2 border-black dark:border-white shadow-lg'
                : isNextUp
                    ? 'bg-black dark:bg-white border-2 border-black dark:border-white shadow-xl'
                    : 'bg-white dark:bg-black border-2 border-gray-200 dark:border-gray-800 hover:border-black dark:hover:border-white hover:shadow-lg'
                }`}
        >
            {/* Animated gradient overlay for next up item */}
            {isNextUp && !isCompleted && (
                <motion.div
                    className="absolute inset-0 bg-white/10 dark:bg-black/10"
                />
            )}

            {/* Sparkle effect on hover */}
            {isHovered && !isCompleted && (
                <motion.div
                    className="absolute top-4 right-4"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                >
                    <Sparkles className="w-5 h-5 text-black dark:text-white" />
                </motion.div>
            )}

            <div className="relative flex items-start gap-5 p-6">
                {/* Status Icon */}
                <div className="flex-shrink-0 mt-1">
                    {isUpdating ? (
                        <div className="w-12 h-12 rounded-2xl bg-black dark:bg-white flex items-center justify-center shadow-lg">
                            <Loader2 className="w-6 h-6 animate-spin text-white dark:text-black" />
                        </div>
                    ) : (
                        <motion.button
                            onClick={handleStatusToggle}
                            disabled={isLocked}
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            whileTap={{ scale: 0.9 }}
                            className="disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                        >
                            {isLocked ? (
                                <div className="w-12 h-12 rounded-2xl bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                                    <Lock className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                                </div>
                            ) : isCompleted ? (
                                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-black flex items-center justify-center shadow-xl border border-black dark:border-white">
                                    <CheckCircle className="w-7 h-7 text-black dark:text-white drop-shadow-lg" strokeWidth={2.5} />
                                </div>
                            ) : (
                                <div className={`w-12 h-12 rounded-2xl border-3 flex items-center justify-center transition-all shadow-md ${isNextUp
                                    ? 'border-black dark:border-white bg-white dark:bg-black'
                                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-black hover:border-black dark:hover:border-white'
                                    }`}>
                                    <Circle className={`w-7 h-7 ${isNextUp ? 'text-black dark:text-white' : 'text-gray-400 group-hover:text-black dark:group-hover:text-white'}`} strokeWidth={2} />
                                </div>
                            )}
                        </motion.button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-grow min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <h4 className={`font-semibold text-base ${isCompleted
                            ? 'line-through text-gray-400'
                            : 'text-white dark:text-black'
                            }`}>
                            {module.title}
                        </h4>

                        {/* Completion Badge */}
                        {isCompleted && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="px-3 py-1 rounded-full bg-white dark:bg-black shadow-lg border border-black dark:border-white"
                            >
                                <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1">
                                    <Star size={12} className="fill-black dark:fill-white" />
                                    Done
                                </span>
                            </motion.div>
                        )}
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                        {module.objective}
                    </p>

                    {/* Activity Badge */}
                    <div className="flex items-center gap-2">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-black dark:border-white shadow-sm">
                            <ActivityIcon size={16} className="text-black dark:text-white" />
                            <span className="text-sm font-semibold text-black dark:text-white">
                                {module.activity.resourceName || module.activity.type}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                {isNextUp && !isCompleted && (
                    <motion.div
                        className="flex-shrink-0 self-center"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <motion.button
                            onClick={handleStartModule}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="group/btn px-6 py-3 rounded-xl bg-white dark:bg-black text-black dark:text-white border-2 border-black dark:border-white font-bold shadow-2xl flex items-center gap-2 transition-all relative overflow-hidden"
                        >
                            <Zap size={18} className="relative z-10" />
                            <span className="relative z-10">Start Now</span>
                            <ArrowRight size={18} className="relative z-10 group-hover/btn:translate-x-1 transition-transform" />
                        </motion.button>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
};

const CreatePlan = ({ onPlanCreated }) => {
    const [goal, setGoal] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [questionnaire, setQuestionnaire] = useState(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState([]);
    const location = useLocation();
    const navigate = useNavigate();
    const formRef = useRef(null);

    const handleInitialGenerate = useCallback(async (e) => {
        if (e) e.preventDefault();
        const currentGoal = goal.trim();
        if (!currentGoal) {
            toast.error("Please enter a learning goal.");
            return;
        }
        setIsLoading(true);
        try {
            const response = await api.generateLearningPath(currentGoal);
            if (response.isQuestionnaire) {
                setQuestionnaire(response.questions);
                setAnswers(new Array(response.questions.length).fill(''));
                setCurrentStep(0);
            } else {
                toast.success("New study plan created successfully!");
                resetForm();
                onPlanCreated();
            }
        } catch (error) {
            toast.error(`Failed to start plan generation: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [goal, onPlanCreated]);

    useEffect(() => {
        const locationState = location.state;
        if (locationState?.prefilledGoal) {
            const prefilledGoal = locationState.prefilledGoal;
            setGoal(prefilledGoal);

            setTimeout(() => {
                if (formRef.current) {
                    formRef.current.requestSubmit();
                }
            }, 100);

            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    const handleAnswerChange = (index, value) => {
        const newAnswers = [...answers];
        newAnswers[index] = value;
        setAnswers(newAnswers);
    };

    const handleFinalSubmit = async (e) => {
        if (e) e.preventDefault();
        setIsLoading(true);
        const context = {
            clarificationAnswers: questionnaire.map((q, i) => ({ question: q.questionText, answer: answers[i] }))
        };
        try {
            await api.generateLearningPath(goal.trim(), context);
            toast.success("Your personalized study plan has been created!");
            resetForm();
            onPlanCreated();
        } catch (error) {
            toast.error(`Failed to create personalized plan: ${error.message}`);
            resetForm();
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setGoal(''); setQuestionnaire(null); setCurrentStep(0); setAnswers([]);
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <motion.div
                    key="loading-spinner"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                >
                    <div className="relative">
                        <motion.div
                            className="w-20 h-20 rounded-full border-4 border-purple-200 dark:border-purple-800"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        />
                        <motion.div
                            className="absolute inset-0 w-20 h-20 rounded-full border-t-4 border-purple-600 dark:border-purple-400"
                            animate={{ rotate: -360 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        />
                        <Sparkles className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-purple-600 dark:text-purple-400" />
                    </div>
                    <motion.h3
                        className="mt-6 text-2xl font-bold text-black dark:text-white"
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    >
                        Creating Your Perfect Study Plan...
                    </motion.h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">This may take a moment</p>
                </motion.div>
            );
        }

        if (questionnaire) {
            const question = questionnaire[currentStep];
            const progress = ((currentStep + 1) / questionnaire.length) * 100;

            return (
                <motion.div
                    key={`question-step-${currentStep}`}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                >
                    {/* Progress bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="font-semibold text-black dark:text-white">
                                Question {currentStep + 1} of {questionnaire.length}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">{Math.round(progress)}% complete</span>
                        </div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-black dark:bg-white"
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-black rounded-2xl p-6 border border-black dark:border-white">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            {question.questionText}
                        </h3>

                        {question.type === 'multiple_choice' ? (
                            <div className="space-y-3 mt-6">
                                {question.options.map(option => (
                                    <motion.label
                                        key={option}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${answers[currentStep] === option
                                            ? 'border-black bg-black text-white dark:bg-white dark:text-black shadow-lg'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-black bg-white dark:bg-gray-800'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name={`q-${currentStep}`}
                                            value={option}
                                            checked={answers[currentStep] === option}
                                            onChange={() => handleAnswerChange(currentStep, option)}
                                            className="form-radio w-5 h-5 text-purple-600 focus:ring-purple-500"
                                        />
                                        <span className="ml-4 text-gray-800 dark:text-gray-200 font-medium">{option}</span>
                                    </motion.label>
                                ))}
                            </div>
                        ) : (
                            <input
                                type="text"
                                value={answers[currentStep]}
                                onChange={(e) => handleAnswerChange(currentStep, e.target.value)}
                                className="input-field mt-6 px-5 py-3 rounded-xl border-2 border-black dark:border-white focus:ring-2 focus:ring-black dark:focus:ring-white transition-colors"
                                placeholder="Type your answer here..."
                            />
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-4">
                        <Button
                            variant="secondary"
                            onClick={() => currentStep > 0 ? setCurrentStep(s => s - 1) : resetForm()}
                            disabled={isLoading}
                        >
                            {currentStep > 0 ? 'Back' : 'Cancel'}
                        </Button>

                        {currentStep < questionnaire.length - 1 ? (
                            <Button
                                onClick={() => setCurrentStep(s => s + 1)}
                                disabled={!answers[currentStep] || isLoading}
                            >
                                Next
                            </Button>
                        ) : (
                            <Button
                                onClick={handleFinalSubmit}
                                isLoading={isLoading}
                                disabled={!answers[currentStep] || isLoading}
                                leftIcon={<Sparkles size={18} />}
                            >
                                Generate My Plan
                            </Button>
                        )}
                    </div>
                </motion.div>
            );
        }

        return (
            <motion.div
                key="initial-goal-input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
            >
                <div className="text-center mb-8">
                    <h2 className="text-lg font-semibold text-black dark:text-white mb-3">
                        What's Your Learning Goal?
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        Tell us what you want to learn and we'll create a personalized plan
                    </p>
                </div>

                <div className="relative">
                    <textarea
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        placeholder="e.g., Master Python for data science, Learn machine learning fundamentals, Understand web development..."
                        className="input-field w-full min-h-[140px] custom-scrollbar resize-y px-5 py-4 rounded-2xl border-2 border-black dark:border-white focus:ring-2 focus:ring-black dark:focus:ring-white bg-white dark:bg-black text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all shadow-sm focus:shadow-lg"
                        disabled={isLoading}
                    />
                    <div className="absolute bottom-4 right-4 text-sm text-gray-400">
                        {goal.length}/500
                    </div>
                </div>

                <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isLoading || !goal.trim()}
                    className="w-full py-4 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-lg shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all relative overflow-hidden group"
                >
                    <Sparkles size={22} className="relative z-10" />
                    <span className="relative z-10">Generate My Study Plan</span>
                    <ArrowRight size={22} className="relative z-10 group-hover:translate-x-2 transition-transform" />
                </motion.button>
            </motion.div>
        );
    };

    return (
        <form ref={formRef} id="create-plan-form" onSubmit={handleInitialGenerate} className="p-6">
            <AnimatePresence mode="wait">
                {renderContent()}
            </AnimatePresence>
        </form>
    );
};

const StudyPlanPage = ({ handleNewChat }) => {
    const [learningPaths, setLearningPaths] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedStudyPlan, setSelectedStudyPlan] = useState(null);
    const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
    const [planToDelete, setPlanToDelete] = useState(null);

    const handleDeletePlan = async () => {
        if (!planToDelete) return;
        const toastId = toast.loading(`Deleting plan "${planToDelete.title}"...`);
        try {
            await api.deleteLearningPath(planToDelete._id);
            toast.success(`Plan "${planToDelete.title}" deleted!`, { id: toastId });
            if (selectedStudyPlan && selectedStudyPlan._id === planToDelete._id) {
                setSelectedStudyPlan(null);
            }
            fetchPaths();
        } catch (error) {
            toast.error(`Failed to delete plan: ${error.message}`, { id: toastId });
        } finally {
            setShowDeleteConfirmModal(false);
            setPlanToDelete(null);
        }
    };

    const fetchPaths = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const paths = await api.getLearningPaths();
            setLearningPaths(paths);
        } catch (err) {
            setError(err.message || 'Failed to fetch learning paths.');
            toast.error(err.message || 'Failed to fetch learning paths.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchPaths(); }, [fetchPaths]);

    const handleLocalModuleUpdate = useCallback((moduleId, newStatus) => {
        setSelectedStudyPlan(currentPlan => {
            if (!currentPlan) return null;
            const newModules = currentPlan.modules.map(m =>
                m.moduleId === moduleId ? { ...m, status: newStatus } : m
            );
            if (newStatus === 'completed') {
                const moduleIndex = newModules.findIndex(m => m.moduleId === moduleId);
                if (moduleIndex !== -1 && moduleIndex + 1 < newModules.length && newModules[moduleIndex + 1].status === 'locked') {
                    newModules[moduleIndex + 1].status = 'not_started';
                }
            }
            const updatedPlan = { ...currentPlan, modules: newModules };

            setLearningPaths(currentPaths =>
                currentPaths.map(path =>
                    path._id === updatedPlan._id ? updatedPlan : path
                )
            );

            return updatedPlan;
        });
    }, []);

    const renderStudyPlanDetails = (plan) => {
        const nextUpModule = plan.modules.find(m => m.status === 'not_started' || m.status === 'in_progress');
        const completedCount = plan.modules.filter(m => m.status === 'completed').length;
        const totalCount = plan.modules.length;
        const progressPercentage = (completedCount / totalCount) * 100;

        return (
            <motion.div
                key={plan._id}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
            >
                {/* Plan Header Card */}
                <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-violet-50 dark:from-purple-900/20 dark:via-pink-900/20 dark:to-violet-900/20 rounded-3xl p-8 border-2 border-purple-200/50 dark:border-purple-700/50 shadow-2xl shadow-purple-200/50 dark:shadow-purple-900/30">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-black dark:text-white mb-3">
                                {plan.title}
                            </h2>
                            <p className="text-black dark:text-white">
                                Your personalized learning journey
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="px-5 py-2 rounded-xl bg-white/80 dark:bg-black/80 backdrop-blur-sm border border-black dark:border-white shadow-lg">
                                <div className="text-sm text-gray-500">Progress</div>
                                <div className="text-lg font-bold text-black dark:text-white">
                                    {Math.round(progressPercentage)}%
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                            <span className="font-semibold">{completedCount} of {totalCount} modules completed</span>
                            <span>{totalCount - completedCount} remaining</span>
                        </div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
                            <motion.div
                                className="h-full bg-black dark:bg-white rounded-full shadow-lg"
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercentage}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-4 mt-6">
                        <div className="bg-white/60 dark:bg-black/60 backdrop-blur-sm rounded-xl p-4 border border-black dark:border-white">
                            <div className="flex items-center gap-2 text-black dark:text-white mb-1">
                                <CheckCircle size={18} />
                                <span className="text-sm font-semibold">Completed</span>
                            </div>
                            <div className="text-lg font-bold text-black dark:text-white">{completedCount}</div>
                        </div>
                        <div className="bg-white/60 dark:bg-black/60 backdrop-blur-sm rounded-xl p-4 border border-black dark:border-white">
                            <div className="flex items-center gap-2 text-black dark:text-white mb-1">
                                <Zap size={18} />
                                <span className="text-sm font-semibold">Active</span>
                            </div>
                            <div className="text-2xl font-black text-black dark:text-white">
                                {plan.modules.filter(m => m.status === 'in_progress').length}
                            </div>
                        </div>
                        <div className="bg-white/60 dark:bg-black/60 backdrop-blur-sm rounded-xl p-4 border border-black dark:border-white">
                            <div className="flex items-center gap-2 text-gray-500 mb-1">
                                <Clock size={18} />
                                <span className="text-sm font-semibold">Remaining</span>
                            </div>
                            <div className="text-2xl font-black text-black dark:text-white">{totalCount - completedCount}</div>
                        </div>
                    </div>
                </div>

                {/* Modules List */}
                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-black dark:text-white flex items-center gap-2">
                        <Target size={24} className="text-black dark:text-white" />
                        Learning Modules
                    </h3>
                    {plan.modules.map((module, index) => (
                        <ModuleItem
                            key={module.moduleId}
                            module={module}
                            pathId={plan._id}
                            onModuleUpdate={fetchPaths}
                            onLocalModuleUpdate={handleLocalModuleUpdate}
                            isNextUp={nextUpModule?.moduleId === module.moduleId}
                            handleNewChat={handleNewChat}
                        />
                    ))}
                </div>
            </motion.div>
        );
    };

    return (
        <div className="h-screen flex flex-col bg-white dark:bg-black text-black dark:text-white font-sans">
            {/* Header */}
            <header className="flex-shrink-0 bg-white dark:bg-black backdrop-blur-xl border-b border-black dark:border-white shadow-lg">
                <div className="max-w-7xl mx-auto px-6 py-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <motion.div
                                className="p-3 rounded-2xl bg-black dark:bg-white shadow-lg"
                                whileHover={{ rotate: 360, scale: 1.1 }}
                                transition={{ duration: 0.6 }}
                            >
                                <GraduationCap className="w-8 h-8 text-white dark:text-black" />
                            </motion.div>
                            <h1 className="text-xl font-bold text-black dark:text-white">
                                My Study Plans
                            </h1>
                        </div>

                        <motion.button
                            onClick={() => setShowCreatePlanModal(true)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-6 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-bold shadow-xl flex items-center gap-2 relative overflow-hidden group"
                        >
                            <Plus size={20} className="relative z-10" />
                            <span className="relative z-10">Create New Plan</span>
                            <Sparkles size={18} className="relative z-10" />
                        </motion.button>
                    </div>
                </div>
            </header>

            {/* Navigation Bar */}
            <div className="flex-shrink-0 bg-white dark:bg-black border-b border-black dark:border-white px-6 py-3">
                {selectedStudyPlan ? (
                    <button
                        onClick={() => setSelectedStudyPlan(null)}
                        className="flex items-center gap-2 text-black dark:text-white font-semibold transition-colors group"
                    >
                        <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                        Back to All Plans
                    </button>
                ) : (
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-black dark:text-white font-semibold transition-colors group"
                    >
                        <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                        Back to Main App
                    </Link>
                )}
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-7xl mx-auto p-6">
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center py-20"
                        >
                            <div className="relative">
                                <motion.div
                                    className="w-16 h-16 rounded-full border-4 border-black dark:border-white"
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                />
                            </div>
                            <p className="mt-6 text-lg font-semibold text-black dark:text-white">Loading your plans...</p>
                        </motion.div>
                    )}

                    {error && !isLoading && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-700 rounded-2xl p-8 text-center"
                        >
                            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
                            <p className="text-red-700 dark:text-red-300 font-semibold mb-4">{error}</p>
                            <Button onClick={fetchPaths} size="sm" variant="outline">Retry</Button>
                        </motion.div>
                    )}

                    <AnimatePresence mode="wait">
                        {selectedStudyPlan ? (
                            <motion.div
                                key="study-plan-details-view"
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                transition={{ duration: 0.3 }}
                            >
                                {renderStudyPlanDetails(selectedStudyPlan)}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="study-plan-list-view"
                                initial={{ opacity: 0, x: -50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 50 }}
                                transition={{ duration: 0.3 }}
                            >
                                {!isLoading && !error && learningPaths.length === 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-center py-20"
                                    >
                                        <div className="mb-6">
                                            <motion.div
                                                animate={{ rotate: [0, 10, -10, 0] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                className="inline-block p-6 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40"
                                            >
                                                <GraduationCap size={64} className="text-purple-600 dark:text-purple-400" />
                                            </motion.div>
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">No Study Plans Yet</h3>
                                        <p className="text-gray-600 dark:text-gray-400 mb-6">Create your first personalized learning plan to get started!</p>
                                        <motion.button
                                            onClick={() => setShowCreatePlanModal(true)}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            className="px-8 py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black font-bold shadow-xl inline-flex items-center gap-2"
                                        >
                                            <Sparkles size={20} />
                                            Create My First Plan
                                        </motion.button>
                                    </motion.div>
                                )}

                                {!isLoading && !error && learningPaths.length > 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {learningPaths.map((path, index) => {
                                            const isCompleted = path.modules.every(m => m.status === 'completed');
                                            const hasStarted = !isCompleted && path.modules.some(m => m.status !== 'not_started' && m.status !== 'locked');
                                            const completedCount = path.modules.filter(m => m.status === 'completed').length;
                                            const totalCount = path.modules.length;
                                            const progressPercentage = (completedCount / totalCount) * 100;

                                            return (
                                                <motion.div
                                                    key={path._id}
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: index * 0.1 }}
                                                    whileHover={{ y: -8, scale: 1.02 }}
                                                    onClick={() => setSelectedStudyPlan(path)}
                                                    className="group cursor-pointer bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl overflow-hidden border-2 border-purple-200/50 dark:border-purple-700/50 hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-2xl hover:shadow-purple-300/50 dark:hover:shadow-purple-700/50 transition-all duration-300"
                                                >
                                                    {/* Card Header */}
                                                    <div className={`p-6 bg-gradient-to-br ${isCompleted
                                                        ? 'from-emerald-500 to-teal-600'
                                                        : hasStarted
                                                            ? 'from-purple-500 via-pink-500 to-violet-600'
                                                            : 'from-gray-400 to-gray-500'
                                                        }`}>
                                                        <div className="flex items-start justify-between mb-4">
                                                            <div className="flex-1">
                                                                <h3 className="text-xl font-bold text-white mb-2 line-clamp-2 group-hover:scale-105 transition-transform">
                                                                    {path.title}
                                                                </h3>
                                                            </div>
                                                            <IconButton
                                                                icon={Trash2}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setPlanToDelete(path);
                                                                    setShowDeleteConfirmModal(true);
                                                                }}
                                                                title="Delete Study Plan"
                                                                size="sm"
                                                                variant="ghost"
                                                                className="text-white/80 hover:text-white hover:bg-white/20"
                                                            />
                                                        </div>

                                                        {/* Progress */}
                                                        <div className="mt-4">
                                                            <div className="flex justify-between text-white text-sm mb-2 font-semibold">
                                                                <span>{completedCount}/{totalCount} modules</span>
                                                                <span>{Math.round(progressPercentage)}%</span>
                                                            </div>
                                                            <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                                                                <motion.div
                                                                    className="h-full bg-white rounded-full"
                                                                    initial={{ width: 0 }}
                                                                    animate={{ width: `${progressPercentage}%` }}
                                                                    transition={{ duration: 1, delay: index * 0.1 }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Card Body */}
                                                    <div className="p-6">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                {isCompleted ? (
                                                                    <>
                                                                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                                                                        <span className="font-semibold text-emerald-600">Completed</span>
                                                                    </>
                                                                ) : hasStarted ? (
                                                                    <>
                                                                        <TrendingUp className="w-5 h-5 text-purple-600" />
                                                                        <span className="font-semibold text-purple-600">In Progress</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Clock className="w-5 h-5 text-gray-500" />
                                                                        <span className="font-semibold text-gray-500">Not Started</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            <ArrowRight className="w-5 h-5 text-purple-600 group-hover:translate-x-2 transition-transform" />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* Modals */}
            <Modal
                isOpen={showCreatePlanModal}
                onClose={() => setShowCreatePlanModal(false)}
                title="Create Your Perfect Study Plan"
                size="lg"
            >
                <CreatePlan onPlanCreated={() => { fetchPaths(); setShowCreatePlanModal(false); }} />
            </Modal>

            <Modal
                isOpen={showDeleteConfirmModal}
                onClose={() => setShowDeleteConfirmModal(false)}
                title="Delete Study Plan?"
                size="sm"
                footerContent={
                    <>
                        <Button variant="secondary" onClick={() => setShowDeleteConfirmModal(false)}>Cancel</Button>
                        <Button variant="danger" onClick={handleDeletePlan}>Delete</Button>
                    </>
                }
            >
                <p className="text-center text-gray-700 dark:text-gray-300 text-lg py-4">
                    Are you sure you want to delete <span className="font-bold">"{planToDelete?.title}"</span>?
                    <br />
                    <span className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone.</span>
                </p>
            </Modal>
        </div>
    );
};

export default StudyPlanPage;
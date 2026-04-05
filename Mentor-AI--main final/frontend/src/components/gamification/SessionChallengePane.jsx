import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Brain, Send, Save } from 'lucide-react';
import Card from '../core/Card';
import Button from '../core/Button';
import Badge from '../core/Badge';
import api from '../../services/api';
import toast from 'react-hot-toast';

const getDraftKey = (bountyId) => `session-assessment-draft:${bountyId}`;

const SessionChallengePane = ({ bounty, onCompleted, draftResetToken = 0 }) => {
    const [answers, setAnswers] = useState(() => {
        try {
            const raw = localStorage.getItem(getDraftKey(bounty?._id));
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }); // { index: "answer" }
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [lastSavedAt, setLastSavedAt] = useState(null);

    const questions = bounty.sessionQuestions || [];

    const answeredCount = useMemo(
        () => Object.values(answers).filter((value) => String(value || '').trim().length > 0).length,
        [answers]
    );

    const progressPercent = questions.length > 0
        ? Math.round((answeredCount / questions.length) * 100)
        : 0;

    useEffect(() => {
        try {
            localStorage.setItem(getDraftKey(bounty._id), JSON.stringify(answers));
            setLastSavedAt(Date.now());
        } catch {
            // Best-effort draft persistence.
        }
    }, [answers, bounty._id]);

    useEffect(() => {
        setAnswers({});
        setLastSavedAt(null);
        try {
            localStorage.removeItem(getDraftKey(bounty._id));
        } catch {
            // Ignore localStorage cleanup failures.
        }
    }, [bounty._id, draftResetToken]);

    const handleInputChange = (index, text) => {
        setAnswers(prev => ({ ...prev, [index]: text }));
    };

    const handleSubmit = async () => {
        if (answeredCount === 0) {
            toast.error("Please answer at least one question before submitting.");
            return;
        }

        if (!window.confirm(`You have answered ${answeredCount} out of ${questions.length} questions. Submit now?`)) {
            return;
        }

        setIsSubmitting(true);
        try {
            const submissionResult = await api.submitSessionChallenge(bounty._id, answers);
            setResult(submissionResult);
            toast.success("Assessment Submitted!");
            localStorage.removeItem(getDraftKey(bounty._id));

            if (onCompleted) {
                onCompleted(submissionResult);
            }
        } catch (error) {
            console.error("Submission failed:", error);
            toast.error("Failed to submit assessment. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // If already solved (loaded from history or just submitted)
    if (bounty.isSolved || result) {
        // We might want to show a summary here, but the page logic says "disappear from Active Questions".
        // However, if we just submitted, we might want to see the feedback immediately before it disappears?
        // The requirement says: "Visibility: Once submitted, this specific set of questions must disappear from the 'Active Questions' pane."
        // AND "Assessment Insights Panel: Automatically update this section with the results."
        // So we should probably just return null or a "Completed" state if the parent doesn't immediately remove it.
        // But for UX, showing the results briefly is nice. 
        // Let's rely on the parent to remove it from the list, but if it's still passed, show feedback.

        const displayResult = result || {
            score: bounty.userScore,
            feedback: bounty.aiFeedback,
            strongAreas: bounty.strongAreas,
            weakAreas: bounty.weakAreas
        };

        return (
            <Card className="border-l-4 border-green-500 shadow-lg mb-6 bg-green-500/5">
                <div className="p-6 text-center">
                    <div className="inline-flex items-center justify-center p-3 bg-green-500/10 rounded-full mb-4">
                        <CheckCircle2 size={32} className="text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-green-700 mb-2">Assessment Completed!</h3>
                    <p className="text-text-muted-light mb-4">Your insights have been updated.</p>
                    <div className="text-3xl font-black text-primary mb-2">{displayResult.score}%</div>
                    <p className="text-sm italic opacity-75">{displayResult.feedback}</p>
                </div>
            </Card>
        );
    }

    return (
        <Card className="border-l-4 border-purple-500 shadow-xl mb-8 overflow-hidden">
            <div className="bg-purple-500/10 p-4 border-b border-purple-500/10 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Brain className="text-purple-600 dark:text-purple-400" size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-purple-900 dark:text-purple-100">Session Mastery Assessment</h2>
                        <p className="text-xs text-purple-700 dark:text-purple-300">Evaluate your understanding of the recent session.</p>
                    </div>
                </div>
                <Badge variant="outline" className="bg-background-light/50 backdrop-blur-sm border-purple-500/30">
                    {questions.length} Questions
                </Badge>
            </div>

            <div className="px-6 pt-4">
                <div className="mb-1 flex items-center justify-between text-[11px] text-purple-800/80 dark:text-purple-200/80">
                    <span>Progress: {answeredCount}/{questions.length}</span>
                    <span>{progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-purple-100 dark:bg-purple-950/40">
                    <div
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            <div className="p-6 space-y-8">
                {questions.map((q, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="relative"
                    >
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-light border border-border-light flex items-center justify-center font-bold text-text-muted-light text-sm shadow-sm">
                                {idx + 1}
                            </div>
                            <div className="flex-grow space-y-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{q.subTopic}</Badge>
                                        <span className="text-[10px] text-text-muted-light border border-border-light px-1.5 py-0.5 rounded">{q.difficulty}</span>
                                    </div>
                                    <p className="font-medium text-text-light dark:text-text-dark text-base leading-relaxed">
                                        {q.questionText}
                                    </p>
                                </div>

                                <textarea
                                    className="w-full p-4 rounded-xl border border-border-light dark:border-border-dark bg-background-light/50 dark:bg-background-dark/50 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all resize-y min-h-[100px] text-sm"
                                    placeholder="Type your answer here..."
                                    value={answers[idx] || ''}
                                    onChange={(e) => handleInputChange(idx, e.target.value)}
                                />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 p-6 border-t border-border-light dark:border-border-dark flex justify-between items-center">
                <div className="text-xs text-text-muted-light">
                    <div>
                        <span className="font-bold text-primary">{answeredCount}</span> of {questions.length} answered
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1">
                        <Save size={12} />
                        Draft {lastSavedAt ? `saved at ${new Date(lastSavedAt).toLocaleTimeString()}` : 'auto-save enabled'}
                    </div>
                </div>
                <Button
                    onClick={handleSubmit}
                    isLoading={isSubmitting}
                    disabled={answeredCount === 0}
                    variant="primary"
                    size="lg"
                    className="shadow-lg shadow-purple-500/20"
                    rightIcon={<Send size={18} />}
                >
                    Submit Assessment
                </Button>
            </div>
        </Card>
    );
};

export default SessionChallengePane;

// frontend/src/pages/ChallengesPage.jsx
// Gamification: challenges and leaderboard implemented

import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, ArrowRight, Brain, Link as LinkIcon, CheckCircle2, Sparkles, ArrowLeft, History, Filter, RotateCcw, Save, X, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../services/api';
import Button from '../components/core/Button.jsx';
import Card from '../components/core/Card.jsx';
import Badge from '../components/core/Badge.jsx';
import { motion, AnimatePresence } from 'framer-motion';

import { useNavigate } from 'react-router-dom';
import QuizModal from '../components/gamification/QuizModal.jsx';
import MasteryReport from '../components/gamification/MasteryReport.jsx';
import SessionChallengePane from '../components/gamification/SessionChallengePane.jsx';
import WellnessChallenges from '../components/wellness/WellnessChallenges.jsx';
import toast from 'react-hot-toast';

const INLINE_DRAFTS_KEY = 'challenge-inline-drafts-v1';

const ChallengesPage = () => {
    const [bounties, setBounties] = useState([]);
    const [reports, setReports] = useState([]);
    const [userScore, setUserScore] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Quiz State
    const [selectedQuizBounty, setSelectedQuizBounty] = useState(null);
    const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [forceShowReport, setForceShowReport] = useState(false); // Debug/Demo toggle
    const [isQuizTopicModalOpen, setIsQuizTopicModalOpen] = useState(false);
    const [quizTopicInput, setQuizTopicInput] = useState('');

    // Local state for inline answers
    const [answerInputs, setAnswerInputs] = useState({}); // { bountyId: "answer text" }
    const [submittingIds, setSubmittingIds] = useState(new Set()); // Set of bountyIds currently submitting
    const [submissionResults, setSubmissionResults] = useState({}); // { bountyId: { score, feedback, solved } }
    const [expandedBounties, setExpandedBounties] = useState(new Set()); // Set of bountyIds with expanded input
    const [selectedSessionChallengeId, setSelectedSessionChallengeId] = useState('');
    const [topicFilter, setTopicFilter] = useState('all');
    const [difficultyFilter, setDifficultyFilter] = useState('all');
    const [regeneratingWeakTopics, setRegeneratingWeakTopics] = useState(new Set());
    const [draftResetToken, setDraftResetToken] = useState(0);
    const [isRetryingWrongOnly, setIsRetryingWrongOnly] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(INLINE_DRAFTS_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            if (parsed && typeof parsed === 'object') {
                setAnswerInputs(parsed);
            }
        } catch {
            // Ignore draft restore failures and continue with empty state.
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(INLINE_DRAFTS_KEY, JSON.stringify(answerInputs));
        } catch {
            // Ignore draft save failures.
        }
    }, [answerInputs]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [bountyData, reportData, scoreData] = await Promise.all([
                api.getBounties().catch(e => { console.error("Bounties fetch error:", e); return []; }),
                api.getReports().catch(e => { console.error("Reports fetch error:", e); return []; }),
                api.getUserScore().catch(() => null)
            ]);

            setBounties(bountyData || []);
            setReports(reportData || []);
            setUserScore(scoreData);
        } catch (err) {
            console.error("Failed to fetch data:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (bountyId) => {
        setExpandedBounties(prev => {
            const next = new Set(prev);
            if (next.has(bountyId)) next.delete(bountyId);
            else next.add(bountyId);
            return next;
        });
    };

    const handleInputChange = (bountyId, text) => {
        setAnswerInputs(prev => ({ ...prev, [bountyId]: text }));
    };

    const handleSubmitAnswer = async (bountyId) => {
        const answer = answerInputs[bountyId];
        if (!answer || !answer.trim()) return;

        setSubmittingIds(prev => new Set(prev).add(bountyId));
        try {
            const result = await api.submitChallengeAnswer(bountyId, answer);

            // Save local result to show immediately
            setSubmissionResults(prev => ({ ...prev, [bountyId]: result }));
            setAnswerInputs(prev => {
                const next = { ...prev };
                delete next[bountyId];
                return next;
            });

            // If it was an aggregated report trigger (last question of session)
            if (result.isAggregatedReport) {
                toast.success("Session Completed! Master Assessment Report Generated.");
                // Fetch new reports to update the side panel
                fetchData();
            } else if (result.solved) {
                toast.success(`Correct! Score: ${result.score}`);
                // Refresh to update XP/Credits
                fetchData();
            } else {
                toast("Submitted. Check feedback.", { icon: '📝' });
            }

        } catch (error) {
            console.error("Submission failed:", error);
            toast.error("Failed to submit answer.");
        } finally {
            setSubmittingIds(prev => {
                const next = new Set(prev);
                next.delete(bountyId);
                return next;
            });
        }
    };

    const handleRegenerateWeakQuestion = async (subTopic, recommendation) => {
        const topic = String(subTopic || '').trim();
        if (!topic) {
            toast.error('Missing weak topic for regeneration.');
            return;
        }

        setRegeneratingWeakTopics((prev) => new Set(prev).add(topic));
        try {
            const response = await api.regenerateWeakTopicChallenge(topic);
            const bounty = response?.bounty || response;
            if (bounty?._id) {
                setBounties((prev) => [bounty, ...prev]);
                toast.success(`New focused question added for ${topic}.`);
            } else {
                toast.error('Could not generate focused question right now.');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to regenerate focused question.');
        } finally {
            setRegeneratingWeakTopics((prev) => {
                const next = new Set(prev);
                next.delete(topic);
                return next;
            });
        }
    };

    const handleClearAllDrafts = () => {
        try {
            localStorage.removeItem(INLINE_DRAFTS_KEY);

            const sessionDraftKeys = [];
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (key && key.startsWith('session-assessment-draft:')) {
                    sessionDraftKeys.push(key);
                }
            }

            sessionDraftKeys.forEach((key) => localStorage.removeItem(key));
        } catch {
            // Ignore localStorage cleanup failures.
        }

        setAnswerInputs({});
        setDraftResetToken((prev) => prev + 1);
        toast.success('All challenge drafts cleared.');
    };

    const handleRetryWrongOnly = async () => {
        const latestReport = Array.isArray(reports) && reports.length > 0 ? reports[0] : null;
        const weakItems = latestReport?.improvementsNeeded || latestReport?.weaknesses || [];
        const weakTopics = Array.from(new Set(
            weakItems
                .map((item) => (typeof item === 'string' ? item : (item?.subTopic || item?.area || item?.topic || '')))
                .map((topic) => String(topic || '').trim())
                .filter(Boolean)
        )).slice(0, 3);

        if (weakTopics.length === 0) {
            toast('No weak-topic recommendations found yet. Complete an assessment first.', { icon: 'ℹ️' });
            return;
        }

        setIsRetryingWrongOnly(true);
        let generated = 0;
        try {
            for (const topic of weakTopics) {
                try {
                    const response = await api.regenerateWeakTopicChallenge(topic);
                    const bounty = response?.bounty || response;
                    if (bounty?._id) {
                        setBounties((prev) => [bounty, ...prev]);
                        generated += 1;
                    }
                } catch {
                    // Continue generating remaining weak-topic retries.
                }
            }

            if (generated > 0) {
                toast.success(`Added ${generated} retry challenge${generated > 1 ? 's' : ''} from weak topics.`);
            } else {
                toast.error('Could not generate retry challenges right now.');
            }
        } finally {
            setIsRetryingWrongOnly(false);
        }
    };

    const handleAttempt = (bounty) => {
        if (bounty.type === 'Quiz') {
            setSelectedQuizBounty(bounty);
            setIsQuizModalOpen(true);
        } else {
            // Toggle inline input mode
            toggleExpand(bounty._id);
        }
    };

    const handleGenerateQuiz = async () => {
        setQuizTopicInput('');
        setIsQuizTopicModalOpen(true);
    };

    const handleCreateQuizFromTopic = async () => {
        const topic = quizTopicInput.trim();
        if (!topic) {
            toast.error('Please enter a topic to generate a quiz.');
            return;
        }

        setIsGenerating(true);
        setIsQuizTopicModalOpen(false);
        const toastId = toast.loading(`Generating quiz for "${topic}"...`);
        try {
            const newBounty = await api.generateQuizChallenge(topic);
            if (newBounty) {
                setBounties((prev) => [newBounty, ...prev]);
                toast.success("Quiz generated! Click 'Attempt Challenge' to start.", { id: toastId });
            } else {
                toast.error('Quiz generation returned an empty response.', { id: toastId });
            }
        } catch (error) {
            console.error("Quiz generation failed:", error);
            toast.error("Failed to generate quiz.", { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleQuizCompleted = (result) => {
        fetchData();
    };

    const handleLearnTopic = (topic, recommendation) => {
        let query = `I want to improve my understanding of "${topic}". Can you help me learn it?`;
        // If we have a specific remediation prompt/recommendation, use that instead!
        if (recommendation && recommendation.trim()) {
            query = recommendation;
        }
        navigate('/', { state: { challengeQuery: query } });
    };

    const uniqueBounties = useMemo(() => {
        const source = Array.isArray(bounties) ? bounties : [];

        // First, remove exact duplicates by id while preserving first-seen order.
        const seenIds = new Set();
        return source.filter((b) => {
            const id = String(b?._id || '');
            if (!id || seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
        });
    }, [bounties]);

    const sessionChallengePool = useMemo(
        () => uniqueBounties
            .filter((b) => b.type === 'SessionChallenge')
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
        [uniqueBounties]
    );

    const selectedSessionChallenge = useMemo(() => {
        if (sessionChallengePool.length === 0) return null;
        if (selectedSessionChallengeId) {
            const selected = sessionChallengePool.find((b) => String(b._id) === String(selectedSessionChallengeId));
            if (selected) return selected;
        }
        return sessionChallengePool[0];
    }, [selectedSessionChallengeId, sessionChallengePool]);

    const nonSessionChallenges = useMemo(
        () => uniqueBounties.filter((b) => b.type !== 'SessionChallenge'),
        [uniqueBounties]
    );

    const availableTopics = useMemo(
        () => Array.from(new Set(nonSessionChallenges.map((b) => b.topic).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
        [nonSessionChallenges]
    );

    const filteredNonSessionChallenges = useMemo(
        () => nonSessionChallenges.filter((b) => {
            const topicOk = topicFilter === 'all' || b.topic === topicFilter;
            const difficultyOk = difficultyFilter === 'all' || (b.difficulty || 'Medium') === difficultyFilter;
            return topicOk && difficultyOk;
        }),
        [difficultyFilter, nonSessionChallenges, topicFilter]
    );

    const displayBounties = useMemo(() => {
        if (selectedSessionChallenge) {
            return [selectedSessionChallenge, ...filteredNonSessionChallenges];
        }
        return filteredNonSessionChallenges;
    }, [filteredNonSessionChallenges, selectedSessionChallenge]);

    const hiddenSessionAssessmentCount = Math.max(0, sessionChallengePool.length - (selectedSessionChallenge ? 1 : 0));

    const openEndedVisibleChallenges = useMemo(
        () => filteredNonSessionChallenges.filter((b) => b.type !== 'Quiz' && !b.isSolved),
        [filteredNonSessionChallenges]
    );

    const draftedOpenEndedCount = useMemo(
        () => openEndedVisibleChallenges.filter((b) => String(answerInputs[b._id] || '').trim().length > 0).length,
        [answerInputs, openEndedVisibleChallenges]
    );

    const topicTrends = useMemo(() => {
        const grouped = new Map();
        for (const report of reports || []) {
            const key = report.topic || 'General';
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(report.score || 0);
        }

        return Array.from(grouped.entries())
            .map(([topic, scores]) => {
                const latest = scores[0] || 0;
                const previousWindow = scores.slice(1, 4);
                const previousAvg = previousWindow.length > 0
                    ? previousWindow.reduce((sum, n) => sum + n, 0) / previousWindow.length
                    : latest;
                const delta = Number((latest - previousAvg).toFixed(1));
                return {
                    topic,
                    latest,
                    delta,
                    direction: delta > 1 ? 'up' : delta < -1 ? 'down' : 'flat',
                };
            })
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 6);
    }, [reports]);

    useEffect(() => {
        if (selectedSessionChallengeId && !sessionChallengePool.some((b) => String(b._id) === String(selectedSessionChallengeId))) {
            setSelectedSessionChallengeId('');
        }
    }, [selectedSessionChallengeId, sessionChallengePool]);

    // Keep preview mode deterministic so the toggle always behaves as expected.
    const showMasteryReport = forceShowReport;

    if (loading) {
        return (
            <div className="container mx-auto p-8 pt-24 text-center">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
                <p className="text-text-muted-light dark:text-text-muted-dark">Loading your personalized challenges...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pt-20 pb-12 overflow-y-auto">
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                {/* Back Button */}
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 mb-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                    <ArrowLeft size={20} />
                    <span>Back</span>
                </button>

                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-rose-500/10 rounded-xl">
                        <Trophy className="text-rose-600 dark:text-rose-400" size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-text-light dark:text-text-dark">Personalized Challenges</h1>
                        <p className="text-text-muted-light dark:text-text-muted-dark">Tailored questions based on your recent learning sessions</p>
                    </div>
                </div>

                <div className="flex justify-end mb-6 items-center">
                    <button
                        onClick={() => setForceShowReport(!forceShowReport)}
                        className="mr-3 px-3 py-2 text-xs font-mono text-primary/50 hover:text-primary transition-colors border border-primary/20 rounded-lg"
                        title="Toggle Report View (Demo)"
                    >
                        {forceShowReport ? "Show Active Challenges" : "Preview Mastery Report"}
                    </button>

                    <Button
                        onClick={handleGenerateQuiz}
                        disabled={isGenerating}
                        rightIcon={isGenerating ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Sparkles size={16} />}
                    >
                        Generate New Quiz
                    </Button>

                    <Button
                        onClick={handleRetryWrongOnly}
                        disabled={isRetryingWrongOnly}
                        variant="secondary"
                        className="ml-3"
                        rightIcon={isRetryingWrongOnly ? <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <RotateCcw size={16} />}
                    >
                        Retry Wrong Only
                    </Button>
                </div>

                {error && (
                    <div className="mb-8 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 text-sm">
                        <strong>Error:</strong> {error}. Some features might be unavailable.
                        <button onClick={fetchData} className="ml-2 underline font-bold">Retry</button>
                    </div>
                )}

                {userScore && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                        <Card className="p-4 bg-primary/5 border-primary/10">
                            <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Current Level</div>
                            <div className="text-2xl font-black">{userScore.level}</div>
                        </Card>
                        <Card className="p-4 bg-amber-500/5 border-amber-500/10">
                            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Total XP</div>
                            <div className="text-2xl font-black">{userScore.totalXP}</div>
                        </Card>
                        <Card className="p-4 bg-rose-500/5 border-rose-500/10">
                            <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-1">Testing Credits</div>
                            <div className="text-2xl font-black">{Math.round(userScore.testingCredits || 0)}</div>
                        </Card>
                        <Card className="p-4 bg-indigo-500/5 border-indigo-500/10">
                            <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Assessments</div>
                            <div className="text-2xl font-black">{Math.max(reports.length, userScore.completedAssessments || 0)}</div>
                        </Card>
                    </div>
                )}

                <div className="mb-8">
                    <WellnessChallenges onWellnessUpdate={fetchData} />
                </div>

                {showMasteryReport ? (
                    <MasteryReport reports={reports} />
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Active Bounties / Personalized Questions */}
                        <section>
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <Brain size={20} className="text-primary" />
                                Active Questions
                            </h2>
                            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div className="rounded-lg border border-border-light dark:border-border-dark p-3">
                                    <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted-light dark:text-text-muted-dark">
                                        <History size={12} /> Session History
                                    </p>
                                    <select
                                        value={selectedSessionChallenge?._id || ''}
                                        onChange={(e) => setSelectedSessionChallengeId(e.target.value)}
                                        className="w-full rounded-md border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-2 py-2 text-xs"
                                        disabled={sessionChallengePool.length <= 1}
                                    >
                                        {sessionChallengePool.length === 0 && <option value="">No Session Assessment</option>}
                                        {sessionChallengePool.map((challenge) => (
                                            <option key={challenge._id} value={challenge._id}>
                                                {new Date(challenge.createdAt || Date.now()).toLocaleString()}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="rounded-lg border border-border-light dark:border-border-dark p-3">
                                    <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted-light dark:text-text-muted-dark">
                                        <Filter size={12} /> Topic Filter
                                    </p>
                                    <select
                                        value={topicFilter}
                                        onChange={(e) => setTopicFilter(e.target.value)}
                                        className="w-full rounded-md border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-2 py-2 text-xs"
                                    >
                                        <option value="all">All Topics</option>
                                        {availableTopics.map((topic) => (
                                            <option key={topic} value={topic}>{topic}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="rounded-lg border border-border-light dark:border-border-dark p-3">
                                    <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted-light dark:text-text-muted-dark">
                                        <Filter size={12} /> Difficulty Filter
                                    </p>
                                    <select
                                        value={difficultyFilter}
                                        onChange={(e) => setDifficultyFilter(e.target.value)}
                                        className="w-full rounded-md border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-2 py-2 text-xs"
                                    >
                                        <option value="all">All Levels</option>
                                        <option value="Easy">Easy</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Hard">Hard</option>
                                    </select>
                                </div>
                            </div>

                            <div className="mb-4 rounded-lg border border-border-light dark:border-border-dark p-3 text-xs text-text-muted-light dark:text-text-muted-dark">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="inline-flex items-center gap-1"><Save size={12} /> Inline Draft Progress</span>
                                    <div className="flex items-center gap-2">
                                        <span>{draftedOpenEndedCount}/{openEndedVisibleChallenges.length} drafted</span>
                                        <button
                                            type="button"
                                            onClick={handleClearAllDrafts}
                                            className="rounded border border-border-light dark:border-border-dark px-2 py-1 text-[10px] font-semibold hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            Clear all drafts
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {hiddenSessionAssessmentCount > 0 && (
                                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-violet-700 dark:text-violet-300">
                                        Showing latest Session Mastery Assessment. {hiddenSessionAssessmentCount} older duplicate assessment(s) hidden.
                                    </div>
                                )}

                                {displayBounties.length > 0 ? (
                                    displayBounties.map((bounty) => {
                                        // Specific handling for the new SessionChallenge type
                                        if (bounty.type === 'SessionChallenge') {
                                            return (
                                                <SessionChallengePane
                                                    key={bounty._id}
                                                    bounty={bounty}
                                                    draftResetToken={draftResetToken}
                                                    onCompleted={() => {
                                                        // Refresh data to update reports and remove this pane from active list
                                                        fetchData();
                                                    }}
                                                />
                                            );
                                        }

                                        const isExpanded = expandedBounties.has(bounty._id);
                                        const isSubmitting = submittingIds.has(bounty._id);
                                        const result = submissionResults[bounty._id];
                                        const isQuiz = bounty.type === 'Quiz';

                                        return (
                                            <Card key={bounty._id} className="border-l-4 border-rose-500 shadow-md transition-all duration-300">
                                                <div className="p-4">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <Badge variant="secondary" className="text-[10px]">{bounty.topic}</Badge>
                                                        <Badge variant="outline" className="text-[10px] uppercase">{bounty.difficulty || 'Medium'}</Badge>
                                                    </div>
                                                    <p className="text-lg font-medium mb-3">{bounty.question || `${bounty.topic} Quiz`}</p>
                                                    <div className="flex items-center gap-2 text-xs text-text-muted-light mb-4 italic">
                                                        <Sparkles size={12} className="text-amber-500" />
                                                        {bounty.context || "Generated specifically for your proficiency level."}
                                                    </div>

                                                    {/* Pre-Answer / Default View */}
                                                    {!result && !isQuiz && !bounty.isSolved && (
                                                        <div className="space-y-3">
                                                            {isExpanded && (
                                                                <textarea
                                                                    className="w-full p-3 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark focus:ring-2 focus:ring-primary focus:outline-none resize-y min-h-[100px]"
                                                                    placeholder="Type your answer here..."
                                                                    value={answerInputs[bounty._id] || ''}
                                                                    onChange={(e) => handleInputChange(bounty._id, e.target.value)}
                                                                    disabled={isSubmitting}
                                                                />
                                                            )}
                                                            <div className="flex justify-end gap-2">
                                                                {isExpanded && (
                                                                    <Button
                                                                        variant="primary"
                                                                        size="sm"
                                                                        onClick={() => handleSubmitAnswer(bounty._id)}
                                                                        isLoading={isSubmitting}
                                                                        disabled={!answerInputs[bounty._id]?.trim()}
                                                                    >
                                                                        Submit Answer
                                                                    </Button>
                                                                )}
                                                                {!isExpanded && (
                                                                    <Button
                                                                        variant="primary"
                                                                        size="sm"
                                                                        fullWidth
                                                                        rightIcon={<ArrowRight size={16} />}
                                                                        onClick={() => handleAttempt(bounty)}
                                                                    >
                                                                        Attempt Challenge
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Button for Quiz Type */}
                                                    {isQuiz && !result && !bounty.isSolved && (
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            fullWidth
                                                            rightIcon={<ArrowRight size={16} />}
                                                            onClick={() => handleAttempt(bounty)}
                                                        >
                                                            Start Quiz
                                                        </Button>
                                                    )}

                                                    {/* Post-Submit Result View */}
                                                    {(result || bounty.isSolved) && (
                                                        <div className={`mt-4 p-3 rounded-lg border ${result?.solved || bounty.isSolved ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className={`font-bold ${result?.solved || bounty.isSolved ? 'text-green-600' : 'text-amber-600'}`}>
                                                                    {result?.solved || bounty.isSolved ? 'Solved!' : 'Feedback'}
                                                                </span>
                                                                {result && <span className="font-mono font-bold text-sm">Score: {result.score}/100</span>}
                                                            </div>
                                                            <p className="text-sm text-text-muted-light dark:text-text-muted-dark leading-snug">
                                                                {result?.feedback || bounty.aiFeedback || "Challenge completed."}
                                                            </p>
                                                            {result && result.isAggregatedReport && (
                                                                <div className="mt-2 text-xs font-bold text-primary flex items-center gap-1">
                                                                    <CheckCircle2 size={12} /> Master Report Generated
                                                                </div>
                                                            )}

                                                            {/* ACTIONABLE FEEDBACK / INSIGHTS */}
                                                            {((result?.strongAreas?.length > 0) || (result?.weakAreas?.length > 0) || (bounty.strongAreas?.length > 0) || (bounty.weakAreas?.length > 0)) && (
                                                                <div className="mt-4 pt-3 border-t border-border-light/50 dark:border-border-dark/50 space-y-3">
                                                                    {/* Strengths */}
                                                                    {(result?.strongAreas || bounty.strongAreas || []).length > 0 && (
                                                                        <div>
                                                                            <h4 className="text-[10px] uppercase font-bold text-green-600 mb-1 flex items-center gap-1">
                                                                                <CheckCircle2 size={10} /> Good Grasp
                                                                            </h4>
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {(result?.strongAreas || bounty.strongAreas).map((s, i) => (
                                                                                    <Badge key={i} variant="success" className="text-[10px] py-0 px-2">{s.subTopic || s}</Badge>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Weaknesses / Improvements */}
                                                                    {(result?.weakAreas || bounty.weakAreas || []).length > 0 && (
                                                                        <div>
                                                                            <h4 className="text-[10px] uppercase font-bold text-rose-600 mb-1 flex items-center gap-1">
                                                                                <LinkIcon size={10} /> Improvements
                                                                            </h4>
                                                                            <div className="space-y-2">
                                                                                {(result?.weakAreas || bounty.weakAreas).map((w, i) => (
                                                                                    <div
                                                                                        key={i}
                                                                                        onClick={() => handleLearnTopic(w.subTopic, w.recommendation)}
                                                                                        className="group flex flex-col gap-1 p-2 rounded bg-rose-500/5 hover:bg-rose-500/10 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 border border-rose-500/10 cursor-pointer transition-colors"
                                                                                    >
                                                                                        <div className="flex justify-between items-center">
                                                                                            <span className="text-xs font-bold text-rose-700 dark:text-rose-400">{w.subTopic}</span>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        handleRegenerateWeakQuestion(w.subTopic, w.recommendation);
                                                                                                    }}
                                                                                                    disabled={regeneratingWeakTopics.has(w.subTopic)}
                                                                                                    className="inline-flex items-center gap-1 rounded border border-rose-300/50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100/70 disabled:opacity-60 dark:border-rose-700/50 dark:text-rose-300 dark:hover:bg-rose-900/30"
                                                                                                >
                                                                                                    <RotateCcw size={10} />
                                                                                                    {regeneratingWeakTopics.has(w.subTopic) ? 'Generating...' : 'Regenerate 1'}
                                                                                                </button>
                                                                                                <span className="text-[10px] font-bold text-primary flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                                    Learn <ArrowRight size={8} />
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                        {w.recommendation && (
                                                                                            <span className="text-[10px] text-text-muted-light dark:text-text-muted-dark italic">
                                                                                                💡 {w.recommendation}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </Card>
                                        );
                                    })
                                ) : (
                                    <div className="p-12 text-center bg-surface-light dark:bg-surface-dark rounded-xl border border-dashed border-border-light dark:border-border-dark">
                                        <p className="text-text-muted-light">No active challenges. Chat with the Tutor to generate new ones!</p>
                                    </div>
                                )}

                                {/* FINISH BUTTON SECTION */}
                                {displayBounties.length > 0 && displayBounties.every(b => b.isSolved || submissionResults[b._id]?.solved) && (
                                    <div className="mt-8 flex justify-center">
                                        <Button
                                            variant="success"
                                            size="lg"
                                            rightIcon={<Trophy size={20} />}
                                            onClick={() => {
                                                toast.success("Great job! Assessment completed.");
                                                // Scroll to reports or refresh
                                                fetchData();
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            className="animate-pulse shadow-xl shadow-green-500/20"
                                        >
                                            Finish Assessment
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Improvement Reports */}
                        <section>
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <CheckCircle2 size={20} className="text-green-500" />
                                Assessment Insights
                            </h2>
                            {topicTrends.length > 0 && (
                                <Card className="mb-4 overflow-hidden">
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-3 border-b border-border-light dark:border-border-dark">
                                        <h3 className="text-sm font-bold">Topic Trend (Recent)</h3>
                                    </div>
                                    <div className="p-3 space-y-2">
                                        {topicTrends.map((item) => (
                                            <div key={item.topic} className="flex items-center justify-between rounded-md border border-border-light dark:border-border-dark px-2 py-1.5 text-xs">
                                                <span className="font-semibold">{item.topic}</span>
                                                <span className="inline-flex items-center gap-1">
                                                    <span className="font-bold">{Math.round(item.latest)}%</span>
                                                    {item.direction === 'up' && <span className="inline-flex items-center gap-0.5 text-emerald-600"><TrendingUp size={12} /> +{item.delta}</span>}
                                                    {item.direction === 'down' && <span className="inline-flex items-center gap-0.5 text-rose-600"><TrendingDown size={12} /> {item.delta}</span>}
                                                    {item.direction === 'flat' && <span className="text-slate-500">stable</span>}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            )}
                            <div className="space-y-6">
                                {reports.length > 0 ? (
                                    reports.map((report) => (
                                        <Card key={report._id} className="overflow-hidden">
                                            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
                                                <h3 className="font-bold">{report.topic}</h3>
                                                <div className="text-2xl font-black text-primary">{report.score}%</div>
                                            </div>
                                            <div className="p-4 space-y-4">
                                                {report.strengths?.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-bold uppercase text-green-600 dark:text-green-400 mb-2">Strengths</h4>
                                                        <div className="space-y-2">
                                                            {report.strengths.map((s, idx) => (
                                                                <div key={idx} className="p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <Badge variant="success" className="bg-green-500/10 text-green-700 dark:text-green-300 border-none text-[10px]">{s.topic || s}</Badge>
                                                                    </div>
                                                                    {s.reason && <p className="text-xs text-text-muted-light dark:text-text-muted-dark leading-tight">{s.reason}</p>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {(report.improvementsNeeded?.length > 0 || report.weaknesses?.length > 0) && (
                                                    <div>
                                                        <h4 className="text-xs font-bold uppercase text-rose-600 dark:text-rose-400 mb-2">Needed to improve</h4>
                                                        <div className="space-y-3">
                                                            {(report.improvementsNeeded || report.weaknesses).map((item, idx) => {
                                                                // Schema mismatch fix: TestResult uses 'subTopic', older ones might use 'area' or string
                                                                const topic = typeof item === 'string' ? item : (item.subTopic || item.area || item.topic);
                                                                const recommendation = typeof item === 'string' ? null : item.recommendation;
                                                                const reason = typeof item === 'string' ? null : item.reason;

                                                                return (
                                                                    <div
                                                                        key={idx}
                                                                        className="group cursor-pointer p-3 bg-rose-500/5 rounded-lg border border-rose-500/10 hover:bg-rose-500/10 transition-all"
                                                                        onClick={() => handleLearnTopic(topic)}
                                                                    >
                                                                        <div className="flex items-center justify-between mb-1.5">
                                                                            <span className="text-sm font-bold text-rose-700 dark:text-rose-400">{topic}</span>
                                                                            <div className="flex items-center gap-1 text-[10px] text-rose-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                LEARN THIS <LinkIcon size={12} />
                                                                            </div>
                                                                        </div>
                                                                        {reason && <p className="text-[11px] text-text-muted-light dark:text-text-muted-dark mb-1 leading-snug">{reason}</p>}
                                                                        {recommendation && (
                                                                            <div className="text-[10px] font-semibold text-rose-600/80 italic">
                                                                                Next: {recommendation}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </Card>
                                    ))
                                ) : (
                                    <div className="p-12 text-center bg-surface-light dark:bg-surface-dark rounded-xl border border-dashed border-border-light dark:border-border-dark">
                                        <p className="text-text-muted-light">Complete chat sessions to receive assessment reports and personalized feedback.</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}
            </div>

            <QuizModal
                isOpen={isQuizModalOpen}
                onClose={() => setIsQuizModalOpen(false)}
                bounty={selectedQuizBounty}
                onQuizCompleted={handleQuizCompleted}
            />

            <AnimatePresence>
                {isQuizTopicModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
                    >
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 10, opacity: 0 }}
                            className="w-full max-w-lg rounded-2xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-5 shadow-2xl"
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-lg font-bold text-text-light dark:text-text-dark">Generate New Quiz</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsQuizTopicModalOpen(false)}
                                    className="rounded-md p-1 text-text-muted-light dark:text-text-muted-dark hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <p className="mb-3 text-sm text-text-muted-light dark:text-text-muted-dark">
                                Enter a topic and a 5-question quiz will be generated.
                            </p>

                            <input
                                type="text"
                                value={quizTopicInput}
                                onChange={(e) => setQuizTopicInput(e.target.value)}
                                placeholder="e.g., React Hooks, Machine Learning"
                                className="w-full rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleCreateQuizFromTopic();
                                    }
                                }}
                            />

                            <div className="mt-4 flex justify-end gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsQuizTopicModalOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleCreateQuizFromTopic}
                                    isLoading={isGenerating}
                                    rightIcon={<Sparkles size={14} />}
                                >
                                    Generate
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ChallengesPage;

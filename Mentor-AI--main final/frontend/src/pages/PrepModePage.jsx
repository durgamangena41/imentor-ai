import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleX, ChevronLeft, ChevronRight, Clock3, History, PlayCircle, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:2000/api';

function PrepModePage() {
    const [activeTab, setActiveTab] = useState('setup');
    const [stage, setStage] = useState('setup');
    const [isBusy, setIsBusy] = useState(false);

    const [topic, setTopic] = useState('');
    const [prepType, setPrepType] = useState('interview');
    const [difficulty, setDifficulty] = useState('medium');
    const [count, setCount] = useState(5);

    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState([]);
    const [evaluations, setEvaluations] = useState([]);
    const [questionTimers, setQuestionTimers] = useState([]);

    const [history, setHistory] = useState([]);
    const [historyAverage, setHistoryAverage] = useState(0);

    const token = localStorage.getItem('authToken');
        const [selectedSession, setSelectedSession] = useState(null);

    const authHeaders = useMemo(() => ({
        Authorization: token ? `Bearer ${token}` : undefined,
    }), [token]);

    const currentQuestion = questions[currentQuestionIndex] || null;

    useEffect(() => {
        if (stage !== 'questions' || questions.length === 0) {
            return;
        }

        const timerId = setInterval(() => {
            setQuestionTimers((prev) => {
                const next = [...prev];
                next[currentQuestionIndex] = (next[currentQuestionIndex] || 0) + 1;
                return next;
            });
        }, 1000);

        return () => clearInterval(timerId);
    }, [stage, currentQuestionIndex, questions.length]);

    const fetchHistory = useCallback(async () => {
        if (!token) {
            return;
        }

        try {
            const response = await axios.get(`${API_BASE_URL}/prep/history`, {
                headers: authHeaders,
            });
            setHistory(Array.isArray(response.data?.sessions) ? response.data.sessions : []);
            setHistoryAverage(Number(response.data?.averageScoreAcrossSessions || 0));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load history.');
        }
    }, [authHeaders, token]);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab, fetchHistory]);

    const startPractice = async () => {
        const cleanTopic = topic.trim();
        if (!cleanTopic) {
            toast.error('Enter a topic to begin.');
            return;
        }

        setIsBusy(true);
        try {
            const response = await axios.post(
                `${API_BASE_URL}/prep/generate-questions`,
                { topic: cleanTopic, type: prepType, difficulty, count },
                { headers: authHeaders }
            );

            const generated = Array.isArray(response.data?.questions) ? response.data.questions : [];
            if (!generated.length) {
                toast.error('No questions were generated. Try again.');
                return;
            }

            setQuestions(generated);
            setCurrentQuestionIndex(0);
            setUserAnswers(new Array(generated.length).fill(''));
            setEvaluations(new Array(generated.length).fill(null));
            setQuestionTimers(new Array(generated.length).fill(0));
            setStage('questions');
            setActiveTab('setup');
            toast.success('Questions generated. Start answering.');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to generate questions.');
        } finally {
            setIsBusy(false);
        }
    };

    const setAnswer = (index, value) => {
        setUserAnswers((prev) => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
    };

    const evaluateCurrentAnswer = async () => {
        if (!currentQuestion) return;

        const answer = String(userAnswers[currentQuestionIndex] || '').trim();
        if (!answer) {
            toast.error('Write your answer before checking.');
            return;
        }

        setIsBusy(true);
        try {
            const response = await axios.post(
                `${API_BASE_URL}/prep/evaluate-answer`,
                {
                    question: currentQuestion.question,
                    userAnswer: answer,
                    expectedPoints: currentQuestion.expectedPoints || [],
                },
                { headers: authHeaders }
            );

            setEvaluations((prev) => {
                const next = [...prev];
                next[currentQuestionIndex] = response.data;
                return next;
            });

            toast.success('Answer checked.');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to evaluate answer.');
        } finally {
            setIsBusy(false);
        }
    };

    const averageScore = useMemo(() => {
        const validScores = evaluations
            .map((item) => Number(item?.score))
            .filter((score) => Number.isFinite(score));

        if (!validScores.length) {
            return 0;
        }

        const sum = validScores.reduce((acc, score) => acc + score, 0);
        return Number((sum / validScores.length).toFixed(2));
    }, [evaluations]);

    const weakestAreas = useMemo(() => {
        const frequency = new Map();

        evaluations.forEach((evaluation) => {
            (evaluation?.missedPoints || []).forEach((point) => {
                const key = String(point).trim();
                if (!key) return;
                frequency.set(key, (frequency.get(key) || 0) + 1);
            });
        });

        return Array.from(frequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([point, countValue]) => ({ point, count: countValue }));
    }, [evaluations]);

    const finishSession = async () => {
        if (!questions.length) {
            return;
        }

        setIsBusy(true);
        try {
            const scores = evaluations.map((item) => Number(item?.score || 0));
            const totalScore = Number(scores.reduce((sum, score) => sum + score, 0).toFixed(2));

            await axios.post(
                `${API_BASE_URL}/prep/save-session`,
                {
                    topic: topic.trim(),
                    type: prepType,
                    questions: questions.map((q) => q.question),
                    questionDetails: questions,
                    userAnswers,
                    evaluations,
                    scores,
                    totalScore,
                },
                { headers: authHeaders }
            );

            setStage('results');
            toast.success('Session saved to history.');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save prep session.');
        } finally {
            setIsBusy(false);
        }
    };

    const resetPractice = () => {
        setStage('setup');
        setQuestions([]);
        setCurrentQuestionIndex(0);
        setUserAnswers([]);
        setEvaluations([]);
        setQuestionTimers([]);
    };

    const formatElapsed = (seconds) => {
        const safe = Math.max(0, Number(seconds) || 0);
        const min = Math.floor(safe / 60);
        const sec = safe % 60;
        return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const renderSetup = () => (
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl">
            <h2 className="text-2xl font-semibold text-white">Interview & Exam Preparation</h2>
            <p className="mt-2 text-sm text-slate-300">Generate targeted questions, answer one by one, and get instant feedback.</p>

            <div className="mt-6 space-y-4">
                <label className="block">
                    <div className="mb-2 text-sm text-slate-200">Topic</div>
                    <input
                        type="text"
                        value={topic}
                        onChange={(event) => setTopic(event.target.value)}
                        placeholder="Example: Python for Data Science"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                    />
                </label>

                <div>
                    <div className="mb-2 text-sm text-slate-200">Type</div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPrepType('interview')}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${prepType === 'interview' ? 'bg-cyan-500 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            Interview
                        </button>
                        <button
                            type="button"
                            onClick={() => setPrepType('exam')}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${prepType === 'exam' ? 'bg-cyan-500 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            Exam
                        </button>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                        <div className="mb-2 text-sm text-slate-200">Difficulty</div>
                        <select
                            value={difficulty}
                            onChange={(event) => setDifficulty(event.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
                        >
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                        </select>
                    </label>

                    <label>
                        <div className="mb-2 text-sm text-slate-200">Question Count</div>
                        <select
                            value={count}
                            onChange={(event) => setCount(Number(event.target.value))}
                            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={15}>15</option>
                        </select>
                    </label>
                </div>

                <button
                    type="button"
                    onClick={startPractice}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <PlayCircle size={18} />
                    {isBusy ? 'Generating...' : 'Start Preparation'}
                </button>
            </div>
        </div>
    );

    const renderQuestionScreen = () => {
        const evaluation = evaluations[currentQuestionIndex];

        return (
            <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Question {currentQuestionIndex + 1} of {questions.length}</div>
                            <h3 className="mt-1 text-lg font-semibold text-white">{currentQuestion?.question}</h3>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-200">
                            <Clock3 size={14} />
                            {formatElapsed(questionTimers[currentQuestionIndex])}
                        </div>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2">
                        {questions.map((_, index) => {
                            const hasEvaluation = Boolean(evaluations[index]);
                            return (
                                <button
                                    key={`dot-${index}`}
                                    type="button"
                                    onClick={() => setCurrentQuestionIndex(index)}
                                    className={`h-8 w-8 rounded-full text-xs font-semibold transition ${index === currentQuestionIndex ? 'bg-cyan-400 text-slate-950' : hasEvaluation ? 'bg-emerald-500/80 text-white' : 'bg-white/10 text-slate-200 hover:bg-white/20'}`}
                                >
                                    {index + 1}
                                </button>
                            );
                        })}
                    </div>

                    <textarea
                        value={userAnswers[currentQuestionIndex] || ''}
                        onChange={(event) => setAnswer(currentQuestionIndex, event.target.value)}
                        rows={9}
                        placeholder="Write your answer here..."
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                    />

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={evaluateCurrentAnswer}
                            disabled={isBusy}
                            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                        >
                            {isBusy ? 'Checking...' : 'Check Answer'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                            disabled={currentQuestionIndex === 0}
                            className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
                        >
                            <ChevronLeft size={16} /> Previous
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                            disabled={currentQuestionIndex >= questions.length - 1}
                            className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
                        >
                            Next <ChevronRight size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={finishSession}
                            disabled={isBusy || evaluations.filter(Boolean).length === 0}
                            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
                        >
                            Finish Session
                        </button>
                    </div>
                </div>

                {evaluation && (
                    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl">
                        <div className="mb-3 text-lg font-bold text-white">Score: {Number(evaluation.score || 0).toFixed(1)} / 10</div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                                <div className="mb-2 text-sm font-semibold text-emerald-200">Matched Points</div>
                                <ul className="space-y-2 text-sm text-emerald-100">
                                    {(evaluation.matchedPoints || []).map((point) => (
                                        <li key={`match-${point}`} className="flex items-start gap-2">
                                            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                                            <span>{point}</span>
                                        </li>
                                    ))}
                                    {!evaluation.matchedPoints?.length && <li>No matched points yet.</li>}
                                </ul>
                            </div>

                            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                                <div className="mb-2 text-sm font-semibold text-rose-200">Missed Points</div>
                                <ul className="space-y-2 text-sm text-rose-100">
                                    {(evaluation.missedPoints || []).map((point) => (
                                        <li key={`miss-${point}`} className="flex items-start gap-2">
                                            <CircleX size={16} className="mt-0.5 shrink-0" />
                                            <span>{point}</span>
                                        </li>
                                    ))}
                                    {!evaluation.missedPoints?.length && <li>Great coverage. No missed points detected.</li>}
                                </ul>
                            </div>
                        </div>

                        <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                            <summary className="cursor-pointer text-sm font-semibold text-cyan-200">View Improved Model Answer</summary>
                            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-200">{evaluation.improvedModelAnswer || 'No model answer available.'}</p>
                        </details>
                    </div>
                )}
            </div>
        );
    };

    const renderResults = () => (
        <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl">
                <h2 className="text-2xl font-semibold text-white">Final Results</h2>
                <p className="mt-2 text-sm text-slate-300">Topic: {topic} · Type: {prepType}</p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Average Score</div>
                        <div className="mt-2 text-3xl font-bold text-white">{averageScore}/10</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Questions</div>
                        <div className="mt-2 text-3xl font-bold text-white">{questions.length}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Checked</div>
                        <div className="mt-2 text-3xl font-bold text-white">{evaluations.filter(Boolean).length}</div>
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl">
                <h3 className="text-lg font-semibold text-white">Weakest Areas</h3>
                <div className="mt-3 space-y-2">
                    {weakestAreas.length ? weakestAreas.map((item) => (
                        <div key={item.point} className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                            {item.point} <span className="text-rose-200/80">({item.count} misses)</span>
                        </div>
                    )) : (
                        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                            No major weak points detected. Nice work.
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={resetPractice}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
                >
                    <RotateCcw size={16} /> Practice Again
                </button>
            </div>
        </div>
    );

    const renderHistory = () => (
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold text-white">Preparation History</h2>
                    <p className="mt-1 text-sm text-slate-300">Average across sessions: {historyAverage}/10</p>
                </div>
                <button
                    type="button"
                    onClick={fetchHistory}
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                    Refresh
                </button>
            </div>

                {selectedSession ? (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedSession(null);
                            }}
                            className="mb-4 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                        >
                            <ChevronLeft size={16} /> Back to List
                        </button>

                        <div className="space-y-4">
                            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-2xl font-semibold text-white">{selectedSession.topic}</h2>
                                        <p className="mt-1 text-sm uppercase tracking-[0.16em] text-cyan-200">{selectedSession.type}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-white">{Number(selectedSession.averageScore || 0).toFixed(2)} / 10</p>
                                        <p className="text-xs text-slate-400">{new Date(selectedSession.date).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>

                            {(selectedSession.questionDetails?.length ? selectedSession.questionDetails : selectedSession.questions || []).map((questionItem, qIndex) => {
                                const questionText = typeof questionItem === 'string' ? questionItem : questionItem?.question;
                                const expectedPoints = Array.isArray(questionItem?.expectedPoints) ? questionItem.expectedPoints : [];
                                const evaluation = selectedSession.evaluations?.[qIndex];
                                const correctAnswerText = evaluation?.improvedModelAnswer
                                    || (expectedPoints.length ? `A strong answer should include:\n${expectedPoints.map((point, idx) => `${idx + 1}. ${point}`).join('\n')}` : 'No saved correct answer for this older session. Please run a new prep session to store model answers.');

                                return (
                                <div key={`question-${qIndex}`} className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl">
                                    <div className="mb-3 flex items-start justify-between gap-3">
                                        <h3 className="flex-1 text-base font-semibold text-white">Question {qIndex + 1}</h3>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-cyan-200">{Number(selectedSession.scores?.[qIndex] || 0).toFixed(1)} / 10</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-200">{questionText || 'Question text unavailable'}</p>

                                    {selectedSession.userAnswers?.[qIndex] && (
                                        <div className="mt-3 rounded-xl border border-blue-300/20 bg-blue-500/10 p-3">
                                            <p className="text-xs uppercase tracking-[0.1em] font-semibold text-blue-200 mb-2">Your Answer</p>
                                            <p className="text-sm text-blue-100">{selectedSession.userAnswers[qIndex]}</p>
                                        </div>
                                    )}

                                    <div className="mt-3 rounded-xl border border-violet-300/20 bg-violet-500/10 p-3">
                                        <p className="text-xs uppercase tracking-[0.1em] font-semibold text-violet-200 mb-2">Correct Answer</p>
                                        <p className="whitespace-pre-wrap text-sm text-violet-100">{correctAnswerText}</p>
                                    </div>

                                    {evaluation && (
                                        <div className="mt-3 space-y-2">
                                            {evaluation.whatWasCorrect?.length > 0 && (
                                                <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-3">
                                                    <p className="text-xs uppercase tracking-[0.1em] font-semibold text-emerald-200 mb-2">What Was Correct</p>
                                                    <ul className="text-sm text-emerald-100 space-y-1">
                                                        {evaluation.whatWasCorrect.map((item, i) => (
                                                            <li key={i} className="flex items-start gap-2">
                                                                <span className="text-emerald-300 mt-0.5">✓</span>
                                                                <span>{item}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {evaluation.whatWasMissing?.length > 0 && (
                                                <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-3">
                                                    <p className="text-xs uppercase tracking-[0.1em] font-semibold text-amber-200 mb-2">What Was Missing</p>
                                                    <ul className="text-sm text-amber-100 space-y-1">
                                                        {evaluation.whatWasMissing.map((item, i) => (
                                                            <li key={i} className="flex items-start gap-2">
                                                                <span className="text-amber-300 mt-0.5">!</span>
                                                                <span>{item}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <div className="space-y-3">
                        {history.length ? history.map((session) => (
                            <button
                                key={session._id}
                                type="button"
                                onClick={() => setSelectedSession(session)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-white">{session.topic}</div>
                                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-cyan-200">{session.type}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-white">{Number(session.averageScore || 0).toFixed(2)} / 10</div>
                                        <div className="text-xs text-slate-400">{new Date(session.date).toLocaleString()}</div>
                                    </div>
                                </div>
                            </button>
                        )) : (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                                No prep sessions yet.
                            </div>
                        )}
                    </div>
                )}
        </div>
    );

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.15),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_45%,_#111827_100%)] text-white">
            <header className="shrink-0 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                    <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Smart Practice</p>
                        <h1 className="text-xl font-semibold sm:text-2xl">Interview & Exam Preparation Mode</h1>
                    </div>
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/30 hover:bg-white/10"
                    >
                        <ChevronLeft size={16} /> Back
                    </Link>
                </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                    <div className="mb-5 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab('setup')}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'setup' ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            Practice
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('history')}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'history' ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            <History size={16} /> History
                        </button>
                    </div>

                    {activeTab === 'history' ? renderHistory() : (
                        <>
                            {stage === 'setup' && renderSetup()}
                            {stage === 'questions' && renderQuestionScreen()}
                            {stage === 'results' && renderResults()}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}

export default PrepModePage;

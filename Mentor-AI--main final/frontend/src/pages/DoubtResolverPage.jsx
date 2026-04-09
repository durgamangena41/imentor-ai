import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Lightbulb, GitCompare, Save, Search, ChevronLeft } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:2000/api';

const SUBJECT_OPTIONS = ['Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'Other'];
const LEVEL_OPTIONS = ['beginner', 'intermediate', 'advanced'];

function DoubtResolverPage() {
    const [activeTab, setActiveTab] = useState('resolver');

    const [subject, setSubject] = useState('Computer Science');
    const [level, setLevel] = useState('beginner');
    const [question, setQuestion] = useState('');

    const [isResolving, setIsResolving] = useState(false);
    const [resolved, setResolved] = useState(null);
    const [visibleStepIndexes, setVisibleStepIndexes] = useState([]);
    const revealTimeoutsRef = useRef([]);

    const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const [savedDoubts, setSavedDoubts] = useState([]);
    const [savedSearch, setSavedSearch] = useState('');
    const [isLoadingSaved, setIsLoadingSaved] = useState(false);
        const [selectedSavedDoubt, setSelectedSavedDoubt] = useState(null);
        const [selectedSavedOptionIndex, setSelectedSavedOptionIndex] = useState(null);
        const [savedDoubtVisibleSteps, setSavedDoubtVisibleSteps] = useState([]);
        const savedDoubtTimeoutsRef = useRef([]);

    const authHeaders = useMemo(() => {
        const token = localStorage.getItem('authToken');
        return {
            Authorization: token ? `Bearer ${token}` : undefined,
        };
    }, []);

    const clearStepRevealTimers = () => {
        revealTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
        revealTimeoutsRef.current = [];
    };

            const clearSavedDoubtStepTimers = () => {
                savedDoubtTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
                savedDoubtTimeoutsRef.current = [];
            };

    useEffect(() => {
        return () => {
            clearStepRevealTimers();
        };
    }, []);

            useEffect(() => {
                return () => {
                    clearSavedDoubtStepTimers();
                };
            }, []);

    const revealSteps = (steps) => {
        clearStepRevealTimers();
        setVisibleStepIndexes([]);

        (steps || []).forEach((_, index) => {
            const timeoutId = setTimeout(() => {
                setVisibleStepIndexes((prev) => [...prev, index]);
            }, index * 300);
            revealTimeoutsRef.current.push(timeoutId);
        });
    };

            const revealSavedSteps = (steps) => {
                clearSavedDoubtStepTimers();
                setSavedDoubtVisibleSteps([]);
                (steps || []).forEach((_, index) => {
                    const timeoutId = setTimeout(() => {
                        setSavedDoubtVisibleSteps((prev) => [...prev, index]);
                    }, index * 300);
                    savedDoubtTimeoutsRef.current.push(timeoutId);
                });
            };

    const handleResolve = async () => {
        const cleanQuestion = question.trim();
        if (!cleanQuestion) {
            toast.error('Please type your doubt first.');
            return;
        }

        setIsResolving(true);
        setSelectedOptionIndex(null);

        try {
            const response = await axios.post(
                `${API_BASE_URL}/doubt/resolve`,
                { question: cleanQuestion, subject, level },
                { headers: authHeaders }
            );

            const payload = response.data;
            setResolved(payload);
            revealSteps(payload?.steps || []);
            toast.success('Doubt resolved successfully.');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to resolve doubt.');
        } finally {
            setIsResolving(false);
        }
    };

    const fetchSavedDoubts = useCallback(async () => {
        setIsLoadingSaved(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/doubt/saved`, {
                headers: authHeaders,
            });

            const list = Array.isArray(response.data?.savedDoubts) ? response.data.savedDoubts : [];
            setSavedDoubts(list);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load saved doubts.');
        } finally {
            setIsLoadingSaved(false);
        }
    }, [authHeaders]);

    useEffect(() => {
        if (activeTab === 'saved') {
            fetchSavedDoubts();
        }
    }, [activeTab, fetchSavedDoubts]);

    const handleSave = async () => {
        if (!resolved) {
            toast.error('Resolve a doubt first, then save it.');
            return;
        }

        setIsSaving(true);
        try {
            await axios.post(
                `${API_BASE_URL}/doubt/save`,
                {
                    question: question.trim(),
                    subject,
                    answer: resolved,
                },
                { headers: authHeaders }
            );

            toast.success('Doubt saved to your collection.');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save doubt.');
        } finally {
            setIsSaving(false);
        }
    };

    const filteredSavedDoubts = useMemo(() => {
        const query = savedSearch.trim().toLowerCase();
        if (!query) {
            return savedDoubts;
        }

        return savedDoubts.filter((item) => {
            const inQuestion = String(item?.question || '').toLowerCase().includes(query);
            const inSubject = String(item?.subject || '').toLowerCase().includes(query);
            const inRootCause = String(item?.answer?.rootCause || '').toLowerCase().includes(query);
            return inQuestion || inSubject || inRootCause;
        });
    }, [savedDoubts, savedSearch]);

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_45%,_#111827_100%)] text-white">
            <header className="shrink-0 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                    <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Learning Support</p>
                        <h1 className="text-xl font-semibold sm:text-2xl">Smart Doubt Resolver</h1>
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
                <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                    <div className="mb-5 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab('resolver')}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'resolver' ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            Resolve Doubt
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('saved')}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'saved' ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            Saved Doubts
                        </button>
                    </div>

                    {activeTab === 'saved' ? (
                        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <h2 className="text-xl font-semibold">Saved Doubts</h2>
                                <button
                                    type="button"
                                    onClick={fetchSavedDoubts}
                                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                                >
                                    Refresh
                                </button>
                            </div>

                            <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2">
                                <Search size={16} className="text-slate-400" />
                                <input
                                    type="text"
                                    value={savedSearch}
                                    onChange={(event) => setSavedSearch(event.target.value)}
                                    placeholder="Search by question, subject, or root cause"
                                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                                />
                            </div>

                            {isLoadingSaved ? (
                                <p className="text-sm text-slate-300">Loading saved doubts...</p>
                            ) : filteredSavedDoubts.length === 0 ? (
                                <p className="text-sm text-slate-300">No saved doubts found.</p>
                            ) : (
                                    selectedSavedDoubt ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedSavedDoubt(null);
                                                    setSelectedSavedOptionIndex(null);
                                                }}
                                                className="mb-4 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                                            >
                                                <ChevronLeft size={16} /> Back to List
                                            </button>

                                            <div className="space-y-4">
                                                <article className="rounded-3xl border border-amber-300/25 bg-amber-500/10 p-5 shadow-xl">
                                                    <div className="mb-2 inline-flex items-center gap-2 text-amber-200">
                                                        <Lightbulb size={18} />
                                                        <h3 className="text-lg font-semibold">Root Cause</h3>
                                                    </div>
                                                    <p className="text-sm text-amber-100">{selectedSavedDoubt.answer?.rootCause}</p>
                                                </article>

                                                <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl">
                                                    <h3 className="text-lg font-semibold">Step-by-Step Hints</h3>
                                                    <div className="mt-3 space-y-3">
                                                        {(selectedSavedDoubt.answer?.steps || []).map((step, index) => {
                                                            const visible = savedDoubtVisibleSteps.includes(index);
                                                            return (
                                                                <div
                                                                    key={`step-${index}`}
                                                                    className={`rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                                                                >
                                                                    <span className="mr-2 font-semibold text-cyan-200">Step {index + 1}:</span>
                                                                    <span className="text-slate-200">{step}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </article>

                                                <article className="rounded-3xl border border-emerald-300/25 bg-emerald-500/10 p-5 shadow-xl">
                                                    <div className="mb-2 inline-flex items-center gap-2 text-emerald-200">
                                                        <GitCompare size={18} />
                                                        <h3 className="text-lg font-semibold">Real-World Analogy</h3>
                                                    </div>
                                                    <p className="text-sm text-emerald-100">{selectedSavedDoubt.answer?.analogy}</p>
                                                </article>

                                                <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl">
                                                    <h3 className="text-lg font-semibold">Check Your Understanding</h3>
                                                    <p className="mt-2 text-sm text-slate-200">{selectedSavedDoubt.answer?.checkQuestion?.question}</p>

                                                    <div className="mt-3 space-y-2">
                                                        {(selectedSavedDoubt.answer?.checkQuestion?.options || []).map((option, index) => {
                                                            const hasSelection = selectedSavedOptionIndex !== null;
                                                            const isCorrect = index === selectedSavedDoubt.answer?.checkQuestion?.correctIndex;
                                                            const isSelected = index === selectedSavedOptionIndex;

                                                            let optionClass = 'border-white/15 bg-white/5 text-slate-200';
                                                            if (hasSelection && isCorrect) optionClass = 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100';
                                                            if (hasSelection && isSelected && !isCorrect) optionClass = 'border-rose-400/40 bg-rose-500/20 text-rose-100';

                                                            return (
                                                                <button
                                                                    key={`option-${index}`}
                                                                    type="button"
                                                                    onClick={() => setSelectedSavedOptionIndex(index)}
                                                                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${optionClass}`}
                                                                >
                                                                    {option}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>

                                                    {selectedSavedOptionIndex !== null && (
                                                        <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                                                            {selectedSavedDoubt.answer?.checkQuestion?.explanation}
                                                        </div>
                                                    )}
                                                </article>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-3">
                                            {filteredSavedDoubts.map((item) => (
                                                <button
                                                    key={item._id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedSavedDoubt(item);
                                                        setSelectedSavedOptionIndex(null);
                                                        revealSavedSteps(item.answer?.steps || []);
                                                    }}
                                                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">{item.subject}</p>
                                                        <p className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
                                                    </div>
                                                    <h3 className="mt-2 text-base font-semibold">{item.question}</h3>
                                                    <p className="mt-2 text-sm text-slate-300 line-clamp-3">{item.answer?.rootCause}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )
                            )}
                        </section>
                    ) : (
                        <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
                            <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl lg:sticky lg:top-6 lg:self-start">
                                <h2 className="text-lg font-semibold">Ask Your Doubt</h2>

                                <label className="mt-4 block space-y-2">
                                    <span className="text-sm text-slate-200">Subject</span>
                                    <select
                                        value={subject}
                                        onChange={(event) => setSubject(event.target.value)}
                                        className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
                                    >
                                        {SUBJECT_OPTIONS.map((value) => (
                                            <option key={value} value={value}>{value}</option>
                                        ))}
                                    </select>
                                </label>

                                <div className="mt-4 space-y-2">
                                    <span className="text-sm text-slate-200">Level</span>
                                    <div className="flex flex-wrap gap-2">
                                        {LEVEL_OPTIONS.map((option) => (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => setLevel(option)}
                                                className={`rounded-xl px-3 py-2 text-sm font-semibold capitalize transition ${level === option ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <label className="mt-4 block space-y-2">
                                    <span className="text-sm text-slate-200">Doubt</span>
                                    <textarea
                                        value={question}
                                        onChange={(event) => setQuestion(event.target.value)}
                                        rows={8}
                                        placeholder="Type your doubt or question here..."
                                        className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                                    />
                                </label>

                                <button
                                    type="button"
                                    onClick={handleResolve}
                                    disabled={isResolving}
                                    className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
                                >
                                    {isResolving ? 'Resolving...' : 'Resolve Doubt'}
                                </button>
                            </section>

                            <section className="space-y-4">
                                {!resolved ? (
                                    <div className="rounded-3xl border border-dashed border-white/20 bg-slate-900/50 p-8 text-center text-slate-300">
                                        Resolve a doubt to view root cause, step-by-step hints, analogy, and a quick check question.
                                    </div>
                                ) : (
                                    <>
                                        <article className="rounded-3xl border border-amber-300/25 bg-amber-500/10 p-5 shadow-xl">
                                            <div className="mb-2 inline-flex items-center gap-2 text-amber-200">
                                                <Lightbulb size={18} />
                                                <h3 className="text-lg font-semibold">Root Cause</h3>
                                            </div>
                                            <p className="text-sm text-amber-100">{resolved.rootCause}</p>
                                        </article>

                                        <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl">
                                            <h3 className="text-lg font-semibold">Step-by-Step Hints</h3>
                                            <div className="mt-3 space-y-3">
                                                {resolved.steps.map((step, index) => {
                                                    const visible = visibleStepIndexes.includes(index);
                                                    return (
                                                        <div
                                                            key={`step-${index}`}
                                                            className={`rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                                                        >
                                                            <span className="mr-2 font-semibold text-cyan-200">Step {index + 1}:</span>
                                                            <span className="text-slate-200">{step}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </article>

                                        <article className="rounded-3xl border border-emerald-300/25 bg-emerald-500/10 p-5 shadow-xl">
                                            <div className="mb-2 inline-flex items-center gap-2 text-emerald-200">
                                                <GitCompare size={18} />
                                                <h3 className="text-lg font-semibold">Real-World Analogy</h3>
                                            </div>
                                            <p className="text-sm text-emerald-100">{resolved.analogy}</p>
                                        </article>

                                        <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-xl">
                                            <h3 className="text-lg font-semibold">Check Your Understanding</h3>
                                            <p className="mt-2 text-sm text-slate-200">{resolved.checkQuestion.question}</p>

                                            <div className="mt-3 space-y-2">
                                                {(resolved.checkQuestion.options || []).map((option, index) => {
                                                    const hasSelection = selectedOptionIndex !== null;
                                                    const isCorrect = index === resolved.checkQuestion.correctIndex;
                                                    const isSelected = index === selectedOptionIndex;

                                                    let optionClass = 'border-white/15 bg-white/5 text-slate-200';
                                                    if (hasSelection && isCorrect) optionClass = 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100';
                                                    if (hasSelection && isSelected && !isCorrect) optionClass = 'border-rose-400/40 bg-rose-500/20 text-rose-100';

                                                    return (
                                                        <button
                                                            key={`option-${index}`}
                                                            type="button"
                                                            onClick={() => setSelectedOptionIndex(index)}
                                                            className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${optionClass}`}
                                                        >
                                                            {option}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {selectedOptionIndex !== null && (
                                                <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                                                    {resolved.checkQuestion.explanation}
                                                </div>
                                            )}
                                        </article>

                                        <button
                                            type="button"
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
                                        >
                                            <Save size={16} />
                                            {isSaving ? 'Saving...' : 'Save Doubt'}
                                        </button>
                                    </>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default DoubtResolverPage;

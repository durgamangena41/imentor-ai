// frontend/src/components/research/DeepResearchPanel.jsx
// Main orchestrator UI for the Deep Research feature.
// Handles state for: Planning, Searching, Synthesizing, and Results.
// Mimics Gemini Deep Research with premium animations and structured feedback.

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Binary, Globe, GraduationCap, ShieldCheck, FileText,
    Brain, Network, Layers, ChevronRight, Activity, Clock,
    BarChart3, AlertTriangle, AlertCircle, CheckCircle2,
    BookOpen, Sparkles, Download, Share2, ZoomIn, Info, X
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import SourceCard from './SourceCard';
import './DeepResearch.css';

const STAGES = [
    { id: 'planning', label: 'Planning', icon: Brain, description: 'Generating research strategy...' },
    { id: 'searching', label: 'Searching', icon: Globe, description: 'Querying parallel sources...' },
    { id: 'filtering', label: 'Filtering', icon: Layers, description: 'Evaluating source credibility...' },
    { id: 'synthesizing', label: 'Synthesizing', icon: Sparkles, description: 'Processing findings...' },
    { id: 'finalizing', label: 'Finalizing', icon: CheckCircle2, description: 'Structuring final report...' },
];

export default function DeepResearchPanel({ researchData, isActive, onComplete, query }) {
    const [currentStageIndex, setCurrentStageIndex] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [activeTab, setActiveTab] = useState('report'); // report | sources | graph | factcheck
    const reportRef = useRef(null);

    // Initial loading animation simulator (or based on real events if we add socket support later)
    useEffect(() => {
        if (isActive && !researchData && !isComplete) {
            const timer = setInterval(() => {
                setCurrentStageIndex(prev => {
                    if (prev < STAGES.length - 1) return prev + 1;
                    return prev;
                });
            }, 3500);
            return () => clearInterval(timer);
        }
    }, [isActive, researchData, isComplete]);

    useEffect(() => {
        if (researchData) {
            setIsComplete(true);
            setCurrentStageIndex(STAGES.length - 1);
        }
    }, [researchData]);

    if (!isActive) return null;

    // --- RENDER RESEARCHING STATE ---
    if (!isComplete) {
        return (
            <div className="deep-research-panel flex flex-col items-center justify-center p-8 py-16 space-y-12">
                <div className="relative">
                    {/* Pulsing Brain Base */}
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center research-glow">
                        <Brain size={48} className="text-primary animate-pulse" />
                    </div>
                    {/* Orbiting Icons */}
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                        className="absolute -top-4 -left-4 w-32 h-32 pointer-events-none"
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-surface-light dark:bg-slate-800 p-1.5 rounded-full shadow-md border border-border-light dark:border-border-dark">
                            <Globe size={14} className="text-blue-400" />
                        </div>
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-surface-light dark:bg-slate-800 p-1.5 rounded-full shadow-md border border-border-light dark:border-border-dark">
                            <GraduationCap size={14} className="text-emerald-400" />
                        </div>
                    </motion.div>
                </div>

                <div className="text-center space-y-3 max-w-sm">
                    <h2 className="text-xl font-bold text-text-light dark:text-text-dark">Deep Researching...</h2>
                    <p className="text-sm text-text-muted-light dark:text-text-muted-dark italic">"{query}"</p>
                </div>

                {/* Progress Indicators */}
                <div className="w-full max-w-md space-y-6">
                    <div className="relative pt-1">
                        <div className="flex mb-2 items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary py-1 px-2 rounded-full bg-primary/10">
                                    {STAGES[currentStageIndex].label}
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-semibold text-text-muted-light dark:text-text-muted-dark italic">
                                    {STAGES[currentStageIndex].description}
                                </span>
                            </div>
                        </div>
                        <div className="overflow-hidden h-1.5 mb-4 text-xs flex rounded-full bg-gray-200 dark:bg-slate-800">
                            <motion.div
                                animate={{ width: `${((currentStageIndex + 1) / STAGES.length) * 100}%` }}
                                className="research-progress-bar shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                        {STAGES.map((stage, i) => {
                            const Icon = stage.icon;
                            const isActive = i === currentStageIndex;
                            const isPast = i < currentStageIndex;
                            return (
                                <div key={stage.id} className="flex flex-col items-center gap-1.5">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive ? 'bg-primary text-white scale-110' :
                                        isPast ? 'bg-emerald-500/20 text-emerald-500' :
                                            'bg-gray-100 dark:bg-slate-800 text-text-muted-light dark:text-text-muted-dark opacity-40'
                                        }`}>
                                        <Icon size={14} className={isActive ? 'animate-pulse' : ''} />
                                    </div>
                                    <span className={`text-[8px] font-bold uppercase tracking-tight ${isActive ? 'text-primary' : 'text-text-muted-light dark:text-text-muted-dark'
                                        }`}>{stage.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // --- RENDER RESULTS STATE ---
    const { report, sources, sourceBreakdown, metadata, factCheck } = researchData;

    return (
        <div className="deep-research-panel flex flex-col h-full bg-white dark:bg-slate-900 border border-border-light dark:border-border-dark/60 rounded-2xl shadow-xl overflow-hidden scale-in">
            {/* Header / Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between bg-gray-50 dark:bg-slate-800/80 p-4 border-b border-border-light dark:border-border-dark gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                        <BookOpen size={20} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-text-light dark:text-text-dark leading-tight line-clamp-1">{query}</h2>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-text-muted-light dark:text-text-muted-dark flex items-center gap-1">
                                <Globe size={10} /> {sourceBreakdown?.totalCount || 0} Sources
                            </span>
                            <span className="text-[10px] text-text-muted-light dark:text-text-muted-dark flex items-center gap-1">
                                <Clock size={10} /> {((metadata?.totalDurationMs || 0) / 1000).toFixed(1)}s
                            </span>
                            {factCheck && (
                                <span className={`text-[10px] font-bold flex items-center gap-1 ${factCheck.overallReliability > 0.8 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    <ShieldCheck size={10} /> {Math.round(factCheck.overallReliability * 100)}% Credibility
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center bg-gray-200/50 dark:bg-slate-900/50 p-1 rounded-lg border border-border-light dark:border-border-dark">
                    {[
                        { id: 'report', label: 'Report', icon: FileText },
                        { id: 'sources', label: 'Sources', icon: Layers },
                        { id: 'graph', label: 'Citations', icon: Network },
                        { id: 'factcheck', label: 'Fact-Check', icon: ShieldCheck },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${activeTab === tab.id
                                ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                                : 'text-text-muted-light dark:text-text-muted-dark hover:text-text-light dark:hover:text-text-dark'
                                }`}
                        >
                            <tab.icon size={12} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto research-scroll p-4 md:p-6 bg-white dark:bg-slate-900">
                <AnimatePresence mode="wait">
                    {activeTab === 'report' && (
                        <motion.div
                            key="report-tab"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="research-report prose prose-slate dark:prose-invert max-w-none prose-sm sm:prose-base"
                            dangerouslySetInnerHTML={{
                                __html: DOMPurify.sanitize(marked.parse(report.markdown || ''))
                            }}
                        />
                    )}

                    {activeTab === 'sources' && (
                        <motion.div
                            key="sources-tab"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                            {sources.map((source, i) => (
                                <SourceCard key={i} source={source} index={i} />
                            ))}
                        </motion.div>
                    )}

                    {activeTab === 'graph' && (
                        <motion.div
                            key="graph-tab"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center h-full min-h-[400px] text-center space-y-6"
                        >
                            <div className="relative w-full max-w-md aspect-square bg-gray-50 dark:bg-slate-800/40 rounded-full flex items-center justify-center overflow-hidden border border-dashed border-border-light dark:border-indigo-500/20">
                                {/* Simple Visualization Mockup of Citation Graph */}
                                {report.citationGraph?.nodes.slice(0, 12).map((node, i) => {
                                    const angle = (i / Math.min(report.citationGraph.nodes.length, 12)) * 2 * Math.PI;
                                    const x = Math.cos(angle) * 120;
                                    const y = Math.sin(angle) * 120;
                                    return (
                                        <motion.div
                                            key={i}
                                            className="absolute w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-[8px] font-bold text-primary shadow-lg citation-node"
                                            animate={{ x, y }}
                                            title={node.label}
                                        >
                                            {i + 1}
                                        </motion.div>
                                    );
                                })}
                                <div className="z-10 bg-primary p-3 rounded-full text-white shadow-xl research-glow">
                                    <Activity size={24} />
                                </div>
                                <svg className="absolute w-full h-full opacity-20 pointer-events-none">
                                    {report.citationGraph?.edges.slice(0, 15).map((edge, i) => {
                                        // Mock lines connecting nodes
                                        return <line key={i} x1="50%" y1="50%" x2="70%" y2="70%" stroke="currentColor" className="text-primary" />;
                                    })}
                                </svg>
                            </div>
                            <div className="max-w-sm">
                                <h3 className="text-sm font-bold text-text-light dark:text-text-dark">Citation Network Analysis</h3>
                                <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-2">
                                    Visual mapping of evidence relationships and academic influence clusters identified during synthesis.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'factcheck' && (
                        <motion.div
                            key="factcheck-tab"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-6"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl text-center">
                                    <ShieldCheck className="mx-auto text-emerald-500 mb-2" size={24} />
                                    <p className="text-lg font-bold text-emerald-500">{factCheck?.verifiedCount || 0}</p>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70">Verified Claims</p>
                                </div>
                                <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl text-center">
                                    <AlertTriangle className="mx-auto text-amber-500 mb-2" size={24} />
                                    <p className="text-lg font-bold text-amber-500">{factCheck?.flaggedCount || 0}</p>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70">Unverified/Flagged</p>
                                </div>
                                <div className="bg-indigo-500/5 border border-indigo-500/20 p-4 rounded-xl text-center">
                                    <BarChart3 className="mx-auto text-indigo-500 mb-2" size={24} />
                                    <p className="text-lg font-bold text-indigo-500">{Math.round((factCheck?.overallReliability || 1) * 100)}%</p>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500/70">Reliability Score</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-text-light dark:text-text-dark flex items-center gap-2">
                                    <Activity size={16} /> Automated Fact-Check Summary
                                </h3>
                                <p className="text-sm p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border border-border-light dark:border-border-dark leading-relaxed">
                                    {factCheck?.summary || 'No detailed fact-check summary available for this query.'}
                                </p>
                            </div>

                            {factCheck?.flaggedClaims?.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold text-red-500 flex items-center gap-2">
                                        <AlertCircle size={16} /> Items Requiring Manual Review
                                    </h3>
                                    {factCheck.flaggedClaims.map((claim, i) => (
                                        <div key={i} className="fact-check-flagged p-4 rounded-xl space-y-2">
                                            <p className="text-xs font-bold text-text-light dark:text-text-dark italic">"{claim.claimText}"</p>
                                            <p className="text-[11px] text-text-muted-light dark:text-text-muted-dark">
                                                <span className="font-bold text-red-500 uppercase mr-2">{claim.status}</span>
                                                {claim.reasoning}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Footer Actions */}
            <div className="bg-gray-50 dark:bg-slate-800/80 p-3 border-t border-border-light dark:border-border-dark flex items-center justify-between px-6">
                <div className="flex items-center gap-4 text-[10px] font-semibold text-text-muted-light dark:text-text-muted-dark">
                    <span className="flex items-center gap-1"><BookOpen size={12} /> University Level</span>
                    <span className="flex items-center gap-1"><ShieldCheck size={12} /> Academic Grade</span>
                </div>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light dark:border-border-dark text-[10px] font-bold text-text-light dark:text-text-dark hover:bg-white dark:hover:bg-slate-700 transition-all">
                        <Download size={12} /> PDF
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[10px] font-bold hover:bg-primary-dark shadow-md shadow-primary/20 transition-all">
                        <Share2 size={12} /> Share
                    </button>
                </div>
            </div>
        </div>
    );
}

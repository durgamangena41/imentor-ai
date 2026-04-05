// frontend/src/components/research/SourceCard.jsx
// Expandable source card with credibility indicator, preview, and type badge.
// Professional design with glassmorphism, subtle animations, and dark mode support.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ExternalLink, ChevronDown, ChevronUp, Shield, ShieldCheck, ShieldAlert,
    BookOpen, Globe, Database, GraduationCap, FileText, Star, Copy, CheckCircle
} from 'lucide-react';
import './DeepResearch.css';

const SOURCE_TYPE_CONFIG = {
    arxiv: { label: 'arXiv', icon: BookOpen, badgeClass: 'source-badge-arxiv', color: '#f87171' },
    pubmed: { label: 'PubMed', icon: Shield, badgeClass: 'source-badge-pubmed', color: '#34d399' },
    semantic_scholar: { label: 'Scholar', icon: GraduationCap, badgeClass: 'source-badge-scholar', color: '#60a5fa' },
    web: { label: 'Web', icon: Globe, badgeClass: 'source-badge-web', color: '#9ca3af' },
    local: { label: 'Your Docs', icon: Database, badgeClass: 'source-badge-local', color: '#c084fc' },
    academic: { label: 'Academic', icon: BookOpen, badgeClass: 'source-badge-scholar', color: '#60a5fa' },
};

function getCredibilityLevel(score) {
    if (score >= 0.8) return { level: 'high', label: 'High Credibility', barClass: 'credibility-high', Icon: ShieldCheck, color: 'text-emerald-400' };
    if (score >= 0.5) return { level: 'medium', label: 'Moderate', barClass: 'credibility-medium', Icon: Shield, color: 'text-amber-400' };
    return { level: 'low', label: 'Low', barClass: 'credibility-low', Icon: ShieldAlert, color: 'text-red-400' };
}

export default function SourceCard({ source, index = 0, compact = false }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const {
        title = 'Untitled Source',
        url,
        content,
        sourceType = 'web',
        credibilityScore = 0.5,
        authors = [],
        publishedDate,
    } = source;

    const typeConfig = SOURCE_TYPE_CONFIG[sourceType] || SOURCE_TYPE_CONFIG.web;
    const TypeIcon = typeConfig.icon;
    const credibility = getCredibilityLevel(credibilityScore);
    const CredIcon = credibility.Icon;
    const snippet = (content || '').substring(0, 200);
    const fullContent = content || 'No content preview available.';

    const handleCopy = async () => {
        const text = `${title}\n${url || ''}\n\n${content || ''}`;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (compact) {
        return (
            <div
                className="source-card flex items-center gap-3 p-2.5 rounded-lg border border-border-light dark:border-border-dark/60 bg-surface-light dark:bg-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer group"
                style={{ '--card-index': index }}
                onClick={() => url && window.open(url, '_blank')}
            >
                <div className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${typeConfig.color}20` }}>
                    <TypeIcon size={14} style={{ color: typeConfig.color }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-light dark:text-text-dark truncate">{title}</p>
                    <p className="text-[10px] text-text-muted-light dark:text-text-muted-dark truncate">{url || sourceType}</p>
                </div>
                <span className={`source-badge ${typeConfig.badgeClass}`}>{typeConfig.label}</span>
            </div>
        );
    }

    return (
        <motion.div
            className="source-card rounded-xl border border-border-light dark:border-border-dark/50 bg-surface-light dark:bg-slate-800/40 backdrop-blur-sm overflow-hidden shadow-sm hover:shadow-card-hover dark:hover:shadow-[0_8px_25px_-5px_rgba(99,102,241,0.15)]"
            style={{ '--card-index': index }}
            layout
        >
            {/* Credibility bar */}
            <div className="w-full h-[3px]">
                <div className={`credibility-bar ${credibility.barClass}`} style={{ width: `${Math.round(credibilityScore * 100)}%` }} />
            </div>

            {/* Header */}
            <div
                className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Source type icon */}
                <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5" style={{ background: `${typeConfig.color}15`, border: `1px solid ${typeConfig.color}30` }}>
                    <TypeIcon size={16} style={{ color: typeConfig.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`source-badge ${typeConfig.badgeClass}`}>{typeConfig.label}</span>
                        <div className={`flex items-center gap-1 ${credibility.color}`}>
                            <CredIcon size={11} />
                            <span className="text-[10px] font-semibold">{Math.round(credibilityScore * 100)}%</span>
                        </div>
                    </div>
                    <h4 className="text-sm font-semibold text-text-light dark:text-text-dark leading-snug line-clamp-2 mb-1">{title}</h4>
                    {authors.length > 0 && (
                        <p className="text-[11px] text-text-muted-light dark:text-text-muted-dark truncate">
                            {authors.slice(0, 3).join(', ')}{authors.length > 3 ? ` +${authors.length - 3} more` : ''}
                        </p>
                    )}
                    {!isExpanded && snippet && (
                        <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1.5 line-clamp-2 leading-relaxed">{snippet}...</p>
                    )}
                </div>

                {/* Expand toggle */}
                <button className="flex-shrink-0 p-1 rounded-md text-text-muted-light dark:text-text-muted-dark hover:bg-gray-100 dark:hover:bg-slate-600/50 transition-colors">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>

            {/* Expanded content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-1 border-t border-border-light/50 dark:border-border-dark/30">
                            {/* Full content preview */}
                            <div className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3 mb-3 max-h-48 overflow-y-auto research-scroll">
                                <p className="text-xs text-text-light dark:text-text-dark leading-relaxed whitespace-pre-wrap">{fullContent}</p>
                            </div>

                            {/* Meta & Actions */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {publishedDate && (
                                        <span className="text-[10px] text-text-muted-light dark:text-text-muted-dark">
                                            📅 {new Date(publishedDate).toLocaleDateString()}
                                        </span>
                                    )}
                                    <span className="text-[10px] text-text-muted-light dark:text-text-muted-dark">
                                        📏 {(content || '').length.toLocaleString()} chars
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button onClick={handleCopy} className="p-1.5 rounded-md text-text-muted-light dark:text-text-muted-dark hover:bg-gray-100 dark:hover:bg-slate-600/50 transition-colors" title="Copy">
                                        {copied ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                    </button>
                                    {url && (
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-text-muted-light dark:text-text-muted-dark hover:bg-gray-100 dark:hover:bg-slate-600/50 hover:text-primary dark:hover:text-primary-light transition-colors" title="Open source">
                                            <ExternalLink size={14} />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

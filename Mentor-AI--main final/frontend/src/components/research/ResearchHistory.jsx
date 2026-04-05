// frontend/src/components/research/ResearchHistory.jsx
// Sidebar panel or modal component for viewing past deep research results.
// Professional design with glassmorphism and chronological grouping.

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    History, Search, Calendar, ChevronRight, Binary, Globe, GraduationCap,
    Clock, Trash2, ExternalLink, RefreshCw, X, FileText
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import './DeepResearch.css';

const DEPTH_LABELS = {
    quick: { label: 'Quick', color: 'text-blue-400', bg: 'bg-blue-400/10' },
    standard: { label: 'Standard', color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
    deep: { label: 'Deep', color: 'text-purple-400', bg: 'bg-purple-400/10' },
};

export default function ResearchHistory({ onSelect, onClose }) {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            const response = await api.getResearchHistory();
            if (response.success) {
                setHistory(response.data || []);
            }
        } catch (error) {
            console.error('[ResearchHistory] Fetch failed:', error.message);
            toast.error('Failed to load research history');
        } finally {
            setIsLoading(false);
        }
    };

    const filteredHistory = history.filter(item =>
        item.query.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Grouping logic isn't strictly necessary for a small list but adds polish
    const groupedHistory = filteredHistory.reduce((acc, item) => {
        const group = formatDate(item.createdAt);
        if (!acc[group]) acc[group] = [];
        acc[group].push(item);
        return acc;
    }, {});

    return (
        <div className="flex flex-col h-full bg-surface-light dark:bg-slate-900 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between bg-white dark:bg-slate-900/50 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <History size={18} className="text-primary" />
                    <h2 className="font-bold text-text-light dark:text-text-dark">Research History</h2>
                </div>
                {onClose && (
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                        <X size={18} className="text-text-muted-light dark:text-text-muted-dark" />
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="p-3">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted-light dark:text-text-muted-dark" />
                    <input
                        type="text"
                        placeholder="Search research..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-800/80 border border-border-light dark:border-border-dark/50 rounded-lg text-xs focus:ring-1 focus:ring-primary focus:outline-none text-text-light dark:text-text-dark transition-all"
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto research-scroll p-3 space-y-6">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <RefreshCw size={24} className="text-primary/40 animate-spin" />
                        <p className="text-xs text-text-muted-light dark:text-text-muted-dark">Loading your research...</p>
                    </div>
                ) : filteredHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
                            <Search size={20} className="text-text-muted-light dark:text-text-muted-dark" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-text-light dark:text-text-dark">No history found</p>
                            <p className="text-xs text-text-muted-light dark:text-text-muted-dark px-6">Your deep research sessions will appear here.</p>
                        </div>
                    </div>
                ) : (
                    Object.entries(groupedHistory).map(([group, items]) => (
                        <div key={group} className="space-y-2">
                            <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-muted-light dark:text-text-muted-dark px-1">
                                {group}
                            </h3>
                            <div className="space-y-1.5">
                                {items.map((item, idx) => {
                                    const depth = DEPTH_LABELS[item.depthLevel] || DEPTH_LABELS.standard;
                                    return (
                                        <motion.div
                                            key={item._id || idx}
                                            className="research-history-item group relative p-3 rounded-xl border border-border-light dark:border-border-dark/60 bg-white dark:bg-slate-800/40 hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:border-primary/30 transition-all cursor-pointer overflow-hidden"
                                            style={{ '--item-index': idx }}
                                            onClick={() => onSelect && onSelect(item)}
                                            whileHover={{ x: 4 }}
                                        >
                                            <div className="flex items-start justify-between gap-3 relative z-10">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-text-light dark:text-text-dark line-clamp-1 group-hover:text-primary transition-colors">
                                                        {item.query}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${depth.bg} ${depth.color}`}>
                                                            {depth.label}
                                                        </span>
                                                        <div className="flex items-center gap-1 text-[9px] text-text-muted-light dark:text-text-muted-dark">
                                                            <Calendar size={10} />
                                                            <span>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-[9px] text-text-muted-light dark:text-text-muted-dark border-l border-border-light dark:border-border-dark pl-2">
                                                            <Globe size={10} />
                                                            <span>{item.sourceBreakdown?.totalCount || 0} sources</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <ChevronRight size={14} className="text-text-muted-light dark:text-text-muted-dark group-hover:text-primary transition-colors" />
                                            </div>

                                            {/* Suble background decor */}
                                            <div className="absolute top-0 right-0 p-1 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                                <FileText size={48} />
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Bottom Actions */}
            <div className="p-3 border-t border-border-light dark:border-border-dark bg-gray-50 dark:bg-slate-900/80">
                <button
                    onClick={fetchHistory}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-text-muted-light dark:text-text-muted-dark hover:text-primary transition-colors"
                >
                    <RefreshCw size={12} />
                    Refresh History
                </button>
            </div>
        </div>
    );
}

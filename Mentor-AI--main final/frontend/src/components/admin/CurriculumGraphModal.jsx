// frontend/src/components/admin/CurriculumGraphModal.jsx
/**
 * Curriculum Graph Modal - Hierarchical Tree View
 * Displays curriculum structure: Modules → Topics → Subtopics
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Network, Loader2, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, BookOpen, Layers, FileText, Link2 } from 'lucide-react';
import * as adminApi from '../../services/adminApi.js';
import Button from '../core/Button.jsx';
import toast from 'react-hot-toast';

// Color scheme for hierarchy levels
const COLORS = {
    module: { bg: 'bg-purple-500', light: 'bg-purple-500/10', hover: 'hover:bg-purple-500/20', text: 'text-purple-400' },
    topic: { bg: 'bg-cyan-500', light: 'bg-cyan-500/10', hover: 'hover:bg-cyan-500/20', text: 'text-cyan-400' },
    subtopic: { bg: 'bg-emerald-500', light: 'bg-emerald-500/10', hover: 'hover:bg-emerald-500/20', text: 'text-emerald-400' }
};

function CurriculumGraphModal() {
    const [courseName, setCourseName] = useState('Machine Learning');
    const [vizData, setVizData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expandedModules, setExpandedModules] = useState(new Set());
    const [expandedTopics, setExpandedTopics] = useState(new Set());

    const fetchVisualization = useCallback(async () => {
        if (!courseName.trim()) return;

        setIsLoading(true);
        setError(null);

        try {
            const data = await adminApi.getCurriculumVisualization(courseName.trim());
            setVizData(data);
            
            // Auto-expand first module
            if (data?.nodes) {
                const firstModule = data.nodes.find(n => n.type === 'module');
                if (firstModule) {
                    setExpandedModules(new Set([firstModule.id]));
                }
            }
        } catch (err) {
            console.error('Visualization fetch error:', err);
            setError(err.message || 'Failed to load curriculum graph');
        } finally {
            setIsLoading(false);
        }
    }, [courseName]);

    useEffect(() => {
        fetchVisualization();
    }, [fetchVisualization]);

    // Organize and deduplicate data
    const hierarchyData = useMemo(() => {
        if (!vizData?.nodes) return { modules: [], topics: [], subtopics: [] };

        const nodesByType = {
            module: new Map(),
            topic: new Map(),
            subtopic: new Map()
        };

        // Deduplicate nodes by ID
        vizData.nodes.forEach(node => {
            if (nodesByType[node.type] && node.id) {
                nodesByType[node.type].set(node.id, node);
            }
        });

        const modules = Array.from(nodesByType.module.values())
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const topics = Array.from(nodesByType.topic.values());
        const subtopics = Array.from(nodesByType.subtopic.values());

        return { modules, topics, subtopics };
    }, [vizData]);

    const toggleModule = useCallback((moduleId) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
            return next;
        });
    }, []);

    const toggleTopic = useCallback((topicId) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            next.has(topicId) ? next.delete(topicId) : next.add(topicId);
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        if (!hierarchyData) return;
        setExpandedModules(new Set(hierarchyData.modules.map(m => m.id)));
        setExpandedTopics(new Set(hierarchyData.topics.map(t => t.id)));
    }, [hierarchyData]);

    const collapseAll = useCallback(() => {
        setExpandedModules(new Set());
        setExpandedTopics(new Set());
    }, []);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <Loader2 size={40} className="animate-spin text-primary mb-4" />
                <p className="text-text-muted-light dark:text-text-muted-dark">Loading curriculum...</p>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <AlertTriangle size={40} className="text-red-500 mb-4" />
                <p className="text-red-500 mb-4">{error}</p>
                <Button onClick={fetchVisualization} leftIcon={<RefreshCw size={16} />}>
                    Retry
                </Button>
            </div>
        );
    }

    // Empty state
    if (!vizData || !vizData.nodes || vizData.nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <Network size={48} className="text-gray-500 opacity-50 mb-4" />
                <p className="text-gray-400 mb-2 font-medium">
                    No curriculum graph found for "{courseName}"
                </p>
                <p className="text-gray-500 text-sm mb-4">
                    Upload a CSV file to create the curriculum structure
                </p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={courseName}
                        onChange={(e) => setCourseName(e.target.value)}
                        placeholder="Enter course name..."
                        className="input-field text-sm px-3 py-2"
                    />
                    <Button onClick={fetchVisualization} size="sm">Load</Button>
                </div>
            </div>
        );
    }

    const { modules, topics, subtopics } = hierarchyData;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-text-light dark:text-text-dark">
                        {vizData.course || courseName}
                    </h3>
                    <Button onClick={fetchVisualization} size="sm" variant="ghost" leftIcon={<RefreshCw size={14} />}>
                        Refresh
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={expandAll} className="text-xs text-primary hover:underline">Expand All</button>
                    <span className="text-gray-400">|</span>
                    <button onClick={collapseAll} className="text-xs text-primary hover:underline">Collapse All</button>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-6 p-3 bg-gray-800/50 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded ${COLORS.module.bg}`}></div>
                    <span className="text-gray-300">{modules.length} Modules</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${COLORS.topic.bg}`}></div>
                    <span className="text-gray-300">{topics.length} Topics</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${COLORS.subtopic.bg}`}></div>
                    <span className="text-gray-300">{subtopics.length} Subtopics</span>
                </div>
            </div>

            {/* Tree View */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {modules.map((module, moduleIdx) => {
                    const isModuleExpanded = expandedModules.has(module.id);
                    const moduleTopics = topics.filter(t => t.module_id === module.id);
                    const moduleKey = `mod-${module.id}-${moduleIdx}`;

                    return (
                        <div key={moduleKey} className="border border-purple-500/30 rounded-lg overflow-hidden">
                            {/* Module Header */}
                            <button
                                onClick={() => toggleModule(module.id)}
                                className={`w-full flex items-center gap-3 p-4 ${COLORS.module.light} ${COLORS.module.hover} transition-colors`}
                            >
                                {isModuleExpanded ? (
                                    <ChevronDown size={20} className={COLORS.module.text} />
                                ) : (
                                    <ChevronRight size={20} className={COLORS.module.text} />
                                )}
                                <Layers size={20} className={COLORS.module.text} />
                                <span className="font-semibold text-white flex-1 text-left">{module.label}</span>
                                <span className="text-purple-300 text-sm">{moduleTopics.length} topics</span>
                            </button>

                            {/* Module Content - Topics */}
                            {isModuleExpanded && moduleTopics.length > 0 && (
                                <div className="p-3 space-y-2 bg-gray-900/50">
                                    {moduleTopics.map((topic, topicIdx) => {
                                        const isTopicExpanded = expandedTopics.has(topic.id);
                                        const topicSubtopics = subtopics.filter(s => s.topic_id === topic.id);
                                        const topicKey = `${moduleKey}-topic-${topic.id}-${topicIdx}`;

                                        return (
                                            <div key={topicKey} className="border border-cyan-500/30 rounded-lg overflow-hidden">
                                                {/* Topic Header */}
                                                <button
                                                    onClick={() => toggleTopic(topic.id)}
                                                    className={`w-full flex items-center gap-3 p-3 ${COLORS.topic.light} ${COLORS.topic.hover} transition-colors`}
                                                >
                                                    {topicSubtopics.length > 0 ? (
                                                        isTopicExpanded ? (
                                                            <ChevronDown size={16} className={COLORS.topic.text} />
                                                        ) : (
                                                            <ChevronRight size={16} className={COLORS.topic.text} />
                                                        )
                                                    ) : (
                                                        <div className="w-4" />
                                                    )}
                                                    <BookOpen size={16} className={COLORS.topic.text} />
                                                    <span className="text-cyan-100 flex-1 text-left text-sm">{topic.label}</span>
                                                    {topicSubtopics.length > 0 && (
                                                        <span className="text-cyan-300 text-xs">{topicSubtopics.length} subtopics</span>
                                                    )}
                                                </button>

                                                {/* Topic Content - Subtopics */}
                                                {isTopicExpanded && topicSubtopics.length > 0 && (
                                                    <div className="p-2 pl-8 space-y-1 bg-gray-900/30">
                                                        {topicSubtopics.map((subtopic, subtopicIdx) => {
                                                            const subtopicKey = `${topicKey}-sub-${subtopic.id}-${subtopicIdx}`;
                                                            
                                                            return (
                                                                <div
                                                                    key={subtopicKey}
                                                                    className={`flex items-center gap-2 p-2 rounded ${COLORS.subtopic.light} ${COLORS.subtopic.hover} transition-colors`}
                                                                >
                                                                    <FileText size={14} className={COLORS.subtopic.text} />
                                                                    <span className="text-emerald-100 text-xs">{subtopic.label}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Empty Topics Message */}
                            {isModuleExpanded && moduleTopics.length === 0 && (
                                <div className="p-4 text-center text-gray-500 text-sm">
                                    No topics in this module
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Prerequisites Legend */}
            <div className="p-3 bg-gray-800/30 rounded-lg">
                <p className="text-xs text-gray-400">
                    <Link2 size={12} className="inline mr-1" />
                    Prerequisite relationships are tracked in Neo4j and used by the tutor for adaptive learning paths.
                </p>
            </div>
        </div>
    );
}

export default CurriculumGraphModal;

// frontend/src/components/admin/CurriculumVisualizer.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Network, Loader2, AlertTriangle, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import * as adminApi from '../../services/adminApi.js';
import Button from '../core/Button.jsx';
import IconButton from '../core/IconButton.jsx';
import toast from 'react-hot-toast';

// Node colors based on type
const NODE_COLORS = {
    module: { bg: '#8B5CF6', border: '#7C3AED', text: '#FFFFFF' },    // Purple
    topic: { bg: '#06B6D4', border: '#0891B2', text: '#FFFFFF' },     // Cyan
    subtopic: { bg: '#10B981', border: '#059669', text: '#FFFFFF' }   // Green
};

// Edge colors based on type
const EDGE_COLORS = {
    PRECEDES: '#9CA3AF',
    HAS_TOPIC: '#60A5FA',
    PREREQUISITE_OF: '#F59E0B'
};

function CurriculumVisualizer({ courseName }) {
    const [vizData, setVizData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [selectedNode, setSelectedNode] = useState(null);
    const containerRef = useRef(null);
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    const fetchVisualization = useCallback(async () => {
        if (!courseName) return;

        setIsLoading(true);
        setError(null);

        try {
            const data = await adminApi.getCurriculumVisualization(courseName);
            
            // Deduplicate nodes by ID to prevent duplicate key errors
            if (data?.nodes) {
                const uniqueNodesMap = new Map();
                data.nodes.forEach(node => {
                    if (node.id && !uniqueNodesMap.has(node.id)) {
                        uniqueNodesMap.set(node.id, node);
                    }
                });
                data.nodes = Array.from(uniqueNodesMap.values());
            }
            
            setVizData(data);
        } catch (err) {
            setError(err.message || 'Failed to load visualization');
            toast.error(err.message || 'Failed to load visualization');
        } finally {
            setIsLoading(false);
        }
    }, [courseName]);

    useEffect(() => {
        fetchVisualization();
    }, [fetchVisualization]);

    // Calculate node positions in a hierarchical layout
    const calculateLayout = useCallback((nodes, edges) => {
        if (!nodes || nodes.length === 0) return [];

        // Group nodes by type
        const modules = nodes.filter(n => n.type === 'module').sort((a, b) => (a.order || 0) - (b.order || 0));
        const topics = nodes.filter(n => n.type === 'topic');
        const subtopics = nodes.filter(n => n.type === 'subtopic');

        const positions = {};
        const spacingX = 200;
        const spacingY = 120;
        const startX = 100;
        const startY = 80;

        // Position modules in the first row
        modules.forEach((module, i) => {
            positions[module.id] = {
                x: startX + i * spacingX * 2,
                y: startY
            };
        });

        // Position topics under their modules
        modules.forEach((module, moduleIdx) => {
            const moduleTopics = topics.filter(t => t.module_id === module.id);
            moduleTopics.forEach((topic, topicIdx) => {
                const moduleX = positions[module.id]?.x || startX;
                positions[topic.id] = {
                    x: moduleX + (topicIdx - moduleTopics.length / 2) * spacingX * 0.5,
                    y: startY + spacingY
                };
            });
        });

        // Position subtopics under their topics
        topics.forEach(topic => {
            const topicSubtopics = subtopics.filter(s => s.topic_id === topic.id);
            topicSubtopics.forEach((subtopic, subIdx) => {
                const topicX = positions[topic.id]?.x || startX;
                positions[subtopic.id] = {
                    x: topicX + (subIdx - topicSubtopics.length / 2) * spacingX * 0.4,
                    y: (positions[topic.id]?.y || startY + spacingY) + spacingY
                };
            });
        });

        return nodes.map(node => ({
            ...node,
            x: positions[node.id]?.x || 0,
            y: positions[node.id]?.y || 0
        }));
    }, []);

    // Handle mouse events for panning
    const handleMouseDown = (e) => {
        if (e.target.closest('.graph-node')) return;
        isDragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e) => {
        if (!isDragging.current) return;
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        isDragging.current = false;
    };

    const handleWheel = (e) => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(prev => Math.min(Math.max(prev + delta, 0.3), 2));
    };

    const resetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    if (!courseName) {
        return (
            <div className="p-4 text-center text-text-muted-light dark:text-text-muted-dark">
                Select a course to view its curriculum graph
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 size={24} className="animate-spin text-primary mr-2" />
                <span>Loading curriculum graph...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4">
                <div className="flex items-center gap-2 text-red-500 mb-4">
                    <AlertTriangle size={20} />
                    <span>{error}</span>
                </div>
                <Button onClick={fetchVisualization} leftIcon={<RefreshCw size={16} />} size="sm">
                    Retry
                </Button>
            </div>
        );
    }

    if (!vizData || !vizData.nodes || vizData.nodes.length === 0) {
        return (
            <div className="p-4 text-center text-text-muted-light dark:text-text-muted-dark">
                <Network size={48} className="mx-auto mb-2 opacity-50" />
                <p>No curriculum data found for "{courseName}"</p>
                <p className="text-xs mt-1 opacity-70">Upload a syllabus CSV first to build the graph</p>
            </div>
        );
    }

    const positionedNodes = calculateLayout(vizData.nodes, vizData.edges);

    // Calculate stats from nodes
    const modules = vizData.nodes.filter(n => n.type === 'module');
    const topics = vizData.nodes.filter(n => n.type === 'topic');
    const subtopics = vizData.nodes.filter(n => n.type === 'subtopic');

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-light dark:text-text-dark">
                        {vizData.course}: {modules.length} modules, {topics.length} topics
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <IconButton icon={ZoomOut} onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} title="Zoom Out" size="sm" variant="ghost" />
                    <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
                    <IconButton icon={ZoomIn} onClick={() => setZoom(z => Math.min(z + 0.2, 2))} title="Zoom In" size="sm" variant="ghost" />
                    <IconButton icon={Maximize2} onClick={resetView} title="Reset View" size="sm" variant="ghost" />
                    <IconButton icon={RefreshCw} onClick={fetchVisualization} title="Refresh" size="sm" variant="ghost" />
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: NODE_COLORS.module.bg }}></div>
                    <span>Module</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: NODE_COLORS.topic.bg }}></div>
                    <span>Topic</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: NODE_COLORS.subtopic.bg }}></div>
                    <span>Subtopic</span>
                </div>
            </div>

            {/* Graph Container */}
            <div
                ref={containerRef}
                className="relative border border-border-light dark:border-border-dark rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900/50"
                style={{ height: '400px', cursor: isDragging.current ? 'grabbing' : 'grab' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                {/* SVG for edges */}
                <svg
                    width="100%"
                    height="100%"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'top left'
                    }}
                >
                    {vizData.edges.map((edge, i) => {
                        const fromNode = positionedNodes.find(n => n.id === edge.from);
                        const toNode = positionedNodes.find(n => n.id === edge.to);
                        if (!fromNode || !toNode) return null;

                        return (
                            <g key={`edge-${edge.from}-${edge.to}-${edge.type}-${i}`}>
                                <line
                                    x1={fromNode.x + 50}
                                    y1={fromNode.y + 20}
                                    x2={toNode.x + 50}
                                    y2={toNode.y + 20}
                                    stroke={EDGE_COLORS[edge.type] || '#9CA3AF'}
                                    strokeWidth={2}
                                    strokeOpacity={0.6}
                                    markerEnd="url(#arrowhead)"
                                />
                            </g>
                        );
                    })}
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="10"
                            markerHeight="7"
                            refX="10"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
                        </marker>
                    </defs>
                </svg>

                {/* Nodes */}
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'top left'
                    }}
                >
                    {positionedNodes.map((node, nodeIdx) => {
                        const colors = NODE_COLORS[node.type] || NODE_COLORS.topic;
                        const isSelected = selectedNode?.id === node.id;

                        return (
                            <div
                                key={`node-${node.id}-${node.type}-${nodeIdx}`}
                                className="graph-node absolute cursor-pointer transition-all duration-150 hover:shadow-lg hover:scale-105"
                                style={{
                                    left: node.x,
                                    top: node.y,
                                    width: '100px',
                                    minHeight: '40px',
                                    backgroundColor: colors.bg,
                                    borderColor: isSelected ? '#FFFFFF' : colors.border,
                                    borderWidth: isSelected ? '3px' : '2px',
                                    borderStyle: 'solid',
                                    borderRadius: node.type === 'module' ? '8px' : node.type === 'topic' ? '16px' : '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '4px 8px',
                                    boxShadow: isSelected ? '0 0 0 3px rgba(255,255,255,0.3)' : '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedNode(isSelected ? null : node);
                                }}
                                title={`${node.type}: ${node.label}`}
                            >
                                <span
                                    style={{ color: colors.text, fontSize: '10px', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}
                                    className="truncate"
                                >
                                    {node.label?.length > 15 ? node.label.slice(0, 15) + '...' : node.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Selected Node Details */}
            {selectedNode && (
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
                    <h4 className="font-semibold text-text-light dark:text-text-dark">
                        {selectedNode.label}
                    </h4>
                    <p className="text-text-muted-light dark:text-text-muted-dark text-xs mt-1">
                        Type: <span className="capitalize">{selectedNode.type}</span>
                        {selectedNode.module_id && ` • Module: ${selectedNode.module_id}`}
                        {selectedNode.qdrant_doc_count !== undefined && ` • Documents: ${selectedNode.qdrant_doc_count}`}
                    </p>
                </div>
            )}
        </div>
    );
}

export default CurriculumVisualizer;

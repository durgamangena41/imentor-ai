import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Lock, Unlock, CheckCircle2, Zap, TrendingUp, ChevronRight,
    BarChart3, Eye, EyeOff, MapPin, AlertCircle
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import SkillAssessmentModal from './SkillAssessmentModal';

const SkillTreeMap = () => {
    const canvasRef = useRef(null);
    const [skillTree, setSkillTree] = useState([]);
    const [selectedSkill, setSelectedSkill] = useState(null);
    const [loading, setLoading] = useState(true);
    const [hoveredSkill, setHoveredSkill] = useState(null);
    const [viewMode, setViewMode] = useState('fog'); // 'fog' or 'detail'
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [showAssessment, setShowAssessment] = useState(false);

    // Refs for animation loop to avoid stale state
    const skillTreeRef = useRef(skillTree);
    const zoomLevelRef = useRef(zoomLevel);
    const panOffsetRef = useRef(panOffset);
    const starsRef = useRef([]);
    const animationFrameRef = useRef();

    useEffect(() => { skillTreeRef.current = skillTree; }, [skillTree]);
    useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);
    useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

    // Fetch skill tree data
    useEffect(() => {
        fetchSkillTree();
    }, []);

    const fetchSkillTree = async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${import.meta.env.VITE_API_BASE_URL}/gamification/skill-tree`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setSkillTree(response.data.skillTree || []);
            setLoading(false);
        } catch (error) {
            console.error('[SkillTreeMap] Error fetching skill tree:', error);
            toast.error('Failed to load skill tree');
            setLoading(false);
        }
    };

    // Calculate visual properties for a skill node based on its state
    const getNodeVisuals = (skill) => {
        const baseColors = {
            locked: {
                bg: '#000000',
                border: '#27272a',
                displayBg: 'radial-gradient(circle at 30% 30%, #27272a, #000000)',
                text: '#52525b',
                glow: 'rgba(39, 39, 42, 0)',
                shadow: 'none'
            },
            unlocked: {
                bg: '#18181b',
                border: '#71717a',
                displayBg: 'radial-gradient(circle at 30% 30%, #3f3f46, #18181b)',
                text: '#e4e4e7',
                glow: 'rgba(255, 255, 255, 0.15)',
                shadow: '0 0 15px rgba(113, 113, 122, 0.2)'
            },
            mastered: {
                bg: '#ffffff',
                border: '#ffffff',
                displayBg: 'radial-gradient(circle at 30% 30%, #ffffff, #d4d4d8)',
                text: '#000000',
                glow: 'rgba(255, 255, 255, 0.8)',
                shadow: '0 0 25px rgba(255, 255, 255, 0.5)'
            }
        };

        const state = skill.status === 'mastered' ? 'mastered' :
            skill.status === 'unlocked' ? 'unlocked' : 'locked';

        const visuals = baseColors[state];

        return {
            ...visuals,
            state,
            opacity: skill.status === 'locked' ? 0.8 : 1,
            scale: hoveredSkill === skill.skillId ? 1.15 : 1,
            // Enhanced visual properties
            background: visuals.displayBg,
            boxShadow: hoveredSkill === skill.skillId ? `0 0 30px ${visuals.glow}` : visuals.shadow
        };
    };

    // Handle zoom
    const handleWheel = (e) => {
        e.preventDefault();
        const newZoom = e.deltaY < 0 ? zoomLevel * 1.1 : zoomLevel / 1.1;
        setZoomLevel(Math.max(0.5, Math.min(3, newZoom)));
    };

    // Handle pan
    const handleMouseDown = (e) => {
        if (e.button === 2) { // Right mouse button for panning
            setIsDragging(true);
            setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setPanOffset({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Calculate node position on canvas
    const getNodePosition = (skill) => {
        const canvasWidth = canvasRef.current?.clientWidth || 1000;
        const canvasHeight = canvasRef.current?.clientHeight || 600;

        // Normalize position to canvas size
        const x = (skill.position.x / 100) * canvasWidth * zoomLevel + panOffset.x;
        const y = (skill.position.y / 100) * canvasHeight * zoomLevel + panOffset.y;

        return { x, y };
    };

    // Draw edges between skills (connections)
    const drawEdges = (ctx, currentSkillTree, currentZoom, currentPan) => {
        ctx.strokeStyle = 'rgba(113, 113, 122, 0.3)'; // Zinc-500 low opacity
        ctx.lineWidth = 2 * currentZoom;
        ctx.lineCap = 'round';

        // Helper to get position from refs
        const getPos = (skill) => {
            const canvasWidth = canvasRef.current?.width || 1000;
            const canvasHeight = canvasRef.current?.height || 600;
            const x = (skill.position.x / 100) * (canvasWidth / window.devicePixelRatio) * currentZoom + currentPan.x;
            const y = (skill.position.y / 100) * (canvasHeight / window.devicePixelRatio) * currentZoom + currentPan.y;
            return { x, y };
        };

        currentSkillTree.forEach((skill) => {
            const { x: x1, y: y1 } = getPos(skill);

            skill.prerequisites?.forEach((prereqId) => {
                const prereq = currentSkillTree.find(s => s.skillId === prereqId);
                if (prereq) {
                    const { x: x2, y: y2 } = getPos(prereq);

                    ctx.shadowBlur = 0;

                    // Dashed line for unlocked skills with glow
                    if (skill.status === 'unlocked' || skill.status === 'mastered') {
                        ctx.setLineDash([5 * currentZoom, 5 * currentZoom]);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Brighter Zinc
                        ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';
                        ctx.shadowBlur = 5;
                    } else {
                        ctx.setLineDash([]);
                        ctx.strokeStyle = 'rgba(63, 63, 70, 0.3)'; // Zinc-700
                        ctx.shadowBlur = 0;
                    }

                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();

                    // Reset shadow for performance
                    ctx.shadowBlur = 0;
                }
            });
        });
    };

    // Draw twinkling stars
    const drawStars = (ctx, width, height, currentPan) => {
        // Parallax factor: stars move slower than the graph (0.1 speed)
        const parallaxX = currentPan.x * 0.1;
        const parallaxY = currentPan.y * 0.1;

        starsRef.current.forEach(star => {
            // Update twinkle
            star.opacity += star.twinkleSpeed;
            if (star.opacity > 1 || star.opacity < 0.1) {
                star.twinkleSpeed = -star.twinkleSpeed;
            }

            const x = (star.x + parallaxX) % width;
            const y = (star.y + parallaxY) % height;
            // Wrap around logic
            const finalX = x < 0 ? width + x : x;
            const finalY = y < 0 ? height + y : y;

            ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, Math.min(1, star.opacity))})`;
            ctx.beginPath();
            ctx.arc(finalX, finalY, star.size, 0, Math.PI * 2);
            ctx.fill();
        });
    };

    // Animation Loop
    useEffect(() => {
        if (!canvasRef.current) return;

        // Initialize Stars
        if (starsRef.current.length === 0) {
            for (let i = 0; i < 150; i++) {
                starsRef.current.push({
                    x: Math.random() * window.innerWidth,
                    y: Math.random() * window.innerHeight,
                    size: Math.random() * 2,
                    opacity: Math.random(),
                    twinkleSpeed: (Math.random() - 0.5) * 0.02
                });
            }
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const render = () => {
            if (!canvas) return;

            // Handle DPI scaling
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                ctx.scale(dpr, dpr);
            }

            // Current State from Refs
            const currentZoom = zoomLevelRef.current;
            const currentPan = panOffsetRef.current;
            const currentTree = skillTreeRef.current;

            // Clear canvas - Pure Black
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, rect.width, rect.height);

            // Draw Stars
            drawStars(ctx, rect.width, rect.height, currentPan);

            // Draw Grid - subtle
            ctx.strokeStyle = 'rgba(39, 39, 42, 0.4)'; // Zinc-900
            ctx.lineWidth = 1;

            const gridSize = 50 * currentZoom;
            const offsetX = currentPan.x % gridSize;
            const offsetY = currentPan.y % gridSize;

            ctx.beginPath();
            for (let i = offsetX; i < rect.width; i += gridSize) {
                ctx.moveTo(i, 0);
                ctx.lineTo(i, rect.height);
            }
            for (let i = offsetY; i < rect.height; i += gridSize) {
                ctx.moveTo(0, i);
                ctx.lineTo(rect.width, i);
            }
            ctx.stroke();

            // Draw Edges
            drawEdges(ctx, currentTree, currentZoom, currentPan);

            animationFrameRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []); // Run once, loop uses refs


    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-black">
                <div className="text-center">
                    <Zap className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
                    <p className="text-zinc-400">Loading Skill Tree...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-screen flex flex-col bg-black text-zinc-100">
            {/* Header */}
            <div className="bg-black border-b border-zinc-800 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* White/Black Icon */}
                        <div className="p-2 bg-white rounded-lg">
                            <MapPin className="w-6 h-6 text-black" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">Skill Tree</h1>
                            <p className="text-sm text-zinc-400">Mastery Path</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setViewMode(viewMode === 'fog' ? 'detail' : 'fog')}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-colors text-zinc-300"
                        >
                            {viewMode === 'fog' ? (
                                <><EyeOff className="w-4 h-4" /> Fog Mode</>
                            ) : (
                                <><Eye className="w-4 h-4" /> Detail Mode</>
                            )}
                        </button>
                        <button
                            onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                            className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-colors text-sm text-zinc-400 hover:text-white"
                        >
                            Reset View
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 gap-4 overflow-hidden p-4 bg-black">
                {/* Canvas View */}
                <div className="flex-1 relative bg-black rounded-lg overflow-hidden border border-zinc-900 shadow-2xl shadow-zinc-950">
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full cursor-grab active:cursor-grabbing"
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onContextMenu={(e) => e.preventDefault()}
                    />

                    {/* Skill Nodes Overlay */}
                    {skillTree.map((skill) => {
                        const { x, y } = getNodePosition(skill);
                        const visuals = getNodeVisuals(skill);
                        const nodeSize = 60;

                        return (
                            <motion.div
                                key={skill.skillId}
                                className="absolute"
                                style={{
                                    left: `${x - nodeSize / 2}px`,
                                    top: `${y - nodeSize / 2}px`,
                                    width: nodeSize,
                                    height: nodeSize
                                }}
                                onMouseEnter={() => setHoveredSkill(skill.skillId)}
                                onMouseLeave={() => setHoveredSkill(null)}
                                onClick={() => setSelectedSkill(skill)}
                            >
                                <motion.div
                                    animate={{ scale: visuals.scale }}
                                    whileHover={{ scale: 1.15 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    className="relative w-full h-full cursor-pointer"
                                >
                                    {/* Glow effect for mastered skills - Subtle White */}
                                    {skill.status === 'mastered' && (
                                        <motion.div
                                            className="absolute inset-0 rounded-full"
                                            style={{
                                                background: `radial-gradient(circle, ${visuals.glow}, transparent)`,
                                                filter: 'blur(15px)'
                                            }}
                                            animate={{ opacity: [0.3, 0.6, 0.3] }}
                                            transition={{ duration: 3, repeat: Infinity }}
                                        />
                                    )}

                                    {/* Main node circle */}
                                    <motion.div
                                        className="absolute inset-0 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-300"
                                        style={{
                                            background: visuals.background,
                                            borderColor: visuals.border,
                                            // opacity: visuals.opacity, // Opacity handled in gradient/color
                                            boxShadow: visuals.boxShadow
                                        }}
                                    >
                                        {skill.status === 'locked' && (
                                            <Lock className="w-5 h-5 text-zinc-600" />
                                        )}
                                        {skill.status === 'unlocked' && (
                                            <Unlock className="w-5 h-5 text-zinc-300" />
                                        )}
                                        {skill.status === 'mastered' && (
                                            <CheckCircle2 className="w-6 h-6 text-black" />
                                        )}
                                    </motion.div>

                                    {/* Tooltip on hover - Clean Black/White */}
                                    {hoveredSkill === skill.skillId && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: -70 }}
                                            className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-3 rounded-none bg-black border border-white shadow-[4px_4px_0px_rgba(255,255,255,0.2)] z-50 whitespace-normal text-center"
                                        >
                                            <p className="font-bold text-white text-sm uppercase tracking-wider">{skill.name}</p>
                                            <p className="text-xs text-zinc-400 mt-1">{skill.category}</p>
                                            <p className="text-xs font-mono text-zinc-500 mt-2 border-t border-zinc-800 pt-2">{skill.masteryPercentage}% MASTERY</p>
                                        </motion.div>
                                    )}
                                </motion.div>
                            </motion.div>
                        );
                    })}

                    {/* Controls hint */}
                    <div className="absolute bottom-4 left-4 text-xs font-mono text-zinc-600 bg-black/50 px-2 py-1 border border-zinc-900">
                        <p>SCROLL: ZOOM • RIGHT-CLICK: PAN</p>
                    </div>
                </div>

                {/* Details Panel - Brutalist/Minimalist */}
                {selectedSkill && (
                    <motion.div
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        style={{ height: 'calc(100vh - 8rem)' }}
                        className="w-96 bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-hidden flex flex-col absolute right-0 top-[4.5rem] bottom-0 z-10"
                    >
                        {/* Header */}
                        <div className="bg-zinc-900/50 p-6 border-b border-zinc-800">
                            <div className="flex items-start justify-between mb-2">
                                <h2 className="text-2xl font-bold text-white leading-tight">{selectedSkill.name}</h2>
                                <button
                                    onClick={() => setSelectedSkill(null)}
                                    className="text-zinc-500 hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            <p className="text-xs text-zinc-400 uppercase tracking-widest">{selectedSkill.category}</p>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Status Badge */}
                            <div>
                                <span className={`inline-flex items-center gap-2 px-3 py-1.5 border text-xs font-bold uppercase tracking-wider ${selectedSkill.status === 'mastered' ? 'bg-white text-black border-white' :
                                    selectedSkill.status === 'unlocked' ? 'bg-zinc-800 text-zinc-300 border-zinc-700' :
                                        'bg-black text-zinc-600 border-zinc-800'
                                    }`}>
                                    {selectedSkill.status === 'mastered' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                    {selectedSkill.status === 'unlocked' && <Unlock className="w-3.5 h-3.5" />}
                                    {selectedSkill.status === 'locked' && <Lock className="w-3.5 h-3.5" />}
                                    {selectedSkill.status}
                                </span>

                                {selectedSkill.status === 'locked' && selectedSkill.blockedBy && (
                                    <div className="mt-2 text-xs text-zinc-500 flex items-center gap-1.5 font-mono">
                                        <Lock className="w-3 h-3" />
                                        REQUIRES: {selectedSkill.blockedBy}
                                    </div>
                                )}
                            </div>

                            {/* Description */}
                            {selectedSkill.description && (
                                <div>
                                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Description</p>
                                    <p className="text-sm text-zinc-300 leading-relaxed font-light">{selectedSkill.description}</p>
                                </div>
                            )}

                            {/* Mastery Progress */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Mastery</p>
                                    <p className="text-sm font-mono font-bold text-white">{selectedSkill.masteryPercentage}%</p>
                                </div>
                                <div className="w-full h-1 bg-zinc-900">
                                    <motion.div
                                        className="h-full bg-white"
                                        animate={{ width: `${selectedSkill.masteryPercentage}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                                <p className="text-xs text-zinc-600 mt-2 font-mono">
                                    {selectedSkill.masteryPercentage >= selectedSkill.masteryThreshold ? (
                                        <>// MASTERY UNLOCKED</>
                                    ) : (
                                        <>{selectedSkill.masteryThreshold - selectedSkill.masteryPercentage}% TO MASTERY</>
                                    )}
                                </p>
                            </div>

                            {/* Prerequisites */}
                            {selectedSkill.prerequisites && selectedSkill.prerequisites.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Requirements</p>
                                    <div className="space-y-2 border-l border-zinc-800 pl-4">
                                        {selectedSkill.prerequisites.map((prereqId) => {
                                            const prereq = skillTree.find(s => s.skillId === prereqId);
                                            return (
                                                <div key={prereqId} className="text-sm flex items-center gap-3">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${prereq?.mastered ? 'bg-white' : 'bg-zinc-800'}`} />
                                                    <span className={prereq?.mastered ? 'text-zinc-300 line-through decoration-zinc-600' : 'text-zinc-500'}>
                                                        {prereq?.name || prereqId}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800">
                                <div className="bg-zinc-950 p-4 text-center">
                                    <p className="text-[10px] text-zinc-500 uppercase">Difficulty</p>
                                    <p className="text-sm font-bold text-white mt-1">
                                        {selectedSkill.difficulty.toUpperCase()}
                                    </p>
                                </div>
                                <div className="bg-zinc-950 p-4 text-center">
                                    <p className="text-[10px] text-zinc-500 uppercase">Est. Time</p>
                                    <p className="text-sm font-bold text-white mt-1">{selectedSkill.estimatedHours}H</p>
                                </div>
                            </div>
                        </div>

                        {/* Action Button */}
                        {selectedSkill.status === 'unlocked' && (
                            <div className="p-6 border-t border-zinc-800 bg-zinc-950">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setShowAssessment(true)}
                                    className="w-full py-4 bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-wider flex items-center justify-center gap-3 transition-colors"
                                >
                                    <TrendingUp className="w-5 h-5" />
                                    Start Assessment
                                </motion.button>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Assessment Modal */}
                <AnimatePresence>
                    {showAssessment && selectedSkill && (
                        <SkillAssessmentModal
                            skill={selectedSkill}
                            onClose={() => setShowAssessment(false)}
                            onSuccess={(result) => {
                                setShowAssessment(false);
                                // Refresh skill tree to show updated mastery
                                fetchSkillTree();
                                // Update selected skill
                                if (selectedSkill) {
                                    const updated = skillTree.find(s => s.skillId === selectedSkill.skillId);
                                    if (updated) {
                                        setSelectedSkill({ ...updated, masteryPercentage: result.newMastery });
                                    }
                                }
                            }}
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* Legend - Minimalist */}
            <div className="bg-black border-t border-zinc-900 px-6 py-4">
                <div className="flex items-center gap-8 text-xs font-mono text-zinc-500">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border border-zinc-800 bg-black" />
                        <span>LOCKED</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border border-zinc-500 bg-zinc-800" />
                        <span>UNLOCKED</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border-2 border-white bg-white" />
                        <span className="text-white font-bold">MASTERED</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SkillTreeMap;

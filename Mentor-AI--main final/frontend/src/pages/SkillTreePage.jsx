import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import api from '../services/api';
import { Lock, Unlock, Zap, ArrowLeft } from 'lucide-react';

const initialNodes = [
    {
        id: 'root',
        type: 'input',
        data: { label: 'Novice Learner', status: 'unlocked', level: 1 },
        position: { x: 250, y: 0 },
        style: { background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', width: 150 }
    },
    {
        id: 'remember',
        data: { label: 'Remember', status: 'locked', level: 1 },
        position: { x: 50, y: 150 },
        style: { background: '#cbd5e1', color: '#64748b' }
    },
    {
        id: 'understand',
        data: { label: 'Understand', status: 'locked', level: 2 },
        position: { x: 250, y: 150 },
        style: { background: '#cbd5e1', color: '#64748b' }
    },
    {
        id: 'apply',
        data: { label: 'Apply', status: 'locked', level: 3 },
        position: { x: 450, y: 150 },
        style: { background: '#cbd5e1', color: '#64748b' }
    },
    // Tier 2
    {
        id: 'analyze',
        data: { label: 'Analyze', status: 'locked', level: 4 },
        position: { x: 100, y: 300 },
        style: { background: '#cbd5e1', color: '#64748b' }
    },
    {
        id: 'evaluate',
        data: { label: 'Evaluate', status: 'locked', level: 5 },
        position: { x: 400, y: 300 },
        style: { background: '#cbd5e1', color: '#64748b' }
    },
    // Apex
    {
        id: 'create',
        data: { label: 'Create', status: 'locked', level: 6 },
        position: { x: 250, y: 450 },
        style: { background: '#cbd5e1', color: '#64748b' }
    },
];

const initialEdges = [
    { id: 'e1-2', source: 'root', target: 'remember', animate: true },
    { id: 'e1-3', source: 'root', target: 'understand', animate: true },
    { id: 'e1-4', source: 'root', target: 'apply', animate: true },
    { id: 'e2-5', source: 'remember', target: 'analyze' },
    { id: 'e3-5', source: 'understand', target: 'analyze' },
    { id: 'e3-6', source: 'understand', target: 'evaluate' },
    { id: 'e4-6', source: 'apply', target: 'evaluate' },
    { id: 'e5-7', source: 'analyze', target: 'create' },
    { id: 'e6-7', source: 'evaluate', target: 'create' },
];

const SkillTreePage = () => {
    const navigate = useNavigate();
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [userScore, setUserScore] = useState(null);

    useEffect(() => {
        const fetchScore = async () => {
            try {
                const score = await api.getUserScore();
                setUserScore(score);
                updateNodeStyles(score);
            } catch (error) {
                console.error("Failed to fetch score:", error);
            }
        };
        fetchScore();
    }, []);

    const updateNodeStyles = (score) => {
        if (!score || !score.cognitiveProfile) return;

        // Logic: If user has ANY point in a category, unlock it.
        // Or base it on totalXP/Level. Let's use cognitiveProfile presence.

        setNodes((nds) =>
            nds.map((node) => {
                const nodeId = node.id;
                let isUnlocked = false;

                if (nodeId === 'root') isUnlocked = true;
                else if (score.cognitiveProfile[nodeId] > 0) isUnlocked = true;
                // Fallback: unlock based on level
                else if (score.level >= node.data.level) isUnlocked = true;

                if (isUnlocked) {
                    return {
                        ...node,
                        data: { ...node.data, status: 'unlocked' },
                        style: {
                            ...node.style,
                            background: '#3b82f6', // blue-500
                            color: 'white',
                            boxShadow: '0 0 15px rgba(59, 130, 246, 0.5)',
                            border: '2px solid #2563eb'
                        },
                    };
                }
                return node;
            })
        );
    };

    return (
        <div className="h-screen w-full bg-slate-900 pt-20">
            {/* Back Button */}
            <button
                onClick={() => navigate(-1)}
                className="absolute top-24 left-8 z-20 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={20} />
                <span>Back</span>
            </button>

            <div className="absolute top-36 left-8 z-10 bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl text-white">
                <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
                    <Zap className="text-yellow-400" /> Skill Tree
                </h1>
                <p className="text-slate-400 text-sm mb-4">Fog of War: Enabled</p>
                {userScore && (
                    <div className="space-y-2">
                        <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">Your Stats</div>
                        <div className="flex justify-between text-sm">
                            <span>Level</span>
                            <span className="font-bold text-blue-400">{userScore.level}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>Total XP</span>
                            <span className="font-bold text-yellow-500">{userScore.totalXP}</span>
                        </div>
                    </div>
                )}
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                className="bg-slate-900"
            >
                <Background color="#334155" gap={16} />
                <Controls />
            </ReactFlow>
        </div>
    );
};

export default SkillTreePage;

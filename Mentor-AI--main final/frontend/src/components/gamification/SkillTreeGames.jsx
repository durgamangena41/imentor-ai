import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Gamepad2, Plus, Trophy, Star, ChevronRight, Trash2,
    Clock, Target, Zap, BookOpen, Loader2, Play, ArrowLeft
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const SkillTreeGames = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Check if we just created a new game from assessment
    const newGameData = location.state?.newGame;

    useEffect(() => {
        fetchGames();
    }, []);

    useEffect(() => {
        // If we have new game data, save it
        if (newGameData) {
            saveNewGame(newGameData);
            // Clear the state to prevent re-saving on refresh
            window.history.replaceState({}, document.title);
        }
    }, [newGameData]);

    // Redirect to new game page if no games exist (and not coming with new game data)
    useEffect(() => {
        if (!loading && games.length === 0 && !newGameData) {
            navigate('/gamification/skill-tree/new', { state: { hasGames: false } });
        }
    }, [loading, games, newGameData, navigate]);

    const fetchGames = async () => {
        try {
            const data = await api.getSkillTreeGames();
            setGames(data.games || []);
        } catch (error) {
            console.error('[SkillTreeGames] Error fetching games:', error);
            toast.error('Failed to load your games');
        } finally {
            setLoading(false);
        }
    };

    const saveNewGame = async (gameData) => {
        try {
            await api.saveGame(gameData);
            // Refresh games list
            fetchGames();
            toast.success(`"${gameData.topic}" skill tree created!`);
        } catch (error) {
            console.error('[SkillTreeGames] Error saving game:', error);
            toast.error('Failed to save game');
        }
    };

    const handlePlayGame = (game) => {
        navigate('/gamification/skill-tree/map', {
            state: {
                topic: game.topic,
                assessmentResult: game.assessmentResult,
                gameId: game._id,
                savedLevels: game.levels
            }
        });
    };

    const handleDeleteGame = async (gameId) => {
        try {
            await api.deleteSkillTreeGame(gameId);
            setGames(prev => prev.filter(g => g._id !== gameId));
            toast.success('Game deleted');
            setDeleteConfirm(null);
        } catch (error) {
            console.error('[SkillTreeGames] Error deleting game:', error);
            toast.error('Failed to delete game');
        }
    };

    const handleCreateNew = () => {
        navigate('/gamification/skill-tree/new', { state: { hasGames: games.length > 0 } });
    };

    const getProgressPercentage = (game) => {
        if (!game.levels || game.levels.length === 0) return 0;
        const completed = game.levels.filter(l => l.status === 'completed').length;
        return Math.round((completed / game.levels.length) * 100);
    };

    const getTotalStars = (game) => {
        if (!game.levels) return 0;
        return game.levels.reduce((sum, l) => sum + (l.stars || 0), 0);
    };

    const getMaxStars = (game) => {
        if (!game.levels) return 0;
        return game.levels.length * 3;
    };

    // Capitalize first letter of each word
    const formatTopic = (topic) => {
        if (!topic) return '';
        return topic.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-white animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black p-6">
            <div className="max-w-5xl mx-auto">
                {/* Back Button */}
                <motion.button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-6"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    whileHover={{ x: -5 }}
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back</span>
                </motion.button>

                {/* Header */}
                <motion.div
                    className="text-center mb-10"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-zinc-900">
                        <Gamepad2 className="w-8 h-8 text-black" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">My Skill Trees</h1>
                    <p className="text-zinc-400">Continue learning or start a new adventure</p>
                </motion.div>

                {/* Games Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Create New Game Card */}
                    <motion.button
                        onClick={handleCreateNew}
                        className="bg-zinc-950 border border-zinc-800 hover:border-white rounded-2xl p-6 flex flex-col items-center justify-center min-h-[280px] transition-all group"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <div className="w-16 h-16 bg-zinc-900 group-hover:bg-white rounded-full flex items-center justify-center mb-4 transition-colors">
                            <Plus className="w-8 h-8 text-zinc-500 group-hover:text-black transition-colors" />
                        </div>
                        <h3 className="text-lg font-bold text-zinc-300 group-hover:text-white transition-colors">
                            New Skill Tree
                        </h3>
                        <p className="text-sm text-zinc-500 mt-1">Start a new learning adventure</p>
                    </motion.button>

                    {/* Existing Games */}
                    {games.map((game, index) => {
                        const progress = getProgressPercentage(game);
                        const stars = getTotalStars(game);
                        const maxStars = getMaxStars(game);
                        const completedLevels = game.levels?.filter(l => l.status === 'completed').length || 0;
                        const totalLevels = game.levels?.length || 0;

                        return (
                            <motion.div
                                key={game._id}
                                className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-all group"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                            >
                                {/* Card Header - Monochrome */}
                                <div className="h-24 bg-zinc-800 relative border-b border-zinc-700">
                                    <div className="absolute bottom-3 left-4">
                                        <span className="px-3 py-1 bg-black/50 backdrop-blur-sm rounded-full text-xs font-mono font-medium text-white border border-zinc-600">
                                            {game.assessmentResult?.level || 'Beginner'}
                                        </span>
                                    </div>
                                    {/* Delete button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteConfirm(game._id);
                                        }}
                                        className="absolute top-3 right-3 p-2 bg-black/30 hover:bg-red-900/80 hover:text-red-200 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Trash2 className="w-4 h-4 text-zinc-300" />
                                    </button>
                                </div>

                                {/* Card Content */}
                                <div className="p-5">
                                    <h3 className="text-xl font-bold text-white mb-1 truncate capitalize tracking-tight">
                                        {formatTopic(game.topic)}
                                    </h3>
                                    <p className="text-sm text-zinc-500 mb-4 flex items-center gap-2 font-mono">
                                        <Clock className="w-3 h-3" />
                                        {new Date(game.updatedAt || game.createdAt).toLocaleDateString()}
                                    </p>

                                    {/* Progress Bar */}
                                    <div className="mb-4">
                                        <div className="flex justify-between text-xs text-zinc-400 mb-1 font-mono uppercase">
                                            <span>Progress</span>
                                            <span>{progress}%</span>
                                        </div>
                                        <div className="h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                                            <motion.div
                                                className="h-full bg-white"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progress}%` }}
                                                transition={{ delay: 0.3 }}
                                            />
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-1.5 text-sm">
                                            <Target className="w-4 h-4 text-zinc-400" />
                                            <span className="text-white font-bold">{completedLevels}/{totalLevels}</span>
                                            <span className="text-zinc-500 text-xs uppercase">levels</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-sm">
                                            <Star className="w-4 h-4 text-white fill-white" />
                                            <span className="text-white font-bold">{stars}/{maxStars}</span>
                                        </div>
                                    </div>

                                    {/* Play Button */}
                                    <motion.button
                                        onClick={() => handlePlayGame(game)}
                                        className="w-full py-3 bg-white hover:bg-zinc-200 text-black rounded-lg font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <Play className="w-4 h-4 fill-current" />
                                        {progress > 0 ? 'Continue' : 'Start'}
                                    </motion.button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Empty State */}
                {games.length === 0 && (
                    <motion.div
                        className="text-center py-12"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                    >
                        <BookOpen className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-zinc-500 mb-2">No skill trees yet</h3>
                        <p className="text-zinc-600 mb-6">Create your first skill tree to start learning!</p>
                    </motion.div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {deleteConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setDeleteConfirm(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-800"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="text-xl font-bold text-white mb-2">Delete Skill Tree?</h3>
                            <p className="text-zinc-400 mb-6">
                                This will permanently delete all your progress in this skill tree. This action cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDeleteGame(deleteConfirm)}
                                    className="flex-1 py-3 bg-white hover:bg-zinc-200 text-black rounded-xl font-bold transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SkillTreeGames;

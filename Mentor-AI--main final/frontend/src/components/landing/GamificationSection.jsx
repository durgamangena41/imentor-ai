import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Flame, Zap, Target } from 'lucide-react';

const GamificationSection = () => {
    return (
        <section className="py-24 bg-black relative overflow-hidden border-t border-gray-900">
            {/* Background Decorations */}
            <div className="absolute top-0 left-1/4 w-72 h-72 bg-gray-900/50 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gray-900/30 rounded-full blur-3xl"></div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="max-w-3xl mx-auto mb-16"
                >
                    <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-6">
                        Level Up Your <span className="text-white underline decoration-gray-700">Learning</span>
                    </h2>
                    <p className="text-xl text-gray-400">
                        Stay motivated with streaks, earn XP for every milestone, and unlock badges as you master new skills. Learning has never been this addictive.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Card 1: Streaks */}
                    <motion.div
                        className="bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-800 relative overflow-hidden group hover:shadow-2xl transition-all"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        viewport={{ once: true }}
                        whileHover={{ y: -10 }}
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-white">
                            <Flame size={120} />
                        </div>
                        <div className="w-16 h-16 rounded-2xl bg-gray-800 text-white flex items-center justify-center mb-6 mx-auto border border-gray-700">
                            <Flame size={32} fill="currentColor" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Daily Streaks</h3>
                        <p className="text-gray-400">
                            Build a habit. Keep your streak alive by learning something new every single day.
                        </p>
                    </motion.div>

                    {/* Card 2: XP & Levels */}
                    <motion.div
                        className="bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-800 relative overflow-hidden group hover:shadow-2xl transition-all"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        viewport={{ once: true }}
                        whileHover={{ y: -10 }}
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-white">
                            <Zap size={120} />
                        </div>
                        <div className="w-16 h-16 rounded-2xl bg-gray-800 text-white flex items-center justify-center mb-6 mx-auto border border-gray-700">
                            <Zap size={32} fill="currentColor" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">XP & Levels</h3>
                        <p className="text-gray-400">
                            Earn XP for reading papers, solving quizzes, and writing code. Watch your level grow!
                        </p>
                    </motion.div>

                    {/* Card 3: Badges */}
                    <motion.div
                        className="bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-800 relative overflow-hidden group hover:shadow-2xl transition-all"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        viewport={{ once: true }}
                        whileHover={{ y: -10 }}
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-white">
                            <Trophy size={120} />
                        </div>
                        <div className="w-16 h-16 rounded-2xl bg-white text-black flex items-center justify-center mb-6 mx-auto">
                            <Trophy size={32} fill="currentColor" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Earn Badges</h3>
                        <p className="text-gray-400">
                            Collect unique badges for mastering topics, critical thinking, and consistency.
                        </p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default GamificationSection;

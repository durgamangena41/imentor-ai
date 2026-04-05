import React from 'react';
import { motion } from 'framer-motion';
import { Swords, Trophy, Zap, Target, Brain, ArrowRight } from 'lucide-react';
import Button from '../core/Button';

const MasteryChallenges = ({ onLoginClick }) => {
    return (
        <section id="mastery" className="py-24 bg-black relative overflow-hidden border-t border-gray-900">
            {/* Background Decorations */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-gray-900/50 rounded-full blur-3xl -z-10 animate-pulse"></div>
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-gray-900/30 rounded-full blur-3xl -z-10"></div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="flex flex-col lg:flex-row items-center gap-16">
                    {/* Left side: Visual representation */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8 }}
                        viewport={{ once: true }}
                        className="w-full lg:w-1/2 flex justify-center"
                    >
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-white rounded-2xl blur opacity-10 group-hover:opacity-20 transition duration-1000 group-hover:duration-200"></div>
                            <div className="relative bg-gray-900 rounded-2xl p-8 border border-gray-800 shadow-2xl">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="p-3 bg-gray-800 rounded-xl text-white border border-gray-700">
                                        <Swords size={32} />
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-bold text-white">Advanced Mastery Arena</h4>
                                        <p className="text-sm text-gray-400">Personalized Knowledge Assessment</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {[
                                        { label: "Identifying Weaknesses", icon: Target, color: "text-white", bg: "bg-gray-800" },
                                        { label: "AI-Generated Scenarios", icon: Brain, color: "text-gray-300", bg: "bg-gray-800/50" },
                                        { label: "High-Stake Challenges", icon: Zap, color: "text-white", bg: "bg-gray-800" }
                                    ].map((item, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, y: 10 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 + (idx * 0.1) }}
                                            className="flex items-center gap-4 p-4 rounded-xl bg-gray-900 border border-gray-800"
                                        >
                                            <div className={`p-2 rounded-lg ${item.bg} ${item.color} border border-gray-700`}>
                                                <item.icon size={20} />
                                            </div>
                                            <span className="text-gray-300 font-medium">{item.label}</span>
                                        </motion.div>
                                    ))}
                                </div>

                                <div className="mt-8 pt-8 border-t border-gray-800 flex justify-between items-center text-sm font-semibold">
                                    <div className="flex items-center gap-2 text-white">
                                        <Trophy size={18} />
                                        <span>Earn Credits & Badges</span>
                                    </div>
                                    <span className="text-gray-500">14 Active Arenas</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right side: Content */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8 }}
                        viewport={{ once: true }}
                        className="w-full lg:w-1/2"
                    >
                        <span className="inline-block px-4 py-2 rounded-full bg-gray-900 text-gray-300 text-sm font-bold tracking-wider uppercase mb-6 border border-gray-700">
                            Assessment Engine
                        </span>
                        <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-8 leading-tight">
                            Conquer Your <span className="text-white underline decoration-gray-700">Learning Plateaus</span>
                        </h2>
                        <p className="text-lg text-gray-400 mb-10 leading-relaxed">
                            Don't just pass—excel. Our AI analyzes your learning history to identify hidden knowledge gaps and creates high-stakes "Mastery Challenges" designed to push you beyond your limits.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
                            <div className="flex gap-4">
                                <div className="text-white mt-1"><ArrowRight size={20} /></div>
                                <p className="text-gray-400">Adaptive difficulty based on performance</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-white mt-1"><ArrowRight size={20} /></div>
                                <p className="text-gray-400">Real-time AI feedback and revision plans</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-white mt-1"><ArrowRight size={20} /></div>
                                <p className="text-gray-400">Unlock unique badges and certificates</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-white mt-1"><ArrowRight size={20} /></div>
                                <p className="text-gray-400">Convert victories into Learning Credits</p>
                            </div>
                        </div>

                        <Button
                            variant="monochrome-outline"
                            size="lg"
                            onClick={onLoginClick}
                            className="bg-white text-black hover:bg-gray-200 border-none hover:scale-105 transition-transform shadow-lg shadow-black/20"
                        >
                            Start Your First Challenge
                        </Button>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default MasteryChallenges;

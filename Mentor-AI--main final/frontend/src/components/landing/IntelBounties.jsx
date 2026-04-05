import React from 'react';
import { motion } from 'framer-motion';
import { Target, Coins, Star, Clock, Sparkles, ArrowRight } from 'lucide-react';

import Button from '../core/Button';

const IntelBounties = ({ onLoginClick }) => {
    return (
        <section id="bounties" className="py-24 bg-black relative border-t border-gray-900">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        viewport={{ once: true }}
                    >
                        <span className="inline-block px-4 py-2 rounded-full bg-gray-900 text-gray-300 text-sm font-bold tracking-wider uppercase mb-6 border border-gray-700">
                            Knowledge Economy
                        </span>
                        <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-6">
                            Earn While You <span className="text-white">Excel</span>
                        </h2>
                        <p className="text-xl text-gray-400 leading-relaxed">
                            Complete daily Intel Bounties mapped to high-value knowledge gaps. Every challenge you solve feeds back into your learning ecosystem, unlocking premium AI features.
                        </p>
                    </motion.div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {[
                        {
                            topic: "Advanced Neural Networks",
                            reward: "+250",
                            difficulty: "Hard",
                            icon: "🧠",
                            color: "bg-gray-600"
                        },
                        {
                            topic: "Data Structure Optimization",
                            reward: "+100",
                            difficulty: "Medium",
                            icon: "⚡",
                            color: "bg-gray-400"
                        },
                        {
                            topic: "Vector Databases",
                            reward: "+300",
                            difficulty: "Elite",
                            icon: "💎",
                            color: "bg-white"
                        }
                    ].map((bounty, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, delay: idx * 0.1 }}
                            viewport={{ once: true }}
                            whileHover={{ y: -10 }}
                            className="group bg-gray-900 rounded-2xl border border-gray-800 shadow-sm overflow-hidden hover:shadow-2xl transition-all"
                        >
                            <div className={`h-2 w-full ${bounty.color}`}></div>
                            <div className="p-8">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="text-4xl">{bounty.icon}</div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-1 text-white font-bold mb-1">
                                            <Coins size={16} />
                                            <span>{bounty.reward}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{bounty.difficulty}</span>
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-4 group-hover:text-gray-300 transition-colors">
                                    {bounty.topic}
                                </h3>
                                <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                                    Solve critical problems in this domain to earn credits and boost your learning profile.
                                </p>
                                <div className="flex items-center justify-between mt-auto pt-6 border-t border-gray-800">
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Clock size={14} />
                                        <span>Expires in 14h</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-gray-300 font-semibold">
                                        <Sparkles size={14} />
                                        <span>+50 XP</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div className="mt-16 text-center">
                    <Button
                        variant="monochrome-outline"
                        size="lg"
                        onClick={onLoginClick}
                        className="group bg-white text-black border-none hover:bg-gray-200 shadow-lg shadow-black/20"
                    >
                        View Marketplace <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                </div>
            </div>
        </section>
    );
};

export default IntelBounties;

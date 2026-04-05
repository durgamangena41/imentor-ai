import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Lock, Unlock, CheckCircle2, ChevronRight, Share2, Award } from 'lucide-react';
import Button from '../core/Button';

const GrowthRoadmap = ({ onLoginClick }) => {
    return (
        <section id="roadmap" className="py-24 bg-black overflow-hidden border-t border-gray-900">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col lg:flex-row items-center gap-16">
                    {/* Left: Content */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8 }}
                        viewport={{ once: true }}
                        className="w-full lg:w-1/2 order-2 lg:order-1"
                    >
                        <span className="inline-block px-4 py-2 rounded-full bg-gray-900 text-gray-300 text-sm font-bold tracking-wider uppercase mb-6 border border-gray-700">
                            The Learning Path
                        </span>
                        <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-8 leading-tight">
                            Your Personalized <span className="text-white underline decoration-gray-700">Growth Roadmap</span>
                        </h2>
                        <p className="text-lg text-gray-400 mb-8 leading-relaxed">
                            Visualize your progress with an interactive, node-based skill tree. Every document you read and every assessment you complete unlocks new territories in your personalized curriculum map.
                        </p>

                        <div className="space-y-6 mb-10">
                            {[
                                { title: "Foundational Domains", desc: "Unlock entry-level concepts through baseline assessments.", icon: Unlock, color: "text-white", bg: "bg-gray-800" },
                                { title: "Specialization Nodes", desc: "Deep dive into niche topics validated by AI evaluators.", icon: Award, color: "text-gray-300", bg: "bg-gray-800/50" },
                                { title: "Full Mastery Tracking", desc: "Track your competence across entire industries.", icon: CheckCircle2, color: "text-white", bg: "bg-gray-800" }
                            ].map((item, idx) => (
                                <div key={idx} className="flex gap-5">
                                    <div className={`p-3 h-fit rounded-xl ${item.bg} ${item.color} border border-gray-700`}>
                                        <item.icon size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold text-white mb-1">{item.title}</h4>
                                        <p className="text-sm text-gray-400">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-4">
                            <Button
                                variant="monochrome-outline"
                                size="lg"
                                onClick={onLoginClick}
                                className="bg-white text-black border-none hover:bg-gray-200 shadow-lg shadow-black/20"
                            >
                                Explore the Map
                            </Button>
                            <Button
                                variant="monochrome-outline"
                                size="lg"
                                className="text-white border-gray-700 hover:bg-white/10"
                            >
                                <Share2 size={20} className="mr-2" /> Show Examples
                            </Button>
                        </div>
                    </motion.div>

                    {/* Right: Visual */}
                    <motion.div
                        initial={{ opacity: 0, x: 50, rotate: 5 }}
                        whileInView={{ opacity: 1, x: 0, rotate: 0 }}
                        transition={{ duration: 1 }}
                        viewport={{ once: true }}
                        className="w-full lg:w-1/2 order-1 lg:order-2"
                    >
                        <div className="relative">
                            {/* Skill Tree Visual Mockup */}
                            <div className="bg-gray-900 p-4 pt-12 rounded-3xl shadow-2xl border-4 border-gray-800 relative">
                                {/* Map Controls Mockup */}
                                <div className="absolute top-4 left-6 flex gap-2">
                                    <div className="w-3 h-3 rounded-full bg-gray-700"></div>
                                    <div className="w-3 h-3 rounded-full bg-gray-600"></div>
                                    <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                                </div>
                                <div className="absolute top-4 right-6 flex items-center gap-3 text-gray-400 text-[10px] font-mono">
                                    <MapPin size={12} />
                                    <span>LAT: 42.102 / LNG: -12.449</span>
                                </div>

                                <div className="grid grid-cols-5 grid-rows-4 gap-4 p-8 min-h-[400px]">
                                    {/* Procedurally generate some nodes */}
                                    {[
                                        { pos: "col-start-3 row-start-1", status: "mastered", color: "bg-white", label: "Intro to AI" },
                                        { pos: "col-start-2 row-start-2", status: "mastered", color: "bg-gray-400", label: "Python Basics" },
                                        { pos: "col-start-4 row-start-2", status: "unlocked", color: "bg-gray-500", label: "Stats 101" },
                                        { pos: "col-start-1 row-start-3", status: "locked", color: "bg-gray-800/80", label: "ML Ops" },
                                        { pos: "col-start-3 row-start-3", status: "unlocked", color: "bg-gray-300", label: "Neural Nets" },
                                        { pos: "col-start-5 row-start-3", status: "locked", color: "bg-gray-800/80", label: "RAG Arch" },
                                        { pos: "col-start-3 row-start-4", status: "locked", color: "bg-gray-800/80", label: "Transformers" },
                                    ].map((node, i) => (
                                        <div key={i} className={`flex flex-col items-center gap-1 ${node.pos}`}>
                                            <motion.div
                                                whileHover={{ scale: 1.2 }}
                                                className={`w-12 h-12 rounded-full ${node.color} flex items-center justify-center shadow-lg border-4 border-gray-900 relative`}
                                            >
                                                {node.status === "mastered" && <CheckCircle2 size={24} className="text-black" />}
                                                {node.status === "unlocked" && <Unlock size={20} className="text-black" />}
                                                {node.status === "locked" && <Lock size={20} className="text-gray-400" />}

                                                {/* Connection pulses */}
                                                {node.status === "unlocked" && (
                                                    <div className="absolute inset-0 rounded-full animate-ping bg-white/40"></div>
                                                )}
                                            </motion.div>
                                            <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">{node.label}</span>
                                        </div>
                                    ))}

                                    {/* Mock SVG Connections */}
                                    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" preserveAspectRatio="none">
                                        <line x1="50%" y1="15%" x2="30%" y2="35%" stroke="white" strokeWidth="2" strokeDasharray="4" />
                                        <line x1="50%" y1="15%" x2="70%" y2="35%" stroke="white" strokeWidth="2" strokeDasharray="4" />
                                        <line x1="30%" y1="35%" x2="50%" y2="65%" stroke="white" strokeWidth="2" />
                                        <line x1="70%" y1="35%" x2="50%" y2="65%" stroke="white" strokeWidth="2" />
                                    </svg>
                                </div>
                            </div>

                            {/* Floating Stats */}
                            <motion.div
                                animate={{ y: [0, -10, 0] }}
                                transition={{ duration: 3, repeat: Infinity }}
                                className="absolute -bottom-6 -right-6 md:right-12 bg-gray-900 p-4 rounded-2xl shadow-2xl border border-gray-800"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gray-800 rounded-lg text-white border border-gray-700">
                                        <Award size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">Active Mastery</p>
                                        <p className="text-lg font-black text-white">84.2%</p>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default GrowthRoadmap;

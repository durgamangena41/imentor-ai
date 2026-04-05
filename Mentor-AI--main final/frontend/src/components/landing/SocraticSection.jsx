import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Lightbulb, ArrowRight } from 'lucide-react';
import Button from '../core/Button';

const SocraticSection = ({ onLoginClick }) => {
    return (
        <section className="py-24 bg-black overflow-hidden border-t border-gray-900">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col lg:flex-row items-center gap-16">

                    {/* Left Content */}
                    <motion.div
                        className="lg:w-1/2 space-y-8"
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8 }}
                        viewport={{ once: true }}
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-900 text-gray-300 text-sm font-semibold border border-gray-700">
                            <Lightbulb size={16} />
                            <span>New Feature</span>
                        </div>

                        <h2 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight">
                            Don't just get answers.<br />
                            <span className="text-white">
                                Learn how to think.
                            </span>
                        </h2>

                        <p className="text-xl text-gray-300 leading-relaxed">
                            Meet our <strong className="text-white">Socratic Tutor</strong>. Instead of spoon-feeding you answers, it guides you with thoughtful questions, helping you build deep intuition and mastery over complex topics.
                        </p>

                        <div className="space-y-4">
                            {[
                                "Adapts to your current understanding level",
                                "Identifies and corrects misconceptions instantly",
                                "Builds long-term retention through active recall"
                            ].map((item, i) => (
                                <motion.div
                                    key={i}
                                    className="flex items-center gap-3"
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 + (i * 0.1) }}
                                    viewport={{ once: true }}
                                >
                                    <div className="h-6 w-6 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold text-xs border border-gray-700">
                                        ✓
                                    </div>
                                    <span className="text-gray-300">{item}</span>
                                </motion.div>
                            ))}
                        </div>

                        <div className="pt-4">
                            <Button
                                size="lg"
                                variant="monochrome-outline"
                                onClick={() => onLoginClick(false)}
                                className="bg-white text-black hover:bg-gray-200 border-none shadow-lg shadow-black/20"
                                rightIcon={<ArrowRight size={18} />}
                            >
                                Try Socratic Mode
                            </Button>
                        </div>
                    </motion.div>

                    {/* Right Visual (Mock Chat) */}
                    <motion.div
                        className="lg:w-1/2 w-full relative"
                        initial={{ opacity: 0, x: 50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8 }}
                        viewport={{ once: true }}
                    >
                        <div className="absolute -inset-4 bg-white rounded-2xl blur-3xl opacity-5"></div>
                        <div className="relative bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl p-6 space-y-6 max-w-md mx-auto">

                            {/* Header */}
                            <div className="flex items-center gap-3 border-b border-gray-800 pb-4">
                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black">
                                    <MessageCircle size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">iMentor</h3>
                                    <p className="text-xs text-gray-400 font-medium">Socratic Mode Active</p>
                                </div>
                            </div>

                            {/* Chat Bubbles */}
                            <div className="space-y-4 text-sm">
                                <motion.div
                                    className="bg-gray-800 p-4 rounded-2xl rounded-tl-none shadow-sm text-gray-200 max-w-[90%] border border-gray-700"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.4 }}
                                    viewport={{ once: true }}
                                >
                                    <p>Can you explain how a Neural Network learns?</p>
                                </motion.div>

                                <motion.div
                                    className="bg-white p-4 rounded-2xl rounded-tr-none shadow-sm text-black ml-auto max-w-[90%]"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 1.2 }}
                                    viewport={{ once: true }}
                                >
                                    <p>I could give you a definition, but let's try an analogy first.</p>
                                    <p className="mt-2 text-gray-800">Imagine you're teaching a child to recognize a 'dog'. Do you show them many pictures?</p>
                                </motion.div>

                                <motion.div
                                    className="bg-gray-800 p-4 rounded-2xl rounded-tl-none shadow-sm text-gray-200 max-w-[90%] border border-gray-700"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 2.5 }}
                                    viewport={{ once: true }}
                                >
                                    <p>I'd show them pictures. They'd learn the pattern eventually.</p>
                                </motion.div>

                                <motion.div
                                    className="bg-white p-4 rounded-2xl rounded-tr-none shadow-sm text-black ml-auto max-w-[90%]"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 3.5 }}
                                    viewport={{ once: true }}
                                >
                                    <p>Exactly! 🎯 That's the essence of Machine Learning. It's about learning patterns from data, not rules.</p>
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>

                </div>
            </div>
        </section>
    );
};

export default SocraticSection;

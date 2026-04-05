// frontend/src/components/landing/HeroSection.jsx
import React from 'react';
import Button from '../core/Button';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const HeroSection = ({ onLoginClick }) => {
    return (
        <section id="home" className="relative h-screen flex items-center justify-center overflow-hidden pt-16 bg-black">

            {/* Subtle Gray Background Pattern */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.03, 0.05, 0.03]
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full bg-gray-400 blur-[120px]"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.02, 0.04, 0.02]
                    }}
                    transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-gray-600 blur-[120px]"
                />
            </div>

            {/* Grid Pattern Overlay */}
            <div className="absolute inset-0 z-0 bg-grid-white/[0.03] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"></div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-900 border border-gray-700 text-sm font-medium text-gray-300 mb-8"
                    >
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-300"></span>
                        </span>
                        v2.0 Now Available with Tutor Mode
                    </motion.div>

                    <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white mb-6 drop-shadow-sm">
                        Your AI Mentor for <br />
                        <span className="text-white">
                            Limitless Learning
                        </span>
                    </h1>

                    <p className="mt-6 max-w-2xl mx-auto text-xl lg:text-2xl text-gray-300 leading-relaxed">
                        Master any subject with <strong className="text-white">Socratic questioning</strong>, visualize concepts with <strong className="text-white">Knowledge Graphs</strong>, and stay motivated with <strong className="text-white">Gamified goals</strong>.
                    </p>

                    <div className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-4">
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Button
                                size="lg"
                                variant="monochrome-outline"
                                onClick={() => onLoginClick(false)}
                                className="shadow-lg shadow-black/20 text-lg px-8 py-4 h-auto bg-white text-black hover:bg-gray-200 border-none"
                                rightIcon={<ArrowRight size={20} />}
                            >
                                Start Learning Now
                            </Button>
                        </motion.div>
                        <motion.a
                            href="#tutor"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="inline-flex items-center justify-center rounded-lg border-2 border-white px-8 py-4 text-lg font-medium text-white hover:bg-white/10 transition-colors h-auto"
                        >
                            See How It Works
                        </motion.a>
                    </div>
                </motion.div>
            </div>

            {/* Scroll Indicator */}
            <motion.div
                className="absolute bottom-10 left-1/2 -translate-x-1/2 text-gray-500"
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
            >
                <div className="w-6 h-10 border-2 border-current rounded-full flex justify-center p-1">
                    <div className="w-1 h-3 bg-current rounded-full" />
                </div>
            </motion.div>
        </section>
    );
};

export default HeroSection;
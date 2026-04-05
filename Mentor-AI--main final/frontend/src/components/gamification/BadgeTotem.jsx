// frontend/src/components/gamification/BadgeTotem.jsx
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const BadgeTotem = ({ badge, onComplete }) => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (badge) {
            setShow(true);
            const timer = setTimeout(() => {
                setShow(false);
                setTimeout(onComplete, 500);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [badge, onComplete]);

    if (!badge) return null;

    return (
        <AnimatePresence>
            {show && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
                    {/* Monochromatic Overlay Flash - Zinc Refined */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.4, 0] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6 }}
                        className="absolute inset-0 bg-white/20 dark:bg-black/60"
                    />

                    {/* Main Totem Content */}
                    <motion.div
                        initial={{ scale: 0.2, y: 100, opacity: 0 }}
                        animate={{
                            scale: 1,
                            y: 0,
                            opacity: 1,
                            rotate: [0, -2, 2, 0]
                        }}
                        exit={{
                            scale: 1.5,
                            opacity: 0,
                            filter: "blur(40px)"
                        }}
                        transition={{
                            duration: 1,
                            scale: { type: "spring", stiffness: 300, damping: 25 },
                            y: { type: "spring", stiffness: 300, damping: 25 }
                        }}
                        className="relative flex flex-col items-center"
                    >
                        {/* Core Resonance Pulse */}
                        <motion.div
                            animate={{
                                scale: [1, 1.4, 1],
                                opacity: [0.2, 0.5, 0.2],
                            }}
                            transition={{
                                duration: 3,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            className="absolute inset-0 bg-black dark:bg-white blur-[60px] rounded-full -z-10"
                        />

                        {/* Icon Container - Refined Contrast */}
                        <div className="text-[10rem] mb-12 filter drop-shadow-[0_0_50px_rgba(255,255,255,0.4)] relative">
                            <div className="grayscale brightness-150">{badge.icon || '🏅'}</div>
                        </div>

                        {/* Badge Info Card - Zinc Refined */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="bg-zinc-950/90 backdrop-blur-3xl px-16 py-10 rounded-[3.5rem] border border-white/10 text-center shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>

                            <div className="flex items-center justify-center gap-4 mb-6">
                                <Sparkles className="text-white opacity-40 animate-pulse" size={20} />
                                <span className="text-white font-black tracking-[0.5em] uppercase text-[9px] opacity-60">
                                    Vector Synchronized
                                </span>
                                <Sparkles className="text-white opacity-40 animate-pulse" size={20} />
                            </div>

                            <h2 className="text-5xl font-black text-white uppercase tracking-tighter mb-4 leading-none">
                                {badge.name}
                            </h2>
                            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest max-w-xs mx-auto leading-relaxed border-t border-white/5 pt-6">
                                {badge.description}
                            </p>
                        </motion.div>

                        {/* High-Precision Particle Field */}
                        <div className="absolute inset-0 flex items-center justify-center overflow-visible pointer-events-none">
                            {[...Array(24)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, scale: 0 }}
                                    animate={{
                                        opacity: [0, 0.8, 0],
                                        scale: [0, 1.2, 0],
                                        x: (Math.random() - 0.5) * 600,
                                        y: (Math.random() - 0.5) * 600,
                                    }}
                                    transition={{
                                        duration: 2.5,
                                        delay: i * 0.1,
                                        repeat: Infinity,
                                        repeatDelay: 0.5
                                    }}
                                    className="absolute w-1.5 h-1.5 bg-white/40 dark:bg-white/60 transform rotate-45 shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                                />
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default BadgeTotem;

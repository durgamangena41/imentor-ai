import React from 'react';
import Button from '../core/Button';
import { motion } from 'framer-motion';

const CtaSection = ({ onLoginClick }) => {
    return (
        <section className="py-20 lg:py-28 bg-black border-t border-gray-900">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.6 }}
                    className="bg-gray-900 p-8 sm:p-12 rounded-2xl text-center border border-gray-800 shadow-2xl"
                >
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
                        Ready to Transform Your Learning?
                    </h2>
                    <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-400">
                        Join thousands of students and educators leveraging AI to achieve academic success. Create your free account today.
                    </p>
                    <div className="mt-8">
                        <Button
                            size="lg"
                            variant="monochrome-outline"
                            onClick={() => onLoginClick(false)}
                            className="bg-white text-black border-none hover:bg-gray-200 shadow-lg shadow-black/20"
                        >
                            Sign Up and Get Started
                        </Button>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};

export default CtaSection;
// frontend/src/components/landing/AudienceSection.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

const studentsBenefits = [
    "Personalized 24/7 AI tutor for any subject.",
    "Generate quizzes from lecture notes for exam prep.",
    "Practice coding with AI-powered feedback.",
    "Turn dense papers into easy-to-understand podcasts.",
];

const educatorsBenefits = [
    "Provide curated 'Subject' materials for your class.",
    "Monitor student engagement through chat summaries.",
    "Analyze common questions and content gaps.",
    "Promote academic integrity with built-in tools.",
];

const AudienceCard = ({ title, benefits }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5 }}
        className="bg-gray-900 border border-gray-800 shadow-sm rounded-2xl p-8 h-full transition-all hover:shadow-2xl"
    >
        <h3 className="text-2xl font-bold mb-6 text-white">{title}</h3>
        <ul className="space-y-4">
            {benefits.map((benefit, i) => (
                <li key={i} className="flex items-start gap-3">
                    <Check className="flex-shrink-0 w-5 h-5 mt-1 text-white" />
                    <span className="text-gray-400">{benefit}</span>
                </li>
            ))}
        </ul>
    </motion.div>
);

const AudienceSection = () => {
    return (
        <section id="for-whom" className="py-20 lg:py-28 bg-black border-t border-gray-900">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto">
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Built for the Academic Community</h2>
                    <p className="mt-4 text-lg text-gray-400">
                        Whether you're a student striving for excellence or an educator fostering it, iMentor has tools for you.
                    </p>
                </div>
                <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <AudienceCard title="For Students" benefits={studentsBenefits} />
                    <AudienceCard title="For Educators" benefits={educatorsBenefits} />
                </div>
            </div>
        </section>
    );
};

export default AudienceSection;
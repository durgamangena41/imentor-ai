// frontend/src/components/landing/FeaturesSection.jsx
import React from 'react';
import { motion } from 'framer-motion';
import {
    GraduationCap, BookOpen, BrainCircuit, Code, FileQuestion, Headphones
} from 'lucide-react';

const features = [
    {
        icon: GraduationCap,
        title: "Personalized Study Plans",
        description: "Describe your learning goals and get a custom, step-by-step curriculum with actionable modules designed to address your knowledge gaps.",
    },
    {
        icon: BookOpen,
        title: "Advanced Research Assistant",
        description: "Engage with academic papers, search the web for real-time information, and chat with your own documents and URLs as your primary knowledge base.",
    },
    {
        icon: BrainCircuit,
        title: "Deep Analysis & Visualization",
        description: "Automatically generate FAQs, key topic summaries, and mind maps from any document. Visualize concepts as interactive knowledge graphs.",
    },
    {
        icon: Code,
        title: "Secure Code Executor",
        description: "Write, run, and test code in multiple languages within a secure sandbox. Get AI-powered feedback, error explanations, and test case generation.",
    },
    {
        icon: FileQuestion,
        title: "AI-Powered Quiz Generator",
        description: "Upload any document (PDF, DOCX) and instantly generate a multiple-choice quiz to test your comprehension and prepare for exams.",
    },
    {
        icon: Headphones,
        title: "Content Creation Tools",
        description: "Transform your study materials into engaging content. Generate high-quality audio podcasts or export detailed analysis into DOCX and PPTX formats.",
    }
];

const FeatureCard = ({ icon: Icon, title, description, index }) => (
    <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        whileHover={{ y: -10 }}
        className="relative group p-8 rounded-2xl bg-gray-900 border border-gray-800 shadow-lg hover:shadow-2xl transition-all duration-300"
    >
        {/* Hover Border Effect */}
        <div className="absolute inset-0 rounded-2xl bg-white opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none"></div>

        <div className="relative z-10">
            <div className="inline-flex items-center justify-center p-4 bg-gray-800 rounded-xl mb-6 text-white group-hover:scale-110 transition-transform duration-300 border border-gray-700">
                <Icon className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-white group-hover:text-white transition-colors">{title}</h3>
            <p className="text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">{description}</p>
        </div>
    </motion.div>
);

const FeaturesSection = () => {
    return (
        <section id="features" className="py-24 bg-black relative border-t border-gray-900">
            {/* Subtle background glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="text-center max-w-3xl mx-auto">
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-white">A Smarter Way to Learn</h2>
                    <p className="mt-4 text-lg text-gray-400">
                        iMentor is more than a chatbot. It's an all-in-one platform with specialized tools built for the demands of higher education and technical fields.
                    </p>
                </div>
                <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {features.map((feature, index) => (
                        <FeatureCard key={feature.title} index={index} {...feature} />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FeaturesSection;
// frontend/src/components/landing/Footer.jsx
import React from 'react';
import { Server, Twitter, Github, Linkedin } from 'lucide-react';

const Footer = () => {
    return (
        <footer className="bg-black border-t border-gray-900">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2 text-xl font-bold text-white">
                        <Server className="text-white" />
                        <span>iMentor</span>
                    </div>
                    <p className="text-sm text-gray-400">
                        © {new Date().getFullYear()} iMentor. All Rights Reserved.
                    </p>
                    <div className="flex items-center space-x-4">
                        <a href="#" className="text-gray-400 hover:text-white transition-colors"><Twitter size={20} /></a>
                        <a href="#" className="text-gray-400 hover:text-white transition-colors"><Github size={20} /></a>
                        <a href="#" className="text-gray-400 hover:text-white transition-colors"><Linkedin size={20} /></a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
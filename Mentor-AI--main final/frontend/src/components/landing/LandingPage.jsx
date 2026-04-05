// frontend/src/components/landing/LandingPage.jsx
import React from 'react';
import LandingNav from './LandingNav';
import HeroSection from './HeroSection';
import FeaturesSection from './FeaturesSection';
import SocraticSection from './SocraticSection';
import MasteryChallenges from './MasteryChallenges';
import IntelBounties from './IntelBounties';
import GrowthRoadmap from './GrowthRoadmap';
import GamificationSection from './GamificationSection';
import HowItWorksSection from './HowItWorksSection';
import AudienceSection from './AudienceSection';
import CtaSection from './CtaSection';
import Footer from './Footer';


// The LandingPage component receives a function to open the AuthModal
// This keeps the modal state managed by the main App.jsx component.
const LandingPage = ({ onLoginClick }) => {
    return (
        <div className="bg-black text-white font-sans custom-scrollbar overflow-y-auto h-screen scroll-smooth">
            <LandingNav onLoginClick={onLoginClick} />
            <main>
                <HeroSection onLoginClick={onLoginClick} />
                <div id="tutor">
                    <SocraticSection onLoginClick={onLoginClick} />
                </div>
                <div id="challenges">
                    <MasteryChallenges onLoginClick={onLoginClick} />
                </div>
                <div id="bounties">
                    <IntelBounties onLoginClick={onLoginClick} />
                </div>
                <div id="roadmap">
                    <GrowthRoadmap onLoginClick={onLoginClick} />
                </div>
                <div id="features">
                    <FeaturesSection />
                </div>

                <GamificationSection />

                <HowItWorksSection />
                <AudienceSection />
                <CtaSection onLoginClick={onLoginClick} />
            </main>
            <Footer />
        </div>
    );
};

export default LandingPage;
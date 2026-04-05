// frontend/src/components/gamification/RankBadge.jsx
import React from 'react';
import { Trophy, Award, Crown, Star, Gem, Sparkles } from 'lucide-react';

/**
 * Rank Badge Component
 * Displays rank tier based on user level (Bronze, Silver, Gold, etc.)
 */
function RankBadge({ level, size = 'md', showLabel = true, onClick }) {
    const sizeClasses = {
        xs: 'w-5 h-5 text-[10px]',
        sm: 'w-6 h-6 text-xs',
        md: 'w-8 h-8 text-sm',
        lg: 'w-10 h-10 text-base',
        xl: 'w-12 h-12 text-lg'
    };

    const iconSizes = {
        xs: 10,
        sm: 12,
        md: 16,
        lg: 20,
        xl: 24
    };

    // Get rank tier based on level
    const getRankTier = (lvl) => {
        if (lvl >= 50) return { name: 'Legendary', color: 'from-pink-500 via-purple-500 to-indigo-500', icon: Sparkles, glow: true };
        if (lvl >= 30) return { name: 'Master', color: 'from-red-500 to-pink-500', icon: Crown, glow: true };
        if (lvl >= 20) return { name: 'Diamond', color: 'from-cyan-400 to-blue-500', icon: Gem, glow: false };
        if (lvl >= 15) return { name: 'Platinum', color: 'from-slate-300 to-slate-500', icon: Star, glow: false };
        if (lvl >= 10) return { name: 'Gold', color: 'from-yellow-400 to-yellow-600', icon: Trophy, glow: false };
        if (lvl >= 5) return { name: 'Silver', color: 'from-gray-300 to-gray-500', icon: Award, glow: false };
        return { name: 'Bronze', color: 'from-orange-600 to-orange-800', icon: Award, glow: false };
    };

    if (!level && level !== 0) {
        return null;
    }

    const tier = getRankTier(level);
    const Icon = tier.icon;

    return (
        <div className="flex items-center gap-2">
            {/* Rank Badge Icon */}
            <div
                onClick={onClick}
                className={`
          ${sizeClasses[size]}
          rounded-full
          bg-gradient-to-br ${tier.color}
          flex items-center justify-center
          border-2 border-white dark:border-gray-800
          shadow-lg
          relative
          group
          cursor-pointer
          hover:scale-110 transition-transform
          ${tier.glow ? 'animate-pulse' : ''}
        `}
                title={`${tier.name} Rank (Level ${level}) - Click for details`}
            >
                <Icon size={iconSizes[size]} className="text-white" />

                {/* Glow effect for high ranks */}
                {tier.glow && (
                    <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${tier.color} opacity-50 blur-sm -z-10`}></div>
                )}

                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                    <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 shadow-lg">
                        {tier.name} Rank
                        <div className="text-[10px] text-gray-400">Level {level}</div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                </div>
            </div>

            {/* Rank Label (optional) */}
            {showLabel && (
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{tier.name}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Level {level}</span>
                </div>
            )}
        </div>
    );
}

export default RankBadge;

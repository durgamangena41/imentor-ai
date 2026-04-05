// frontend/src/components/gamification/LevelBadge.jsx
import React from 'react';
import { Trophy } from 'lucide-react';

/**
 * Level Badge Component
 * Displays user's gamification level as a badge
 * Can be used anywhere a user icon/avatar is shown
 */
function LevelBadge({ level, size = 'sm', showIcon = true }) {
    const sizeClasses = {
        xs: 'w-5 h-5 text-[10px]',
        sm: 'w-6 h-6 text-xs',
        md: 'w-8 h-8 text-sm',
        lg: 'w-10 h-10 text-base',
        xl: 'w-12 h-12 text-lg'
    };

    const iconSizes = {
        xs: 8,
        sm: 10,
        md: 12,
        lg: 14,
        xl: 16
    };

    // Color based on level tier
    const getLevelColor = (lvl) => {
        if (lvl >= 20) return 'from-purple-500 to-pink-500'; // Master
        if (lvl >= 15) return 'from-yellow-500 to-orange-500'; // Expert
        if (lvl >= 10) return 'from-blue-500 to-cyan-500'; // Advanced
        if (lvl >= 5) return 'from-green-500 to-emerald-500'; // Intermediate
        return 'from-gray-500 to-gray-600'; // Beginner
    };

    if (!level && level !== 0) {
        return null; // Don't render if no level data
    }

    return (
        <div
            className={`
        ${sizeClasses[size]}
        rounded-full
        bg-gradient-to-br ${getLevelColor(level)}
        flex items-center justify-center
        font-bold text-white
        shadow-lg
        border-2 border-white dark:border-gray-800
        relative
        group
        cursor-help
      `}
            title={`Level ${level}`}
        >
            {showIcon && level >= 10 ? (
                <Trophy size={iconSizes[size]} className="text-yellow-300" />
            ) : (
                <span>{level}</span>
            )}

            {/* Tooltip on hover */}
            <div className="absolute bottom-full mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 shadow-lg">
                    Level {level}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-gray-900"></div>
                </div>
            </div>
        </div>
    );
}

export default LevelBadge;

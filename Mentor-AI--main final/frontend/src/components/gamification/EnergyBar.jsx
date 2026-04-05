import React, { useState, useEffect } from 'react';
import { Battery, BatteryCharging, BatteryWarning, AlertCircle } from 'lucide-react';
import axios from 'axios';

const EnergyBar = () => {
    const [energy, setEnergy] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEnergy();
        const interval = setInterval(fetchEnergy, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, []);

    const fetchEnergy = async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${import.meta.env.VITE_API_BASE_URL}/gamification/energy`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setEnergy(response.data);
            setLoading(false);
        } catch (error) {
            console.error('[EnergyBar] Error:', error);
            setLoading(false);
        }
    };

    if (loading || !energy) return null;

    const percentage = energy.currentEnergy;
    const isLow = percentage < 30;
    const isCritical = percentage < 10;
    const onBreak = energy.isOnForcedBreak;

    // Color based on energy level
    const getColor = () => {
        if (isCritical) return 'text-red-500';
        if (isLow) return 'text-orange-500';
        return 'text-green-500';
    };

    const getBarColor = () => {
        if (isCritical) return 'bg-red-500';
        if (isLow) return 'bg-orange-500';
        return 'bg-green-500';
    };

    const getIcon = () => {
        if (onBreak) return <BatteryCharging className={getColor()} size={18} />;
        if (isCritical) return <BatteryWarning className={getColor()} size={18} />;
        return <Battery className={getColor()} size={18} />;
    };

    return (
        <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {/* Icon */}
            <div className="flex-shrink-0">
                {getIcon()}
            </div>

            {/* Energy Bar */}
            <div className="flex-1 min-w-[120px]">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Energy</span>
                    <span className={`text-xs font-bold ${getColor()}`}>{percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                        className={`h-full ${getBarColor()} transition-all duration-500 ease-out`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>

            {/* Warning Message */}
            {onBreak && (
                <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                    <AlertCircle size={14} />
                    <span>Break</span>
                </div>
            )}
        </div>
    );
};

export default EnergyBar;

// frontend/src/hooks/useUserLevel.jsx
import { useState, useEffect } from 'react';
import api from '../services/api';

/**
 * Hook to fetch and cache user's gamification level
 * @param {string} userId - Optional user ID (defaults to current user)
 * @returns {object} { level, loading, error }
 */
export function useUserLevel(userId = null) {
    const [level, setLevel] = useState(null);
    const [xp, setXp] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;

        const fetchLevel = async () => {
            try {
                setLoading(true);

                // Fetch using centralized API service
                const scoreData = await api.getUserScore().catch(() => null);

                if (scoreData && isMounted) {
                    const newLevel = scoreData.level || 1;
                    const newXp = scoreData.totalXP || 0;
                    setLevel(newLevel);
                    setXp(newXp);
                    setError(null);
                }
            } catch (err) {
                if (process.env.NODE_ENV === 'development') {
                    console.error('[useUserLevel] Error fetching level:', err);
                }
                if (isMounted) {
                    setError(err.message);
                    setLevel(1); // Default to level 1 if error
                    setXp(0);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        // Fetch immediately
        fetchLevel();

        // Refresh every 30 seconds to avoid frequent re-renders
        const intervalId = setInterval(fetchLevel, 30000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [userId]);

    return { level, xp, loading, error };
}

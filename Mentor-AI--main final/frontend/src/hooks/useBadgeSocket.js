// frontend/src/hooks/useBadgeSocket.js
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './useAuth';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5001';

export const useBadgeSocket = () => {
    const { user } = useAuth();
    const [newBadge, setNewBadge] = useState(null);

    useEffect(() => {
        if (!user || !user.id) return;

        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5
        });

        socket.on('connect', () => {
            console.log('[Socket] Connected to server at:', SOCKET_URL);
            console.log('[Socket] Joining room for user ID:', user.id);
            socket.emit('join', user.id);
        });

        socket.on('joined', (data) => {
            console.log('[Socket] Successfully joined room:', data.room);
        });

        socket.on('badge_earned', (badge) => {
            console.log('[Socket] 🏆 Badge earned!', badge);
            setNewBadge(badge);
        });

        socket.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err.message);
        });

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected from server:', reason);
        });

        return () => {
            socket.disconnect();
        };
    }, [user]);

    const clearBadge = () => setNewBadge(null);

    return { newBadge, clearBadge };
};

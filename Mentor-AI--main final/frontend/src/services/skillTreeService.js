// frontend/src/services/skillTreeService.js
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const skillTreeService = {
    /**
     * Get user's complete skill tree for visualization
     */
    getSkillTree: async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${API_BASE_URL}/gamification/skill-tree`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data.skillTree || [];
        } catch (error) {
            console.error('[SkillTreeService] Error fetching skill tree:', error);
            throw error;
        }
    },

    /**
     * Get skill tree map with connections (for advanced visualization)
     */
    getSkillTreeMap: async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${API_BASE_URL}/gamification/skill-tree-map`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        } catch (error) {
            console.error('[SkillTreeService] Error fetching skill tree map:', error);
            throw error;
        }
    },

    /**
     * Get detailed information about a specific skill
     */
    getSkillDetails: async (skillId) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${API_BASE_URL}/gamification/skill/${skillId}/details`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data.skill;
        } catch (error) {
            console.error('[SkillTreeService] Error fetching skill details:', error);
            throw error;
        }
    },

    /**
     * Get the unlock path for a locked skill (what needs to be done to unlock it)
     */
    getUnlockPath: async (skillId) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${API_BASE_URL}/gamification/skill/${skillId}/unlock-path`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        } catch (error) {
            console.error('[SkillTreeService] Error fetching unlock path:', error);
            throw error;
        }
    },

    /**
     * Get assessment questions for a skill
     */
    getSkillAssessment: async (skillId) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${API_BASE_URL}/gamification/skill/${skillId}/assessment`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data.questions || [];
        } catch (error) {
            console.error('[SkillTreeService] Error fetching assessment:', error);
            throw error;
        }
    },

    /**
     * Submit assessment answers for a skill
     */
    submitAssessment: async (skillId, answers) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.post(
                `${API_BASE_URL}/gamification/skill/${skillId}/assessment`,
                { answers },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        } catch (error) {
            console.error('[SkillTreeService] Error submitting assessment:', error);
            throw error;
        }
    },

    /**
     * Record a checkpoint achievement for a skill
     */
    recordCheckpoint: async (skillId, checkpointType, data = {}) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.post(
                `${API_BASE_URL}/gamification/skill/${skillId}/checkpoint`,
                { checkpointType, data },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        } catch (error) {
            console.error('[SkillTreeService] Error recording checkpoint:', error);
            throw error;
        }
    },

    /**
     * Get skill tree statistics
     */
    getSkillTreeStats: async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${API_BASE_URL}/gamification/profile`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data.skillTree || {};
        } catch (error) {
            console.error('[SkillTreeService] Error fetching stats:', error);
            throw error;
        }
    }
,

    // ----- Skill Tree Game persistence -----
    createGame: async (gameData) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.post(
                `${API_BASE_URL}/gamification/skill-tree/games`,
                gameData,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data.game;
        } catch (error) {
            console.error('[SkillTreeService] Error creating game:', error);
            throw error;
        }
    },

    getGames: async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(
                `${API_BASE_URL}/gamification/skill-tree/games`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data.games || [];
        } catch (error) {
            console.error('[SkillTreeService] Error fetching games:', error);
            throw error;
        }
    },

    updateLevelProgress: async (gameId, levelId, update) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.put(
                `${API_BASE_URL}/gamification/skill-tree/games/${gameId}/level/${levelId}`,
                update,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data.game;
        } catch (error) {
            console.error('[SkillTreeService] Error updating level progress:', error);
            throw error;
        }
    },

    saveGameState: async (gameId, payload) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.post(
                `${API_BASE_URL}/gamification/skill-tree/games/${gameId}/save`,
                payload,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data.game;
        } catch (error) {
            console.error('[SkillTreeService] Error saving game state:', error);
            throw error;
        }
    },

    deleteGame: async (gameId) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.delete(
                `${API_BASE_URL}/gamification/skill-tree/games/${gameId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        } catch (error) {
            console.error('[SkillTreeService] Error deleting game:', error);
            throw error;
        }
    }
};

export default skillTreeService;

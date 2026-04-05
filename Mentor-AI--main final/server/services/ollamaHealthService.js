// server/services/ollamaHealthService.js
const axios = require('axios');
const { logger } = require('../utils/logger');

// Cache the health status to avoid spamming the Ollama server on every request
let isOllamaHealthy = null;
let lastCheck = 0;
const CACHE_DURATION = 60000; // 1 minute

/**
 * Checks if the Ollama service is available and healthy.
 * @param {string} ollamaUrl - The base URL of the Ollama service.
 * @returns {Promise<boolean>} True if Ollama is healthy, false otherwise.
 */
async function checkOllamaHealth(ollamaUrl) {
    const now = Date.now();
    if (isOllamaHealthy !== null && (now - lastCheck < CACHE_DURATION)) {
        return isOllamaHealthy;
    }

    if (!ollamaUrl) {
        logger.warn('[OllamaHealthCheck] No Ollama URL provided; cannot check health. Assuming unhealthy.');
        isOllamaHealthy = false;
        lastCheck = now;
        return false;
    }

    try {
        // The root endpoint of Ollama returns "Ollama is running"
        const response = await axios.get(ollamaUrl, { timeout: 1500 });
        if (response.status === 200 && response.data.includes('Ollama is running')) {
            logger.info(`[OllamaHealthCheck] Ollama service at ${ollamaUrl} is healthy.`);
            isOllamaHealthy = true;
        } else {
            throw new Error(`Unexpected response: ${response.status}`);
        }
    } catch (error) {
        logger.warn(`[OllamaHealthCheck] Ollama service at ${ollamaUrl} is unreachable or unhealthy. Error: ${error.message}`);
        isOllamaHealthy = false;
    }
    
    lastCheck = now;
    return isOllamaHealthy;
}

module.exports = { checkOllamaHealth };

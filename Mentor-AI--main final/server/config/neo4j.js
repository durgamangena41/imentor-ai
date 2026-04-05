// server/config/neo4j.js
/**
 * Neo4j Configuration for Node.js Backend
 * Provides a safe wrapper around neo4j-driver with graceful fallback when Neo4j is unavailable.
 */

const { logger } = require('../utils/logger');

let driver = null;
let isConnected = false;

// Try to initialize Neo4j driver if environment variables are set
const initializeNeo4j = async () => {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !user || !password) {
        logger.warn('[Neo4j] Neo4j credentials not configured. Knowledge graph features will be disabled.');
        return false;
    }

    try {
        // Try to load neo4j-driver (optional dependency)
        let neo4jDriver;
        try {
            neo4jDriver = require('neo4j-driver');
        } catch (e) {
            logger.warn('[Neo4j] neo4j-driver package not installed. Run: npm install neo4j-driver');
            return false;
        }

        driver = neo4jDriver.driver(uri, neo4jDriver.auth.basic(user, password));

        // Verify connectivity
        await driver.verifyConnectivity();
        isConnected = true;
        logger.info('[Neo4j] Successfully connected to Neo4j database');
        return true;
    } catch (error) {
        logger.warn(`[Neo4j] Failed to connect to Neo4j: ${error.message}. Knowledge graph features will be disabled.`);
        driver = null;
        isConnected = false;
        return false;
    }
};

/**
 * Run a Cypher query against Neo4j
 * Returns empty result if Neo4j is not available (graceful degradation)
 */
const runQuery = async (query, params = {}) => {
    if (!driver || !isConnected) {
        // Graceful fallback - return empty result instead of throwing
        return { records: [] };
    }

    const session = driver.session();
    try {
        const result = await session.run(query, params);
        return result;
    } catch (error) {
        logger.error(`[Neo4j] Query error: ${error.message}`);
        throw error;
    } finally {
        await session.close();
    }
};

/**
 * Close the Neo4j connection
 */
const closeConnection = async () => {
    if (driver) {
        await driver.close();
        driver = null;
        isConnected = false;
        logger.info('[Neo4j] Connection closed');
    }
};

// Initialize on module load (non-blocking)
initializeNeo4j().catch(() => {
    // Silently ignore - already logged in initializeNeo4j
});

module.exports = {
    runQuery,
    closeConnection,
    initializeNeo4j,
    isConnected: () => isConnected
};

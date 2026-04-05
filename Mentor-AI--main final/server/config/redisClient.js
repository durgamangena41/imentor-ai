// server/config/redisClient.js
const { createClient } = require('redis');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
    console.warn("! REDIS_URL not found in .env, Redis caching will be disabled.");
}

const redisClient = redisUrl ? createClient({ url: redisUrl }) : null;

if (redisClient) {
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    redisClient.on('connect', () => console.log('✓ Redis client connected successfully.'));
    redisClient.on('reconnecting', () => console.log('Redis client is reconnecting...'));
}

// Function to connect the client
const connectRedis = async () => {
    if (redisClient && !redisClient.isOpen) {
        try {
            console.log('[Redis Cache] Attempting to connect to Redis...');
            await redisClient.connect();
        } catch (err) {
            console.error('Failed to connect to Redis:', err);
        }
    }
};

module.exports = { redisClient, connectRedis };
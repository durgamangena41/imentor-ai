// server/services/routingCacheService.js
const { redisClient } = require('../config/redisClient');
const crypto = require('crypto');

const CACHE_PREFIX = 'routing_cache:';
const DEFAULT_TTL = 3600; // 1 hour

const routingCacheService = {
    /**
     * Generates a unique hash for the query and context.
     */
    generateKey(query, context) {
        const hash = crypto.createHash('md5')
            .update(query.toLowerCase().trim())
            .update(JSON.stringify(context.user?.preferredLlmProvider || 'default'))
            .digest('hex');
        return `${CACHE_PREFIX}${hash}`;
    },

    /**
     * Fetches a cached routing decision.
     */
    async get(query, context) {
        if (!redisClient?.isOpen) return null;
        try {
            const key = this.generateKey(query, context);
            const data = await redisClient.get(key);
            if (data) {
                console.log(`[RoutingCache] Hit for query hash: ${key.split(':')[1].substring(0, 8)}`);
                return JSON.parse(data);
            }
            return null;
        } catch (err) {
            console.error('[RoutingCache] Error reading from cache:', err);
            return null;
        }
    },

    /**
     * Stores a routing decision in the cache.
     */
    async set(query, context, decision) {
        if (!redisClient?.isOpen) return;
        try {
            const key = this.generateKey(query, context);
            await redisClient.set(key, JSON.stringify(decision), { EX: DEFAULT_TTL });
            console.log(`[RoutingCache] Set for query hash: ${key.split(':')[1].substring(0, 8)}`);
        } catch (err) {
            console.error('[RoutingCache] Error writing to cache:', err);
        }
    }
};

module.exports = routingCacheService;

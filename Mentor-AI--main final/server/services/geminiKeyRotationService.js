const WINDOW_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RPM_LIMIT = 0;
const DEFAULT_DAILY_LIMIT = 1500;

const keyUsageState = new Map();
let roundRobinIndex = 0;

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRpmLimit() {
    return parsePositiveInteger(process.env.GEMINI_RPM_LIMIT, DEFAULT_RPM_LIMIT);
}

function getDailyLimit() {
    return parsePositiveInteger(process.env.GEMINI_DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
}

function isRotationLoggingEnabled() {
    return String(process.env.GEMINI_KEY_ROTATION_LOG || '').toLowerCase() === 'true';
}

function getKeySlotLabel(keys, key) {
    const index = keys.findIndex((item) => item === key);
    if (index === -1) return 'key-unknown';
    return `key-${index + 1}`;
}

function getGeminiApiKeys() {
    const explicitKeys = [
        process.env.GEMINI_API_KEY_1,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4,
        process.env.GEMINI_API_KEY_5,
    ];

    const allKeys = [...explicitKeys, process.env.GEMINI_API_KEY]
        .map((key) => String(key || '').trim())
        .filter(Boolean);

    return [...new Set(allKeys)];
}

function hasGeminiApiKeys() {
    return getGeminiApiKeys().length > 0;
}

function normalizeState(key, now) {
    const existing = keyUsageState.get(key) || {
        windowStartMs: now,
        requestCount: 0,
        dayStartMs: now,
        dayCount: 0,
        cooldownUntilMs: 0,
    };

    if (now - existing.windowStartMs >= WINDOW_MS) {
        existing.windowStartMs = now;
        existing.requestCount = 0;
    }

    if (now - existing.dayStartMs >= DAY_MS) {
        existing.dayStartMs = now;
        existing.dayCount = 0;
    }

    keyUsageState.set(key, existing);
    return existing;
}

function isGeminiRateLimitError(error) {
    const message = String(error?.message || '').toLowerCase();
    const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);

    if (status === 429) {
        return true;
    }

    return message.includes('429')
        || message.includes('quota')
        || message.includes('rate limit')
        || message.includes('too many requests')
        || message.includes('resource exhausted')
        || message.includes('retry in');
}

function acquireKeyForRequest() {
    const keys = getGeminiApiKeys();
    if (!keys.length) {
        throw new Error('No Gemini API keys configured. Set GEMINI_API_KEY_1..GEMINI_API_KEY_5 (or GEMINI_API_KEY).');
    }

    const now = Date.now();
    const rpmLimit = getRpmLimit();
    const dailyLimit = getDailyLimit();

    for (let offset = 0; offset < keys.length; offset += 1) {
        const index = (roundRobinIndex + offset) % keys.length;
        const key = keys[index];
        const state = normalizeState(key, now);

        if (state.cooldownUntilMs > now) {
            continue;
        }

        if (state.requestCount >= rpmLimit) {
            if (rpmLimit > 0) {
                continue;
            }
        }

        if (state.dayCount >= dailyLimit) {
            continue;
        }

        state.requestCount += 1;
        state.dayCount += 1;
        roundRobinIndex = (index + 1) % keys.length;

        if (isRotationLoggingEnabled()) {
            const keySlot = getKeySlotLabel(keys, key);
            const rpmText = rpmLimit > 0 ? `${state.requestCount}/${rpmLimit}` : `${state.requestCount}/disabled`;
            console.log(`[GeminiRotation] selected=${keySlot} day=${state.dayCount}/${dailyLimit} minute=${rpmText}`);
        }

        return key;
    }

    const dailyExhausted = keys.every((key) => {
        const state = normalizeState(key, now);
        return state.dayCount >= dailyLimit;
    });

    if (dailyExhausted) {
        throw new Error(`All Gemini keys reached daily limit (${dailyLimit} requests/key/day). Please retry after reset.`);
    }

    if (rpmLimit > 0) {
        throw new Error(`All Gemini keys are currently at RPM limit (${rpmLimit}) or cooldown. Please retry shortly.`);
    }

    throw new Error('All Gemini keys are currently unavailable (cooldown or temporary service limits). Please retry shortly.');
}

function markKeyRateLimited(key) {
    if (!key) return;

    const now = Date.now();
    const state = normalizeState(key, now);
    state.cooldownUntilMs = now + WINDOW_MS;
    const rpmLimit = getRpmLimit();
    if (rpmLimit > 0) {
        state.requestCount = rpmLimit;
    }
}

async function runWithGeminiKeyRotation(taskFn, options = {}) {
    const keys = getGeminiApiKeys();
    if (!keys.length) {
        throw new Error('No Gemini API keys configured. Set GEMINI_API_KEY_1..GEMINI_API_KEY_5 (or GEMINI_API_KEY).');
    }

    const {
        shouldRotateOnError = isGeminiRateLimitError,
        maxAttempts = keys.length,
    } = options;

    let attempt = 0;
    let lastError = null;

    while (attempt < Math.max(1, maxAttempts)) {
        attempt += 1;

        let selectedKey = null;
        try {
            selectedKey = acquireKeyForRequest();
            return await taskFn(selectedKey);
        } catch (error) {
            lastError = error;
            if (!selectedKey) {
                throw error;
            }

            if (shouldRotateOnError(error)) {
                markKeyRateLimited(selectedKey);
                if (isRotationLoggingEnabled()) {
                    const keySlot = getKeySlotLabel(keys, selectedKey);
                    console.warn(`[GeminiRotation] rate-limited=${keySlot}; switching to next key (attempt ${attempt}/${Math.max(1, maxAttempts)})`);
                }
                continue;
            }

            throw error;
        }
    }

    throw lastError || new Error('Gemini key rotation failed without a specific error.');
}

module.exports = {
    getGeminiApiKeys,
    hasGeminiApiKeys,
    isGeminiRateLimitError,
    runWithGeminiKeyRotation,
    getDailyLimit,
    getRpmLimit,
};

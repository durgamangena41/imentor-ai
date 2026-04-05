// server/services/courseModelManager.js
const CourseModelRegistry = require('../models/CourseModelRegistry');
const { logger } = require('../utils/logger');

/**
 * Resolves which model to use for a specific subject, handling A/B testing logic.
 */
async function getModelForSubject(subject) {
    try {
        const registry = await CourseModelRegistry.findOne({ subject });
        if (!registry) {
            console.log(`[CourseModelManager] No specific registry for ${subject}. Using default.`);
            return null; // Fallback to default model
        }

        // Handle A/B Testing
        if (registry.abTest && registry.abTest.isEnabled && registry.abTest.candidateModelTag) {
            const rollout = Math.random();
            if (rollout < registry.abTest.trafficSplit) {
                console.log(`[CourseModelManager] Routing to Candidate Model for ${subject}: ${registry.abTest.candidateModelTag}`);
                return registry.abTest.candidateModelTag;
            }
        }

        console.log(`[CourseModelManager] Routing to Active Model for ${subject}: ${registry.activeModelTag}`);
        return registry.activeModelTag;
    } catch (error) {
        console.error(`[CourseModelManager] Error resolving model: ${error.message}`);
        return null;
    }
}

/**
 * Registers a new model version for a subject.
 */
async function registerModelVersion(subject, tag, isProduction = false) {
    try {
        const status = isProduction ? 'production' : 'candidate';
        const update = {
            $push: { versions: { tag, status, createdAt: new Date() } },
            lastFinetunedAt: new Date()
        };

        if (isProduction) {
            update.activeModelTag = tag;
        }

        await CourseModelRegistry.findOneAndUpdate(
            { subject },
            update,
            { upsert: true, new: true }
        );

        console.log(`[CourseModelManager] Registered model ${tag} for ${subject} as ${status}`);
    } catch (error) {
        console.error(`[CourseModelManager] Registration failed: ${error.message}`);
    }
}

module.exports = {
    getModelForSubject,
    registerModelVersion
};

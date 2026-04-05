// server/models/SkillTree.js
const mongoose = require('mongoose');

const AssessmentQuestionSchema = new mongoose.Schema({
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        required: true
    },
    question: { type: String, required: true },
    options: [{ type: String }], // For MCQ format
    correctAnswer: { type: String, required: true },
    explanation: { type: String, default: '' }
}, { _id: false });

const PositionSchema = new mongoose.Schema({
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    tier: { type: Number, default: 1, min: 1 } // Higher tier = more advanced
}, { _id: false });

const SkillNodeSchema = new mongoose.Schema({
    skillId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', maxlength: 500 },
    category: {
        type: String,
        required: true,
        trim: true
        // Examples: "Machine Learning", "Statistics", "Linear Algebra", "Programming"
    },

    // Prerequisites system
    prerequisites: [{
        type: String, // Array of skillId that must be mastered first
        trim: true
    }],
    masteryThreshold: {
        type: Number,
        default: 80,
        min: 0,
        max: 100
    }, // Percentage required to "unlock" dependent skills

    // AI-generated assessment criteria
    assessmentQuestions: [AssessmentQuestionSchema],
    maxAssessmentAttempts: { type: Number, default: 3 }, // Retry limit

    // Associated content
    relatedDocuments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminDocument'
    }],
    relatedTopics: [{ type: String, trim: true }],

    // Visual positioning for fog-of-war map
    position: {
        type: PositionSchema,
        required: true
    },

    // Metadata
    estimatedHours: { type: Number, default: 0, min: 0 }, // Time to master
    difficulty: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert'],
        default: 'beginner'
    },
    icon: { type: String, default: '' }, // Icon identifier for UI
    color: { type: String, default: '#6366f1' }, // Hex color for node
    isActive: { type: Boolean, default: true }, // Can be disabled by admin

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Indexes for performance
SkillNodeSchema.index({ category: 1, 'position.tier': 1 });
SkillNodeSchema.index({ isActive: 1 });

// Static method to detect circular dependencies
SkillNodeSchema.statics.detectCircularDependency = async function (skillId, prerequisites) {
    const visited = new Set();
    const recursionStack = new Set();

    async function hasCycle(currentSkillId) {
        if (recursionStack.has(currentSkillId)) {
            return true; // Cycle detected
        }

        if (visited.has(currentSkillId)) {
            return false; // Already checked, no cycle
        }

        visited.add(currentSkillId);
        recursionStack.add(currentSkillId);

        const skill = await mongoose.model('SkillTree').findOne({ skillId: currentSkillId });
        if (skill && skill.prerequisites) {
            for (const prereqId of skill.prerequisites) {
                if (await hasCycle(prereqId)) {
                    return true;
                }
            }
        }

        recursionStack.delete(currentSkillId);
        return false;
    }

    // Check if adding these prerequisites would create a cycle
    for (const prereqId of prerequisites) {
        if (prereqId === skillId) return true; // Self-reference
        if (await hasCycle(prereqId)) return true;
    }

    return false;
};

// Pre-save validation
SkillNodeSchema.pre('save', async function (next) {
    // Check for circular dependencies
    const hasCircular = await this.constructor.detectCircularDependency(
        this.skillId,
        this.prerequisites
    );

    if (hasCircular) {
        const error = new Error('Circular dependency detected in skill prerequisites');
        return next(error);
    }

    this.updatedAt = Date.now();
    next();
});

const SkillTree = mongoose.model('SkillTree', SkillNodeSchema);

module.exports = SkillTree;

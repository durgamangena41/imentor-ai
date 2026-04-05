// server/models/StudentKnowledgeState.js
const mongoose = require('mongoose');

/**
 * Concept Understanding Schema
 * Tracks individual concept mastery with granular details
 */
const ConceptUnderstandingSchema = new mongoose.Schema({
    conceptName: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    category: {
        type: String,
        enum: ['fundamental', 'intermediate', 'advanced', 'specialized'],
        default: 'fundamental'
    },
    understandingLevel: {
        type: String,
        enum: ['not_exposed', 'struggling', 'learning', 'comfortable', 'mastered'],
        default: 'not_exposed'
    },
    // Mastery score (0-100)
    masteryScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    // Concept difficulty for the student
    difficulty: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    // Rate of improvement for this concept
    learningVelocity: {
        type: Number, // Change in masteryScore per interaction
        default: 0
    },
    confidenceScore: {
        type: Number,
        min: 0,
        max: 1,
        default: 0
    },
    // Specific strengths within this concept
    strengths: [{
        aspect: String,
        evidence: String,
        detectedAt: { type: Date, default: Date.now }
    }],
    // Specific weaknesses/struggles
    weaknesses: [{
        aspect: String,
        evidence: String,
        detectedAt: { type: Date, default: Date.now }
    }],
    // Common misconceptions detected
    misconceptions: [{
        description: String,
        correctedAt: Date,
        stillPresent: { type: Boolean, default: true }
    }],
    // Learning patterns observed
    learningPatterns: {
        respondsWellTo: [String], // e.g., ['visual_examples', 'step_by_step', 'analogies']
        strugglesWithApproach: [String], // e.g., ['abstract_theory', 'mathematical_notation']
        preferredExplanationStyle: String
    },
    // Interaction history
    totalInteractions: {
        type: Number,
        default: 0
    },
    successfulInteractions: {
        type: Number,
        default: 0
    },
    lastInteractionDate: Date,
    firstExposureDate: {
        type: Date,
        default: Date.now
    },
    // Related concepts
    relatedConcepts: [{
        conceptName: String,
        relationship: { type: String, enum: ['prerequisite', 'builds_on', 'related_to', 'advanced_form'] }
    }],
    // Notes from AI tutor observations
    tutorNotes: [{
        note: String,
        timestamp: { type: Date, default: Date.now },
        sessionId: String
    }]
}, { _id: true, timestamps: true });

/**
 * Student Knowledge State Schema
 * Maintains a comprehensive profile of student's knowledge across sessions
 */
const StudentKnowledgeStateSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },

    // Overall learning profile
    learningProfile: {
        // Overall learning style (visual, auditory, kinesthetic, reading/writing)
        dominantLearningStyle: {
            type: String,
            enum: ['visual', 'auditory', 'kinesthetic', 'reading_writing', 'mixed', 'unknown'],
            default: 'unknown'
        },
        // Pace of learning
        learningPace: {
            type: String,
            enum: ['slow_methodical', 'moderate', 'fast_paced', 'variable'],
            default: 'moderate'
        },
        // Preferred depth
        preferredDepth: {
            type: String,
            enum: ['high_level_overview', 'balanced', 'deep_technical'],
            default: 'balanced'
        },
        // How student handles challenges
        challengeResponse: {
            type: String,
            enum: ['gives_up_easily', 'needs_encouragement', 'persistent', 'thrives_on_challenge'],
            default: 'needs_encouragement'
        },
        // Question asking behavior
        questioningBehavior: {
            type: String,
            enum: ['rarely_asks', 'asks_when_stuck', 'frequently_asks', 'asks_deep_questions'],
            default: 'asks_when_stuck'
        }
    },

    // Concept-level understanding
    concepts: [ConceptUnderstandingSchema],

    // Global knowledge summary (AI-generated natural language summary)
    knowledgeSummary: {
        type: String,
        default: ''
    },

    // Current focus areas
    currentFocusAreas: [{
        topic: String,
        startedAt: { type: Date, default: Date.now },
        priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
        reason: String
    }],

    // Topics to avoid repeating (already mastered)
    masteredTopics: [{
        topic: String,
        masteredAt: Date,
        shouldReview: { type: Boolean, default: false },
        nextReviewDate: Date
    }],

    // Course-specific curriculum progress (for Neo4j graph navigation)
    courseCurriculumProgress: [{
        courseName: {
            type: String,
            required: true,
            index: true
        },
        // Completed subtopics (for prerequisite checking)
        completedSubtopics: [{
            subtopicId: String,
            subtopicName: String,
            completedAt: { type: Date, default: Date.now }
        }],
        // Completed topics (for advancement tracking)
        completedTopics: [{
            topicId: String,
            topicName: String,
            moduleId: String,
            moduleName: String,
            masteredAt: { type: Date, default: Date.now }
        }],
        // Current active topic in tutor mode
        currentTopicId: String,
        currentTopicName: String,
        currentModuleId: String,
        // Last activity in this course
        lastActiveAt: { type: Date, default: Date.now }
    }],

    // Recurring struggles (patterns across multiple concepts)
    recurringStruggles: [{
        pattern: String, // e.g., "Struggles with mathematical notation"
        occurrences: Number,
        firstDetected: Date,
        lastDetected: Date,
        examples: [String] // Concept names where this was observed
    }],

    // Session-based insights
    sessionInsights: [{
        sessionId: String,
        date: { type: Date, default: Date.now },
        keyObservations: [String],
        conceptsCovered: [String],
        breakthroughMoments: [String],
        struggledWith: [String]
    }],

    // Engagement metrics
    engagementMetrics: {
        totalSessions: { type: Number, default: 0 },
        averageSessionLength: { type: Number, default: 0 }, // in minutes
        totalQuestionsAsked: { type: Number, default: 0 },
        totalConceptsExplored: { type: Number, default: 0 },
        lastActiveDate: Date,
        streakDays: { type: Number, default: 0 },
        learningVelocity: { type: Number, default: 0 } // Global learning rate
    },

    // AI-generated recommendations
    recommendations: [{
        type: { type: String, enum: ['review', 'advance', 'practice', 'prerequisite'] },
        topic: String,
        reason: String,
        priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
        createdAt: { type: Date, default: Date.now },
        actedUpon: { type: Boolean, default: false }
    }],

    // Metadata
    memoryOptOut: {
        type: Boolean,
        default: false
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    version: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true,
    _id: true
});

// Indexes for efficient queries
// Note: userId already has index: true inline (line 110)
// Note: concepts.conceptName already has index: true inline (line 13)
StudentKnowledgeStateSchema.index({ 'concepts.understandingLevel': 1 });
StudentKnowledgeStateSchema.index({ lastUpdated: -1 });

// Update lastUpdated on save
StudentKnowledgeStateSchema.pre('save', function (next) {
    this.lastUpdated = Date.now();
    next();
});

// Helper method to get concept by name
StudentKnowledgeStateSchema.methods.getConcept = function (conceptName) {
    return this.concepts.find(c => c.conceptName.toLowerCase() === conceptName.toLowerCase());
};

// Helper method to add or update concept
StudentKnowledgeStateSchema.methods.updateConcept = function (conceptData) {
    const existingIndex = this.concepts.findIndex(
        c => c.conceptName.toLowerCase() === conceptData.conceptName.toLowerCase()
    );

    if (existingIndex >= 0) {
        // Update existing concept
        Object.assign(this.concepts[existingIndex], conceptData);
    } else {
        // Add new concept
        this.concepts.push(conceptData);
    }

    return this;
};

// Helper method to get struggling concepts
StudentKnowledgeStateSchema.methods.getStrugglingConcepts = function () {
    return this.concepts.filter(c =>
        c.understandingLevel === 'struggling' ||
        c.masteryScore < 70 ||
        c.difficulty === 'high'
    );
};

// Helper method to get mastered concepts
StudentKnowledgeStateSchema.methods.getMasteredConcepts = function () {
    return this.concepts.filter(c =>
        c.understandingLevel === 'mastered' || c.masteryScore >= 85
    );
};

// Helper method to generate knowledge summary
StudentKnowledgeStateSchema.methods.generateQuickSummary = function () {
    const mastered = this.getMasteredConcepts().length;
    const struggling = this.getStrugglingConcepts().length;
    const learning = this.concepts.filter(c => c.understandingLevel === 'learning').length;

    return {
        totalConcepts: this.concepts.length,
        mastered,
        learning,
        struggling,
        notExposed: this.concepts.filter(c => c.understandingLevel === 'not_exposed').length,
        recentFocus: this.currentFocusAreas.slice(0, 3).map(f => f.topic),
        topStruggles: this.recurringStruggles.slice(0, 3).map(s => s.pattern)
    };
};

// Helper method to get or create course curriculum progress
StudentKnowledgeStateSchema.methods.getCourseProgress = function (courseName) {
    let progress = this.courseCurriculumProgress.find(
        p => p.courseName.toLowerCase() === courseName.toLowerCase()
    );
    if (!progress) {
        progress = {
            courseName,
            completedSubtopics: [],
            completedTopics: [],
            currentTopicId: null,
            currentTopicName: null,
            currentModuleId: null,
            lastActiveAt: new Date()
        };
        this.courseCurriculumProgress.push(progress);
    }
    return progress;
};

// Helper method to mark a topic as complete
StudentKnowledgeStateSchema.methods.markTopicComplete = function (courseName, topicData) {
    const progress = this.getCourseProgress(courseName);
    const existing = progress.completedTopics.find(t => t.topicId === topicData.topicId);
    if (!existing) {
        progress.completedTopics.push({
            topicId: topicData.topicId,
            topicName: topicData.topicName,
            moduleId: topicData.moduleId,
            moduleName: topicData.moduleName,
            masteredAt: new Date()
        });
    }
    progress.lastActiveAt = new Date();
    return this;
};

// Helper method to get completed subtopic IDs for prerequisite checking
StudentKnowledgeStateSchema.methods.getCompletedSubtopicIds = function (courseName) {
    const progress = this.getCourseProgress(courseName);
    return progress.completedSubtopics.map(s => s.subtopicId);
};

const StudentKnowledgeState = mongoose.model('StudentKnowledgeState', StudentKnowledgeStateSchema);
module.exports = StudentKnowledgeState;

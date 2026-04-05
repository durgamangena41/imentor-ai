# Contextual Memory System

## Overview

The Contextual Memory System maintains persistent knowledge of student learning patterns across multiple sessions. It enables the AI tutor to remember what each student knows, where they struggle, and how they learn best.

## Purpose

Without contextual memory, each chat session would start fresh with no knowledge of the student. This system enables:

- **Continuity**: Remember previous conversations and progress
- **Personalization**: Adapt to individual learning styles
- **Gap Detection**: Identify and address knowledge gaps
- **Progress Tracking**: Monitor mastery over time

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       CHAT MESSAGE                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               contextualMemoryMiddleware.js                      │
│                                                                  │
│   1. Load StudentKnowledgeState for user                        │
│   2. Attach to request context                                  │
│   3. After response: Update state with new observations         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  StudentKnowledgeState                          │
│                     (MongoDB Model)                              │
│                                                                  │
│   ┌─────────────────┐   ┌──────────────────┐                   │
│   │ Learning Profile│   │     Concepts     │                   │
│   │  - Style        │   │  - Mastery Score │                   │
│   │  - Pace         │   │  - Strengths     │                   │
│   │  - Depth        │   │  - Weaknesses    │                   │
│   └─────────────────┘   └──────────────────┘                   │
│                                                                  │
│   ┌─────────────────┐   ┌──────────────────┐                   │
│   │ Session Insights│   │ Recommendations  │                   │
│   │  - Observations │   │  - Next Topics   │                   │
│   │  - Breakthroughs│   │  - Review Items  │                   │
│   └─────────────────┘   └──────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model

### StudentKnowledgeState Schema

```javascript
const StudentKnowledgeStateSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },

    // Overall learning profile
    learningProfile: {
        dominantLearningStyle: {
            type: String,
            enum: ['visual', 'auditory', 'kinesthetic', 'reading_writing', 'mixed', 'unknown'],
            default: 'unknown'
        },
        learningPace: {
            type: String,
            enum: ['slow_methodical', 'moderate', 'fast_paced', 'variable'],
            default: 'moderate'
        },
        preferredDepth: {
            type: String,
            enum: ['high_level_overview', 'balanced', 'deep_technical'],
            default: 'balanced'
        },
        challengeResponse: {
            type: String,
            enum: ['gives_up_easily', 'needs_encouragement', 'persistent', 'thrives_on_challenge'],
            default: 'needs_encouragement'
        }
    },

    // Concept-level understanding
    concepts: [ConceptUnderstandingSchema],

    // AI-generated knowledge summary
    knowledgeSummary: String,

    // Current focus areas
    currentFocusAreas: [{
        topic: String,
        priority: { type: String, enum: ['low', 'medium', 'high'] },
        reason: String
    }],

    // Session-based insights
    sessionInsights: [{
        sessionId: String,
        keyObservations: [String],
        conceptsCovered: [String],
        breakthroughMoments: [String],
        struggledWith: [String]
    }],

    // Engagement metrics
    engagementMetrics: {
        totalSessions: Number,
        averageSessionLength: Number,
        totalQuestionsAsked: Number,
        streakDays: Number,
        learningVelocity: Number
    }
});
```

### ConceptUnderstanding Schema

```javascript
const ConceptUnderstandingSchema = new mongoose.Schema({
    conceptName: { type: String, required: true },
    
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
    
    masteryScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    
    learningVelocity: Number,  // Change in mastery per interaction
    confidenceScore: { type: Number, min: 0, max: 1 },
    
    strengths: [{
        aspect: String,
        evidence: String,
        detectedAt: Date
    }],
    
    weaknesses: [{
        aspect: String,
        evidence: String,
        detectedAt: Date
    }],
    
    misconceptions: [{
        description: String,
        correctedAt: Date,
        stillPresent: Boolean
    }],
    
    learningPatterns: {
        respondsWellTo: [String],      // e.g., ['visual_examples', 'analogies']
        strugglesWithApproach: [String] // e.g., ['abstract_theory']
    }
});
```

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| `StudentKnowledgeState.js` | `server/models/` | Mongoose model definition |
| `contextualMemoryMiddleware.js` | `server/middleware/` | Loads and updates state per request |

## Understanding Levels

The system tracks mastery through 5 levels:

| Level | Mastery Score | Description |
|-------|---------------|-------------|
| `not_exposed` | 0 | Student hasn't encountered this concept |
| `struggling` | 1-25 | Finds concept difficult, many misconceptions |
| `learning` | 26-50 | Making progress, some gaps remain |
| `comfortable` | 51-75 | Good understanding, can apply concept |
| `mastered` | 76-100 | Deep understanding, can teach others |

## How It Works

### 1. Loading State (Middleware)

When a chat request comes in:

```javascript
// contextualMemoryMiddleware.js
async function loadKnowledgeState(req, res, next) {
    const userId = req.user._id;
    
    let state = await StudentKnowledgeState.findOne({ userId });
    
    if (!state) {
        state = new StudentKnowledgeState({ userId });
        await state.save();
    }
    
    req.knowledgeState = state;
    next();
}
```

### 2. Using State in Chat

The AI uses the knowledge state to personalize responses:

```javascript
// In chat handler
const systemContext = `
Student Profile:
- Learning Style: ${state.learningProfile.dominantLearningStyle}
- Pace: ${state.learningProfile.learningPace}
- Known Struggles: ${state.getStrugglingConcepts().map(c => c.conceptName).join(', ')}
- Mastered Topics: ${state.getMasteredConcepts().map(c => c.conceptName).join(', ')}

Tailor your response accordingly.
`;
```

### 3. Updating State After Interaction

After each AI response, observations are analyzed and state updated:

```javascript
// Update concept mastery
state.updateConcept({
    conceptName: "Neural Networks",
    understandingLevel: "learning",
    masteryScore: 45,
    confidenceScore: 0.6
});

// Add session insight
state.sessionInsights.push({
    sessionId: req.sessionId,
    keyObservations: ["Student grasps basic neuron concept"],
    struggledWith: ["Activation functions"]
});

await state.save();
```

## Helper Methods

The model includes built-in helper methods:

```javascript
// Get concept by name
const concept = state.getConcept("Neural Networks");

// Get all struggling concepts
const struggles = state.getStrugglingConcepts();
// Returns concepts where understandingLevel === 'struggling' 
// OR (learning && confidenceScore < 0.5)

// Get all mastered concepts
const mastered = state.getMasteredConcepts();

// Generate quick summary
const summary = state.generateQuickSummary();
// Returns: {
//     totalConcepts: 15,
//     mastered: 3,
//     learning: 8,
//     struggling: 2,
//     notExposed: 2,
//     recentFocus: ["ML Basics", "Neural Networks"],
//     topStruggles: ["Calculus notation"]
// }
```

## Integration with Other Features

### Socratic Tutor
- Uses `understandingLevel` to calibrate question difficulty
- Updates `masteryScore` on correct answers
- Records `misconceptions` when detected

### Gamification
- `engagementMetrics.streakDays` for streak tracking
- `learningVelocity` contributes to XP calculations

### Recommendations
- `strugglingConcepts` feeds into bounty question generation
- `currentFocusAreas` prioritizes study suggestions

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/student/knowledge-state` | Get current knowledge state |
| `GET` | `/api/student/struggling-concepts` | Get concepts student struggles with |
| `GET` | `/api/student/recommendations` | Get personalized study recommendations |

## Example Knowledge State

```json
{
    "userId": "65abc123...",
    "learningProfile": {
        "dominantLearningStyle": "visual",
        "learningPace": "moderate",
        "preferredDepth": "balanced",
        "challengeResponse": "persistent"
    },
    "concepts": [
        {
            "conceptName": "Linear Regression",
            "understandingLevel": "comfortable",
            "masteryScore": 72,
            "strengths": [
                { "aspect": "Understanding equation form", "evidence": "Correctly explained y = mx + b" }
            ],
            "weaknesses": [],
            "misconceptions": []
        },
        {
            "conceptName": "Gradient Descent",
            "understandingLevel": "struggling",
            "masteryScore": 23,
            "weaknesses": [
                { "aspect": "Intuition for learning rate", "evidence": "Confused why small values work better" }
            ],
            "misconceptions": [
                { "description": "Thinks higher learning rate always means faster learning", "stillPresent": true }
            ]
        }
    ],
    "knowledgeSummary": "Student has solid foundation in basic regression but struggles with optimization concepts.",
    "engagementMetrics": {
        "totalSessions": 12,
        "averageSessionLength": 25,
        "streakDays": 3
    }
}
```

## Contributors

- **S Swarna Sri** (@swarna49) - StudentKnowledgeState model, Contextual memory integration

---

*Last Updated: January 2026*

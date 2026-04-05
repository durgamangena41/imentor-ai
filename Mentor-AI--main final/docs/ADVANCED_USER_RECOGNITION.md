# Advanced User Recognition System

## Overview

The Advanced User Recognition System is an intelligent feature that analyzes a user's historical interactions to determine their expertise level. When a returning user asks an introductory question about a topic they've already mastered, the system:

1. **Recognizes** their existing knowledge
2. **Acknowledges** their expertise briefly
3. **Skips** basic definitions and foundational explanations
4. **Focuses** on advanced applications, optimization techniques, and practical implementations

## How It Works

### 1. Expertise Detection

When a user sends a message, the system:

- Analyzes their **Student Knowledge State** to find mastered concepts (mastery score ≥ 80%)
- Counts their **recent sessions** (last 30 days)
- Determines their **expertise level**: Beginner, Intermediate, Advanced, or Expert

**Expertise Levels:**
- **Expert**: 10+ mastered concepts AND 20+ sessions
- **Advanced**: 5+ mastered concepts AND 10+ sessions
- **Intermediate**: 2+ mastered concepts OR 5+ sessions
- **Beginner**: Everyone else

### 2. Query Analysis

The system checks if the current query is:
- An **introductory question** (starts with "what is", "explain", "tell me about", etc.)
- About a **topic they've already mastered**

### 3. Adaptive Response

If both conditions are met, the system:

**Adds an acknowledgment prefix:**
```
"I see you've already mastered [Topic]. Let's dive into the advanced aspects and practical applications."
```

**Enhances the system prompt** with:
- User's expertise level
- List of mastered concepts
- Instructions to skip basics and focus on:
  - Advanced applications and use cases
  - Optimization techniques
  - Edge cases and gotchas
  - Real-world implementation patterns
  - Best practices and anti-patterns

## Example Scenarios

### Scenario 1: Returning Expert

**User Profile:**
- Mastered: "Machine Learning", "Neural Networks", "Deep Learning"
- Sessions: 25
- Expertise Level: Expert

**User Query:** "What is machine learning?"

**System Response:**
```
I see you've already mastered Machine Learning. Let's dive into the advanced aspects and practical applications.

[Advanced content about ML optimization, production deployment strategies, 
model monitoring, A/B testing frameworks, etc.]
```

### Scenario 2: New User

**User Profile:**
- Mastered: None
- Sessions: 1
- Expertise Level: Beginner

**User Query:** "What is machine learning?"

**System Response:**
```
Machine learning is a part of Artificial Intelligence where computers learn 
patterns from data and improve with experience...

[Basic introduction with foundational concepts]
```

## Integration Points

### 1. Contextual Memory Middleware
**File:** `server/middleware/contextualMemoryMiddleware.js`

The middleware now:
- Calls `checkUserExpertiseLevel()` for every request
- Generates expertise-aware system prompts
- Attaches expert acknowledgments to `req.contextualMemory`

### 2. Chat Route
**File:** `server/routes/chat.js`

The chat handler:
- Prioritizes expert acknowledgments over standard acknowledgments
- Works in both streaming and non-streaming modes
- Logs expertise level for monitoring

### 3. Advanced Recognition Service
**File:** `server/services/advancedUserRecognitionService.js`

Core functions:
- `checkUserExpertiseLevel()` - Main expertise detection
- `generateExpertAcknowledgment()` - Creates acknowledgment text
- `generateExpertiseAwareSystemPrompt()` - Enhances system prompts
- `isIntroductoryQuestion()` - Detects basic questions
- `extractTopicFromQuery()` - Identifies query topic

## Configuration

### Related Topics Mapping

You can expand the related terms mapping in `advancedUserRecognitionService.js`:

```javascript
const relatedTerms = {
    'machine learning': ['ml', 'neural network', 'deep learning', 'ai', 'model training'],
    'react': ['jsx', 'hooks', 'components', 'state management', 'redux'],
    // Add more mappings here
};
```

### Mastery Threshold

Current threshold: **80%** mastery score

To adjust, modify the filter in `checkUserExpertiseLevel()`:

```javascript
const masteredConcepts = knowledgeState.concepts
    .filter(c => c.masteryScore >= 80) // Change this value
```

### Session Window

Current window: **30 days**

To adjust, modify the date calculation:

```javascript
createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Change 30 to desired days
```

## Monitoring & Logs

The system logs expertise detection events:

```
[AdvancedRecognition] User 507f1f77bcf86cd799439011 - Level: advanced, Mastered: 7, Skip Basics: true
[ContextualMemory] Enhanced prompt for advanced user 507f1f77bcf86cd799439011
[Chat] Sent expert acknowledgment for user 507f1f77bcf86cd799439011
```

## Benefits

1. **Improved User Experience**: Returning users don't waste time on content they already know
2. **Personalization**: Responses adapt to individual expertise levels
3. **Efficiency**: Advanced users get straight to practical applications
4. **Engagement**: Shows the system "remembers" and respects their progress

## Future Enhancements

Potential improvements:
- NLP-based topic extraction for better matching
- User preference settings to control acknowledgment style
- Expertise-based content difficulty adjustment
- Integration with learning path recommendations
- Analytics dashboard for expertise progression

## Testing

To test the feature:

1. Create a user with mastered concepts in their knowledge state
2. Send an introductory question about a mastered topic
3. Verify the acknowledgment appears in the response
4. Check logs for expertise level detection

Example test query:
```
User with mastered "React" concept asks: "What is React?"
Expected: Expert acknowledgment + advanced React content
```

## Troubleshooting

**Issue**: Acknowledgment not appearing

**Checks**:
1. User has mastered concepts with score ≥ 80%
2. Query is detected as introductory
3. Query topic matches a mastered concept
4. `req.contextualMemory.expertAcknowledgment` is populated

**Issue**: Wrong expertise level assigned

**Checks**:
1. Verify mastered concept count in database
2. Check recent session count (last 30 days)
3. Review `determineExpertiseLevel()` thresholds

## API Response Structure

The contextual memory object now includes:

```javascript
req.contextualMemory = {
    knowledgeContext: "...",
    systemPrompt: "...",
    hasMemory: true,
    optedOut: false,
    userExpertise: {
        isReturningExpert: true,
        expertiseLevel: "advanced",
        masteredConcepts: ["Machine Learning", "Neural Networks"],
        shouldSkipBasics: true,
        sessionCount: 15
    },
    expertAcknowledgment: "I see you've already mastered Machine Learning..."
}
```

## Dependencies

- `StudentKnowledgeState` model
- `ChatHistory` model
- `knowledgeStateService`
- `logger` utility

---

**Version**: 1.0.0  
**Last Updated**: January 26, 2026  
**Author**: iMentor Development Team

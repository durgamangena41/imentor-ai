# Socratic Tutor Mode (Multi-turn Reasoning Loop)

## Overview

The Socratic Tutor Mode implements an AI tutor that uses the **Socratic method** - teaching through questioning rather than direct explanation. The tutor evaluates student responses, classifies their understanding level, and generates adaptive follow-up questions.

## Core Principle

> The Socratic tutor **never** gives direct explanations. It only:
> - Asks probing questions
> - Provides hints
> - Guides the student to discover answers themselves

## How It Works

```
┌─────────────────┐
│  Student Query  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SOCRATIC TUTOR SERVICE                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                 EVALUATE RESPONSE                           │ │
│  │                                                              │ │
│  │  Analyze student's answer against:                          │ │
│  │  - Previous question context                                 │ │
│  │  - Expected understanding level                              │ │
│  │  - Common misconceptions                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              CLASSIFY UNDERSTANDING                         │ │
│  │                                                              │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │ │
│  │  │ UNDERSTANDS │  │   PARTIAL   │  │  MISCONCEPTION   │    │ │
│  │  │  (Correct)  │  │ (Incomplete)│  │   (Wrong idea)   │    │ │
│  │  └─────────────┘  └─────────────┘  └──────────────────┘    │ │
│  │                                                              │ │
│  │                    ┌────────────────────┐                   │ │
│  │                    │  NO_MENTAL_MODEL   │                   │ │
│  │                    │   (No foundation)   │                  │ │
│  │                    └────────────────────┘                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              GENERATE NEXT QUESTION                         │ │
│  │                                                              │ │
│  │  Based on classification:                                    │ │
│  │  - UNDERSTANDS → Deeper/Advanced question                   │ │
│  │  - PARTIAL → Clarifying question                            │ │
│  │  - MISCONCEPTION → Corrective question                      │ │
│  │  - NO_MENTAL_MODEL → Foundation-building question           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MASTERY CHECK                                │
│                                                                  │
│  Has student achieved 2-3 consecutive UNDERSTANDS?              │
│                                                                  │
│  YES → Stop questioning, emit closure message                   │
│  NO  → Continue with next Socratic question                     │
└─────────────────────────────────────────────────────────────────┘
```

## Understanding Classifications

| Classification | Description | Example Response | Next Action |
|----------------|-------------|------------------|-------------|
| `UNDERSTANDS` | Correct, complete understanding | "A neuron takes weighted inputs, applies activation, outputs signal" | Deeper question or mastery check |
| `PARTIAL` | Correct but incomplete | "A neuron processes inputs" | Ask for more details |
| `MISCONCEPTION` | Fundamentally wrong idea | "Neurons are like random number generators" | Correct through questioning |
| `NO_MENTAL_MODEL` | No foundational understanding | "I don't know what a neuron is" | Start with basics |

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| `socraticTutorService.js` | `server/services/` | Main Socratic reasoning logic |
| `tutorSystemPrompt.js` | `server/prompts/` | System prompts for tutor persona |
| `promptTemplates.js` | `server/config/` | Evaluation and question generation prompts |

## Session State Tracking

The tutor maintains session-level state to track:

```javascript
{
    sessionId: "abc123",
    moduleTitle: "Neural Networks Basics",
    currentQuestion: "What is an activation function?",
    consecutiveUnderstands: 1,
    questionHistory: [
        { question: "What is a neuron?", classification: "UNDERSTANDS" },
        { question: "What is an activation function?", classification: null }
    ],
    masteryAchieved: false
}
```

## Mastery Threshold

- **Threshold**: 2-3 consecutive `UNDERSTANDS` classifications
- **On Mastery**:
  1. Stop questioning
  2. Emit closure message: "Excellent! You've demonstrated solid understanding of [topic]"
  3. Update module status to `mastered`
  4. Optionally suggest next topic

## Prompt Templates

### Evaluation Prompt
```javascript
PROMPT_TEMPLATES.evaluateSocraticResponse = `
You are evaluating a student's response to a Socratic question.

Previous Question: {previousQuestion}
Student Response: {studentResponse}
Topic: {topic}

Classify the response as ONE of:
- UNDERSTANDS: Demonstrates correct, complete understanding
- PARTIAL: Shows some understanding but missing key elements
- MISCONCEPTION: Contains fundamental misunderstandings
- NO_MENTAL_MODEL: Shows no foundational understanding

Return ONLY the classification and a brief explanation.
`;
```

### Question Generation Prompt
```javascript
PROMPT_TEMPLATES.generateSocraticQuestion = `
You are a Socratic tutor for {topic}.

Student's current understanding level: {classification}
Previous question: {previousQuestion}
Student response: {studentResponse}

Generate a SINGLE follow-up Socratic question that:
- For UNDERSTANDS: Goes deeper or tests application
- For PARTIAL: Asks for the missing piece
- For MISCONCEPTION: Guides toward correct understanding without explaining
- For NO_MENTAL_MODEL: Builds foundational knowledge step by step

Remember: You must ONLY ask questions. Never explain directly.
`;
```

## API Usage

### Initialize Tutor Session
```javascript
POST /api/chat/tutor/init
{
    "sessionId": "session_123",
    "moduleTitle": "Introduction to Neural Networks",
    "initialQuestion": "What do you think a neural network is?"
}
```

### Send Response (via Chat Endpoint)
```javascript
POST /api/chat/message
{
    "sessionId": "session_123",
    "message": "I think it's like a brain simulation",
    "isTutorMode": true
}
```

### Response Format
```javascript
{
    "response": "That's an interesting starting point! What specific properties of the brain do you think neural networks try to replicate?",
    "classification": "PARTIAL",
    "masteryProgress": {
        "consecutiveUnderstands": 0,
        "masteryAchieved": false,
        "estimatedQuestionsRemaining": 3
    }
}
```

## Key Features

### 1. Never Direct Explanations
The tutor is strictly instructed to only ask questions and provide hints. It will not:
- Define terms directly
- Explain concepts
- Give step-by-step solutions

### 2. Adaptive Difficulty
Questions adapt based on classification:
- Wrong answers → Simpler, foundational questions
- Correct answers → Deeper, more challenging questions

### 3. Progress Tracking
- Tracks consecutive correct answers
- Provides mastery closure when threshold reached
- Updates StudentKnowledgeState for long-term tracking

### 4. Context Awareness
The tutor uses:
- Current topic context
- Previous question history
- Known student weaknesses (from StudentKnowledgeState)

## Integration Points

- **Curriculum Graph**: Uses prerequisites to suggest foundational topics
- **StudentKnowledgeState**: Updates mastery levels persistently
- **Chat Interface**: Works through existing chat UI with tutor mode toggle

## Contributors

- **P Sai Karthik** (@Karthi-k235) - First Socratic Loop implementation
- **S Tejaswini** (@Tejaswini-1906) - AI tutor system prompt generation

---

*Last Updated: January 2026*

# Prompt Templates System

## Overview

The Prompt Templates System provides structured prompts for consistent AI responses across different tasks like document analysis, knowledge graph extraction, and Socratic tutoring.

## File Location

`server/config/promptTemplates.js`

## Available Templates

### 1. Document Analysis

```javascript
PROMPT_TEMPLATES.documentFAQ = `
Analyze the document and generate FAQs:
- Extract key concepts
- Generate Q&A pairs
- Format as JSON array
`;

PROMPT_TEMPLATES.documentTopics = `
Extract main topics from the document:
- Identify primary themes
- List subtopics
- Note key terms
`;

PROMPT_TEMPLATES.documentMindmap = `
Create a hierarchical mindmap structure:
- Central topic
- Main branches
- Sub-branches with details
`;
```

### 2. Knowledge Graph Extraction

```javascript
PROMPT_TEMPLATES.extractEntities = `
Extract entities from text:
- Identify concepts, people, processes
- Classify entity types
- Return as JSON array
`;

PROMPT_TEMPLATES.extractRelationships = `
Identify relationships between entities:
- RELATES_TO, CAUSES, REQUIRES, etc.
- Source and target entities
- Relationship strength
`;
```

### 3. Socratic Tutoring

```javascript
PROMPT_TEMPLATES.evaluateSocraticResponse = `
Classify student understanding:
- UNDERSTANDS: Correct, complete
- PARTIAL: Incomplete
- MISCONCEPTION: Fundamentally wrong
- NO_MENTAL_MODEL: No foundation
`;

PROMPT_TEMPLATES.generateSocraticQuestion = `
Generate follow-up Socratic question:
- Never explain directly
- Only ask questions
- Adapt to classification
`;
```

## Usage

```javascript
const { PROMPT_TEMPLATES } = require('../config/promptTemplates');

const prompt = PROMPT_TEMPLATES.evaluateSocraticResponse
    .replace('{topic}', currentTopic)
    .replace('{studentResponse}', response);

const result = await llm.generate(prompt);
```

## Contributors

- **P Sai Karthik** (@Karthi-k235) - Prompt templates for document analysis and knowledge graph

---
*Last Updated: January 2026*

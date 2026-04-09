# Feature Walkthroughs

This directory contains detailed documentation for each major feature implemented in the AI Tutor project.

## Today Added Features (Apr 9, 2026)

The following features were implemented or stabilized today in codebase routes and UI flow:

- Prep Mode persistence and history enrichment (`server/routes/prepMode.js`, `server/models/PrepSession.js`, `frontend/src/pages/PrepModePage.jsx`)
- Doubt Resolver save/history APIs (`server/routes/doubtResolver.js`, `server/models/SavedDoubt.js`)
- Personal Timetable generator route (`server/routes/timetable.js`)
- Admin login reliability update in frontend auth flow (`frontend/src/App.jsx`, `frontend/src/contexts/AuthContext.jsx`)
- Login Network Error troubleshooting documentation updates in root docs

These updates are production code changes and will be split into dedicated deep-dive walkthrough files in the next documentation cycle.

## 📚 Available Walkthroughs

| # | Feature | Description | Primary Contributors |
| --- | --- | --- | --- |
| 01 | [Curriculum Knowledge Graph](./01-curriculum-knowledge-graph.md) | Neo4j-based syllabus-to-graph mapping with Module→Topic→Subtopic hierarchy | @HariPriya-2124, @Karthi-k235 |
| 02 | [Socratic Tutor Mode](./02-socratic-tutor-mode.md) | Multi-turn reasoning loop with understanding classification and mastery tracking | @Karthi-k235, @Tejaswini-1906 |
| 03 | [Contextual Memory System](./03-contextual-memory-system.md) | Persistent StudentKnowledgeState tracking across sessions | @swarna49 |
| 04 | [RAG with Qdrant](./04-rag-qdrant-integration.md) | Vector database integration for document retrieval and context-aware responses | @HariPriya-2124, @Karthi-k235 |
| 05 | [Gamification System](./05-gamification-system.md) | XP, streaks, bounties, boss battles, and badges for engagement | @Teja-9703, @Nithin974 |
| 06 | [Prompt Templates](./06-prompt-templates.md) | Structured prompts for consistent AI responses | @Karthi-k235 |

## 🔗 Quick Links

- [Main README](../../README.md)
- [Gamification Detailed Docs](../../GAMIFICATION_README.md)

## 📝 How to Use These Docs

1. **New Contributors**: Start with the feature you'll be working on
2. **Understanding Architecture**: Read walkthroughs in order (01-06)
3. **Implementation Reference**: Each doc includes file locations and code examples

---

Last Updated: April 2026

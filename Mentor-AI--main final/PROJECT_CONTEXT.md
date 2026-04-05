# AI Tutor Project - Context Summary

## **Current Session Status**
**Last Issue Fixed**: Knowledge Base PDF upload → FAQ/Mindmap/Topics generation was failing with error: "Failed to get response from Ollama service"

**Root Cause**: User's `preferredLlmProvider` was set to `ollama` but Ollama isn't installed. The `analysisWorker.js` was trying to call Ollama API for content generation.

**Solution Applied**: Modified `server/routes/upload.js` and `knowledgeSource.js` to auto-fallback to Gemini (using system API key) when user prefers Ollama but it's unavailable.

**Current Test Status**: ✅ All services running. Ready to test Knowledge Base feature (upload PDF → Generate FAQ/Mindmap/Topics).

---

## **Project Overview**
Full-stack AI-powered educational platform with gamification, knowledge management, and Socratic tutoring.

## **Tech Stack**
- **Frontend**: React (Vite) on port 3000
- **Backend**: Node.js/Express on port 5000/5001
- **Python RAG**: Flask on port 2001
- **Databases**: MongoDB, Redis, Neo4j (graph), Qdrant (vector), Elasticsearch
- **LLMs**: Gemini API (configured), Ollama (not installed)

## **Current State (All Running)**
```
Frontend: http://localhost:3000/
Backend: Port 5000 (or 5001 if conflict)
Python RAG: Port 2001 (health check: /health)
```

## **Session Fixes Applied**
1. **Installed Python deps** in `.venv` (torch, transformers, langchain, qdrant-client, etc.)
2. **Added GEMINI_API_KEY** to `server/.env`: `AIzaSyBKvLvUkqVqVbvsWtqZaEb0-xeO_97mn8Y`
3. **Fixed Ollama error**: Modified `server/routes/upload.js` & `knowledgeSource.js` to auto-fallback to Gemini when user prefers Ollama but it's unavailable

## **Key File Paths**
- Backend: `server/` (server.js, routes/, services/, workers/)
- Frontend: `frontend/src/` (components/, pages/, services/)
- Python RAG: `server/rag_service/` (app.py, ai_core.py, config.py)
- Configs: `server/.env`, `frontend/.env`

## **Core Features**
- **Knowledge Base**: Upload PDFs/URLs → generates FAQ/mindmap/topics
- **Chat Tutor**: Socratic mode with contextual memory
- **Gamification**: XP, bounties, boss battles, achievements
- **Code Executor**: Run Python/Java/C/C++ with test cases
- **Curriculum Graph**: Neo4j-based learning paths

## **Important Routes**
- Upload: `/api/upload` → triggers analysis+KG workers
- Knowledge: `/api/knowledge-sources`
- Chat: `/api/chat/:sessionId/messages`
- Gamification: `/api/gamification/*`
- Python RAG proxy: endpoints forward to Python service

## **Key Services**
- `analysisWorker.js`: Generates FAQ/mindmap/topics from uploaded docs
- `kgWorker.js`: Builds Neo4j knowledge graphs
- `ollamaService.js`: Ollama API wrapper (unused, Gemini active)
- `geminiService.js`: Gemini API calls
- Python `app.py`: 44 routes (execute_code, generate_quiz, query RAG, etc.)

## **User Hardware**
- CPU: Intel i5-1235U (10 cores, 12 threads)
- GPU: Intel UHD (integrated) → Gemini cloud preferred over local Ollama

## **Known Issues/Warnings**
- Sentry, AWS, Email disabled (optional services)
- Python RAG warns: SpaCy model, Whisper not loaded (non-blocking)
- Port 5000 may conflict → backend falls back to 5001

## **Restart Commands**
```powershell
# Frontend
Set-Location NIT-FInal-main/frontend; npm run dev

# Backend
Set-Location NIT-FInal-main/server; npm run dev

# Python RAG
Set-Location NIT-FInal-main/server/rag_service
c:/Users/Sai/Downloads/NIT-FInal-main/.venv/Scripts/python.exe app.py
```

## **Health Checks**
```powershell
# Backend
Invoke-WebRequest http://localhost:5000 -UseBasicParsing

# Python RAG
Invoke-WebRequest http://127.0.0.1:2001/health -UseBasicParsing
```

## **Troubleshooting**
- Check browser DevTools → Network tab for failed API calls
- Check logs: `server/logs/`, Python RAG console output
- Verify env vars: `server/.env`, `frontend/.env`
- Common fix: Restart all services if errors persist

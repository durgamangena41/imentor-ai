#!/bin/bash

# --- 1. Docker Cleanup & Setup (Commented out for re-runs) ---
<<'COMMENT'
echo "🛑  Cleaning up existing Docker containers and images..."
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true
docker rmi -f $(docker images -q) 2>/dev/null || true
docker volume prune -f

echo "🚀  Starting Infrastructure (Databases & Ollama)..."
docker compose -f docker-compose.dev.yml up -d

echo "⏳  Waiting for Ollama to be ready..."
sleep 5 # Give Docker a moment to spin up
echo "📥  Pulling LLM Model (qwen2.5:14b-instruct)..."
docker exec -it imentor_ollama ollama pull qwen2.5:14b-instruct
COMMENT

# --- 2. Define Commands for Tabs ---

# Note: We use 'eval "$(conda shell.bash hook)"' to ensure conda works inside the script/tab context
# We use 'exec bash' at the end to keep the terminal open if the app crashes or stops
cd server/rag_service && echo '🐍 Starting Python Service...' && conda activate imentor && pip install -r requirements.txt && python -m spacy download en_core_web_sm && python app.py

cd server && echo '🟢 Starting Node Backend...' && npm install && npm start

cd frontend && echo '⚛️  Starting React Frontend...' && npm install && mkdir -p public && cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/ && npm run dev

# --- 3. Launch Tabs based on OS ---

echo "🖥️   Opening terminals..."

nome-terminal \
        --tab --title="Python RAG" -- bash -c "$CMD_PYTHON" \
        --tab --title="Node Backend" -- bash -c "$CMD_NODE" \
        --tab --title="Frontend" -- bash -c "$CMD_FRONTEND"
        
        echo "✅  Tabs opened in Gnome Terminal."


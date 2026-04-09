@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "SERVER_DIR=%ROOT_DIR%server"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "RAG_DIR=%SERVER_DIR%rag_service"

echo Starting AI Tutor Backend Server...
start "Backend Server" cmd /k "cd /d ""%SERVER_DIR%"" && npm start"

timeout /t 5 >nul

echo Starting Frontend Development Server...
start "Frontend Server" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm install && npm run dev"

timeout /t 5 >nul

echo Starting Python RAG Service...
start "Python RAG Service" cmd /k "cd /d ""%RAG_DIR%"" && python -m pip install -r requirements.txt && python app.py"

echo All services starting...
echo - Backend: http://localhost:5000
echo - Frontend: http://localhost:5173
echo - RAG Service: http://localhost:5001

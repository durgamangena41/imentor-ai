@echo off
echo Starting AI Tutor Backend Server...
cd /d "c:\Users\Sai\Downloads\NIT-FInal-main\NIT-FInal-main\server"
start "Backend Server" cmd /k "npm start"

timeout /t 5

echo Starting Frontend Development Server...
cd /d "c:\Users\Sai\Downloads\NIT-FInal-main\NIT-FInal-main\frontend"
start "Frontend Server" cmd /k "npm install && npm run dev"

timeout /t 5

echo Starting Python RAG Service...
cd /d "c:\Users\Sai\Downloads\NIT-FInal-main\NIT-FInal-main\server\rag_service"
start "Python RAG Service" cmd /k "python -m pip install -r requirements.txt && python app.py"

echo All services starting...
echo - Backend: http://localhost:5000
echo - Frontend: http://localhost:5173
echo - RAG Service: http://localhost:5001

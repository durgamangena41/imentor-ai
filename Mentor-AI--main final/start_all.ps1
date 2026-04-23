param(
    [switch]$SkipInstalls,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param(
        [string]$Title,
        [string]$Why,
        [string]$Command
    )

    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
    Write-Host "Why: $Why" -ForegroundColor DarkCyan
    Write-Host "Command: $Command" -ForegroundColor Gray
}

function Invoke-Or-Print {
    param([string]$Command)
    if ($DryRun) {
        Write-Host "[DryRun] $Command" -ForegroundColor Yellow
    } else {
        Invoke-Expression $Command
    }
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Join-Path $Root "server"
$FrontendDir = Join-Path $Root "frontend"
$RagDir = Join-Path $ServerDir "rag_service"
$RootVenvActivate = Join-Path $Root ".venv\Scripts\Activate.ps1"

Write-Host "Project root: $Root" -ForegroundColor Green
Set-Location $Root

Write-Step -Title "Start Infrastructure + Full Observability" -Why "Boots MongoDB, Redis, Qdrant, Neo4j, Elasticsearch, Kibana, Prometheus, Grafana, and Ollama for app dependencies plus monitoring." -Command "docker compose up -d"
Invoke-Or-Print "docker compose up -d"

$backendInstall = if ($SkipInstalls) { "" } else { "npm install; " }
$frontendInstall = if ($SkipInstalls) { "" } else { "npm install; " }
$ragInstall = if ($SkipInstalls) { "" } else { "python -m pip install -r requirements.txt; " }

$backendCmd = "Set-Location '$ServerDir'; ${backendInstall}npm start"
$frontendCmd = "Set-Location '$FrontendDir'; ${frontendInstall}npm run dev"

$ragActivate = if (Test-Path $RootVenvActivate) {
    "& '$RootVenvActivate'; "
} else {
    ""
}
$ragCmd = "Set-Location '$RagDir'; ${ragActivate}${ragInstall}python app.py"

Write-Step -Title "Start Backend API" -Why "Runs Node.js API service used by login, chat, uploads, gamification, and analytics routes." -Command $backendCmd
if ($DryRun) {
    Write-Host "[DryRun] Start-Process powershell -ArgumentList -NoExit,-Command,$backendCmd" -ForegroundColor Yellow
} else {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd | Out-Null
}

Write-Step -Title "Start Frontend UI" -Why "Runs the Vite development server so you can access the web app in the browser." -Command $frontendCmd
if ($DryRun) {
    Write-Host "[DryRun] Start-Process powershell -ArgumentList -NoExit,-Command,$frontendCmd" -ForegroundColor Yellow
} else {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd | Out-Null
}

Write-Step -Title "Start Python RAG Service" -Why "Runs document/RAG endpoints consumed by uploads, summarization, and retrieval workflows." -Command $ragCmd
if ($DryRun) {
    Write-Host "[DryRun] Start-Process powershell -ArgumentList -NoExit,-Command,$ragCmd" -ForegroundColor Yellow
} else {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $ragCmd | Out-Null
}

Write-Host ""
Write-Host "All start commands have been dispatched." -ForegroundColor Green
Write-Host "Expected URLs:" -ForegroundColor Green
Write-Host "- Frontend:      http://localhost:5173" -ForegroundColor Gray
Write-Host "- Backend:       http://localhost:2000 (or fallback port shown in backend terminal)" -ForegroundColor Gray
Write-Host "- Kibana:        http://localhost:2007" -ForegroundColor Gray
Write-Host "- Prometheus:    http://localhost:2008" -ForegroundColor Gray
Write-Host "- Grafana:       http://localhost:2009" -ForegroundColor Gray
Write-Host "- Elasticsearch: http://localhost:2006" -ForegroundColor Gray
Write-Host "- Neo4j Browser: http://localhost:7474" -ForegroundColor Gray
Write-Host "- Qdrant:        http://localhost:2003" -ForegroundColor Gray

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run finished. No services were started." -ForegroundColor Yellow
}

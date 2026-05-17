# Comic Studio — One-Command Starter
# Usage: .\start.ps1

Write-Host "`n🎨 Comic Studio" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

# ── Backend ────────────────────────────────────────────────────────────────────
Write-Host "`n[1/3] Setting up backend..." -ForegroundColor Cyan

if (-not (Test-Path "backend\venv")) {
    Write-Host "  Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv backend\venv
}

Write-Host "  Installing Python dependencies..." -ForegroundColor Yellow
& backend\venv\Scripts\pip install -r backend\requirements.txt --quiet

if (-not (Test-Path "backend\.env")) {
    Copy-Item backend\.env.example backend\.env
    Write-Host "  Created backend/.env from template" -ForegroundColor Green
}

# ── Frontend ───────────────────────────────────────────────────────────────────
Write-Host "`n[2/3] Setting up frontend..." -ForegroundColor Cyan
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "  Installing npm dependencies..." -ForegroundColor Yellow
    Push-Location frontend; npm install --silent; Pop-Location
}

if (-not (Test-Path "frontend\.env.local")) {
    "NEXT_PUBLIC_API_URL=http://localhost:8000" | Out-File frontend\.env.local -Encoding UTF8
    Write-Host "  Created frontend/.env.local" -ForegroundColor Green
}

# ── Launch both servers ────────────────────────────────────────────────────────
Write-Host "`n[3/3] Starting servers..." -ForegroundColor Cyan
Write-Host "  Backend  → http://localhost:8000" -ForegroundColor Green
Write-Host "  Frontend → http://localhost:3000" -ForegroundColor Green
Write-Host "  API Docs → http://localhost:8000/docs" -ForegroundColor Green
Write-Host "`nPress Ctrl+C to stop both servers`n" -ForegroundColor DarkGray

$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    & backend\venv\Scripts\python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
}

$frontendJob = Start-Job -ScriptBlock {
    Set-Location "$using:PWD\frontend"
    npm run dev
}

try {
    while ($true) {
        Receive-Job $backendJob  | ForEach-Object { Write-Host "[API] $_" -ForegroundColor DarkCyan }
        Receive-Job $frontendJob | ForEach-Object { Write-Host "[UI]  $_" -ForegroundColor DarkGreen }
        Start-Sleep 1
    }
} finally {
    Stop-Job $backendJob, $frontendJob
    Remove-Job $backendJob, $frontendJob
    Write-Host "`nServers stopped." -ForegroundColor DarkGray
}

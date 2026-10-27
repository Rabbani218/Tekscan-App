# scripts/dev.ps1 — Menjalankan Backend FastAPI (port 7860) dan Frontend Next.js (port 3000) secara bersamaan di Windows

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TEKSCAN Development Server Runner    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$Root = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $Root "backend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Warning "Virtualenv belum ditemukan di $VenvPython. Menggunakan python sistem..."
    $VenvPython = "python"
}

# 1. Jalankan Backend Uvicorn di background process
Write-Host "`n[1/2] Menjalankan Backend FastAPI di http://localhost:7860 ..." -ForegroundColor Green
$BackendProc = Start-Process -FilePath $VenvPython `
    -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 7860 --reload" `
    -WorkingDirectory $BackendDir `
    -PassThru

Write-Host "Backend berjalan dengan Process ID: $($BackendProc.Id)" -ForegroundColor Gray

# 2. Jalankan Frontend Next.js di foreground
try {
    Write-Host "`n[2/2] Menjalankan Frontend Next.js di http://localhost:3000 ..." -ForegroundColor Green
    Set-Location $Root
    npm run dev
}
finally {
    Write-Host "`nMematikan backend process ($($BackendProc.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Server selesai." -ForegroundColor Cyan
}

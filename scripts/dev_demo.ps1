# scripts/dev_demo.ps1 — Menjalankan TEKSCAN dalam MODE DEMO di Windows (PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "======================================================" -ForegroundColor Magenta
Write-Host "        TEKSCAN — MODE DEMO (Local Development)       " -ForegroundColor Magenta
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host "PERHATIAN: Berjalan dengan model tiruan untuk pengujian" -ForegroundColor Yellow
Write-Host "jalur end-to-end sebelum model asli Colab dipasang.`n" -ForegroundColor Yellow

$Root = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $Root "backend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Warning "Virtualenv belum ditemukan di $VenvPython. Menggunakan python sistem..."
    $VenvPython = "python"
}

# Pastikan model demo telah digenerate
$DemoModelDir = Join-Path $Root "backend\models_demo"
if (-not (Test-Path $DemoModelDir)) {
    Write-Host "Menghasilkan berkas model demo..." -ForegroundColor Cyan
    & $VenvPython (Join-Path $Root "scripts\make_demo_models.py")
}

# Atur environment variable untuk sesi ini
$env:MODEL_MODE = "demo"
$env:NEXT_PUBLIC_API_URL = "http://localhost:7860"

# 1. Jalankan Backend Uvicorn di background process dengan MODEL_MODE=demo
Write-Host "[1/2] Menjalankan Backend FastAPI (MODE DEMO) di http://localhost:7860 ..." -ForegroundColor Green
$BackendProc = Start-Process -FilePath $VenvPython `
    -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 7860 --reload" `
    -WorkingDirectory $BackendDir `
    -Environment @{ "MODEL_MODE" = "demo" } `
    -PassThru

Write-Host "      Backend PID: $($BackendProc.Id)" -ForegroundColor Gray
Write-Host "      Health Check: http://localhost:7860/health" -ForegroundColor Gray
Write-Host "      Swagger Docs: http://localhost:7860/docs" -ForegroundColor Gray

# 2. Jalankan Frontend Next.js di foreground
try {
    Write-Host "`n[2/2] Menjalankan Frontend Next.js di http://localhost:3000 ..." -ForegroundColor Green
    Set-Location $Root
    npm run dev
}
finally {
    Write-Host "`nMematikan backend process ($($BackendProc.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Server selesai." -ForegroundColor Magenta
}

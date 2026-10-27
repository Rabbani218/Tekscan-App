# Skrip PowerShell untuk Serah-Terima & Validasi Model Asli dari Colab
param (
    [Parameter(Mandatory=$true, Position=0, HelpMessage="Jalur folder hasil ekspor Colab")]
    [string]$SourceDir
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "Menjalankan validasi kontrak model asli dari: $SourceDir ..." -ForegroundColor Cyan

$PythonExe = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python"
}

$PyScript = Join-Path $ScriptDir "pasang_model_asli.py"
& $PythonExe $PyScript $SourceDir

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[GAGAL] Pemasangan model dibatalkan karena kontrak tidak sesuai." -ForegroundColor Red
    exit 1
}

Write-Host "`n[SUKSES] Model asli siap digunakan dalam mode produksi (MODEL_MODE=real)." -ForegroundColor Green

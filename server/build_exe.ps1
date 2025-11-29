# Requires: PowerShell 5+, Node.js, Python 3.10+, and internet access
# Builds the frontend, then packages the Python backend + static files as a single Windows .exe

$ErrorActionPreference = 'Stop'

function Assert-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Error "Command not found: $name"
  }
}

Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Cyan
Assert-Cmd node
Assert-Cmd npm
Assert-Cmd python

Push-Location (Resolve-Path "$PSScriptRoot\..\")

Write-Host "[2/5] Installing frontend deps and building (Vite)..." -ForegroundColor Cyan
if (Test-Path package-lock.json) {
  npm ci
} else {
  npm install
}
npm run build

if (-not (Test-Path dist)) {
  throw "Frontend build failed: dist/ not found"
}

Write-Host "[3/5] Creating Python venv and installing dependencies..." -ForegroundColor Cyan
$venv = ".venv_pack"
if (-not (Test-Path $venv)) {
  python -m venv $venv
}
$py = Join-Path $venv "Scripts/python.exe"
& $py -m pip install --upgrade pip wheel setuptools
& $py -m pip install -r server/requirements.txt pyinstaller

Write-Host "[4/5] Building single-file EXE with PyInstaller..." -ForegroundColor Cyan
# Include the built frontend (dist) into the executable
& $py -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name "KR-Question-Generator" `
  --add-data "dist;dist" `
  server/app_packaged.py

Write-Host "[5/5] Done. EXE at: dist/KR-Question-Generator.exe" -ForegroundColor Green

Pop-Location

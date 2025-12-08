<#
Requires: PowerShell 5+, Node.js, Python 3.10+, and internet access
Builds the frontend and packages the Python backend + static files as a single Windows .exe.

This variant creates a timestamped EXE and includes the `dist` and `supabase` folders as bundled data.
#>

$ErrorActionPreference = 'Stop'

function Assert-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Error "Command not found: $name"
  }
}

Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Cyan
Assert-Cmd node
Assert-Cmd npm
Assert-Cmd python

Push-Location (Resolve-Path "$PSScriptRoot\..\")

Write-Host "[2/6] Installing frontend deps and building (Vite)..." -ForegroundColor Cyan
if (Test-Path package-lock.json) {
  npm ci
} else {
  npm install
}
npm run build

if (-not (Test-Path dist)) {
  throw "Frontend build failed: dist/ not found"
}

Write-Host "[3/6] Creating Python venv and installing dependencies..." -ForegroundColor Cyan
$venv = ".venv_pack"
if (-not (Test-Path $venv)) {
  python -m venv $venv
}
$py = Join-Path $venv "Scripts/python.exe"
& $py -m pip install --upgrade pip wheel setuptools
& $py -m pip install -r server/requirements.txt pyinstaller

Write-Host "[4/6] Preparing packaging options..." -ForegroundColor Cyan
$name = "KR-Question-Generator"
$timestamp = Get-Date -Format "yyyyMMddHHmm"
$exeName = "${name}-${timestamp}"

# Assemble --add-data entries (semi-colon separated dest for Windows)
$addData = @()
$addData += "dist;dist"
if (Test-Path "supabase") { $addData += "supabase;supabase" }

Write-Host "Including data: $($addData -join ', ')" -ForegroundColor Yellow

Write-Host "[5/6] Building single-file EXE with PyInstaller..." -ForegroundColor Cyan
$pyArgs = @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--name", $exeName
)

foreach ($d in $addData) { $pyArgs += "--add-data"; $pyArgs += $d }

$pyArgs += "server/app_packaged.py"

Write-Host "pyinstaller args: $pyArgs" -ForegroundColor Gray
& $py @pyArgs

Write-Host "[6/6] Done. EXE at: dist\$exeName.exe" -ForegroundColor Green

Pop-Location

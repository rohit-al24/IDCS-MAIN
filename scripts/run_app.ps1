<#
Run App Launcher

What this script does:
- Checks for Python on PATH. If missing, prompts to open Microsoft Store or python.org.
- Creates a `venv` (optional) and installs Python requirements from `server/requirements.txt`.
- Launches the backend (`server\app_local.py`) in a new PowerShell window.
- Launches the frontend using `npm run dev` in a new PowerShell window (requires Node/NPM).

Convert to EXE (optional):
- Install PS2EXE: `Install-Module -Name ps2exe -Scope CurrentUser` (requires admin or CurrentUser scope)
- Build exe: `Invoke-PS2EXE .\run_app.ps1 .\IDCS-Launcher.exe`

Notes:
- Installing Python automatically is not performed by this script; it prompts and opens Store/website for you.
- Running this script requires PowerShell (this system is Windows).
#>

function Ask-YesNo($message, $default = $true) {
    $yn = if ($default) { "Y/n" } else { "y/N" }
    while ($true) {
        $input = Read-Host "$message [$yn]"
        if ([string]::IsNullOrWhiteSpace($input)) { return $default }
        switch ($input.ToLower()) {
            'y' { return $true }
            'yes' { return $true }
            'n' { return $false }
            'no' { return $false }
            default { Write-Host "Please answer 'y' or 'n'." }
        }
    }
}

Write-Host "== IDCS App Launcher =="

# Check for python
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
    Write-Host "Python not found on PATH. You need Python to run the backend."
    $choice = Read-Host "Open Microsoft Store (s) or Browser installer page (b) or Cancel (c)? [s/b/c]"
    switch ($choice.ToLower()) {
        's' {
            Write-Host "Opening Microsoft Store..."
            Start-Process "ms-windows-store://pdp/?productid=9P7QFQMJRFP7"
            Write-Host "After installing Python, re-run this script. Exiting."
            exit 1
        }
        'b' {
            Write-Host "Opening python.org downloads page..."
            Start-Process "https://www.python.org/downloads/windows/"
            Write-Host "After installing Python, re-run this script. Exiting."
            exit 1
        }
        default {
            Write-Host "Cancelled. Please install Python and run again."; exit 1
        }
    }
}

Write-Host "Python found: $($py.Path)"

# Create venv and install requirements (optional)
$useVenv = Ask-YesNo "Create and use a virtual environment and install Python requirements?"
if ($useVenv) {
    $venvPath = Join-Path $PSScriptRoot "..\venv" | Resolve-Path -ErrorAction SilentlyContinue
    if (-not $venvPath) { $venvPath = Join-Path $PSScriptRoot "..\venv" }
    Write-Host "Creating venv at: $venvPath"
    python -m venv "$venvPath"
    $activate = Join-Path $venvPath "Scripts\Activate.ps1"
    if (Test-Path $activate) {
        Write-Host "Activating virtualenv and installing requirements..."
        & powershell -NoExit -Command "& '$activate'; python -m pip install --upgrade pip; if (Test-Path 'server\requirements.txt') { pip install -r 'server\requirements.txt' }"
    } else {
        Write-Host "Virtualenv creation failed or Activate.ps1 not found. Skipping venv activation.";
    }
} else {
    Write-Host "Installing requirements into the current Python environment..."
    if (Test-Path 'server\requirements.txt') { python -m pip install --upgrade pip; python -m pip install -r 'server\requirements.txt' }
}

# Launch backend in a new window
Write-Host "Starting backend (server\app_local.py) in a new PowerShell window..."
Start-Process powershell -ArgumentList "-NoExit -Command \"python 'server\app_local.py'\""

# Check for Node/NPM for frontend
$node = Get-Command npm -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node/NPM not found. To run the frontend you need Node.js."
    if (Ask-YesNo "Open Node.js download page? (recommended)") {
        Start-Process "https://nodejs.org/en/download/"
        Write-Host "Install Node.js and then re-run this script to start the frontend."
    } else {
        Write-Host "Skipping frontend start."
    }
} else {
    Write-Host "Starting frontend via 'npm run dev' in a new PowerShell window..."
    Start-Process powershell -ArgumentList "-NoExit -WorkingDirectory '$((Get-Location).ProviderPath)' -Command \"npm run dev\""
}

Write-Host "Launcher finished. Backend and frontend windows (if started) should be running." 

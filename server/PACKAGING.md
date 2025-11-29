Windows EXE packaging

This packages the app as a single Windows .exe that runs the FastAPI backend and serves the built React frontend. When launched, it opens http://127.0.0.1:4000 in your default browser.

Steps

1) Build the frontend and the EXE

   Run in PowerShell from the repo root:

   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\server\build_exe.ps1
   ```

   This will:
   - Install Node deps and run `npm run build` to produce `dist/`
   - Create a Python venv `.venv_pack`
   - Install backend requirements + `pyinstaller`
   - Build `dist/KR-Question-Generator.exe`

2) Run the app

   Double-click `dist/KR-Question-Generator.exe` (or run from terminal). It will start the backend on port 4000 and open your browser.

Notes
- API base URL defaults to `http://127.0.0.1:4000` via `src/config/api.ts`, which is correct for the packaged EXE.
- If you change the port or host, update `app_packaged.py` and rebuild.
- To reduce false antivirus flags, you can add `--uac-admin`/`--uac-uiaccess` options cautiously or sign the EXE.
- For multi-file packaging instead of onefile, drop `--onefile` for faster startup.

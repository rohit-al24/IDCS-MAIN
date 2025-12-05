import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

# Reuse the existing FastAPI app and routes
from server.app_local import app  # noqa: F401
from fastapi.staticfiles import StaticFiles


def resource_path(*parts: str) -> Path:
    """Resolve a data path both in dev and when frozen by PyInstaller."""
    if hasattr(sys, "_MEIPASS"):
        base = Path(getattr(sys, "_MEIPASS"))
    else:
        # project root (this file is server/app_packaged.py)
        base = Path(__file__).resolve().parent.parent
    return base.joinpath(*parts)


def mount_frontend():
    dist_dir = resource_path("dist")
    if not dist_dir.exists():
        # In dev, allow serving from exam-paper-pro-main/dist as well
        alt = resource_path("exam-paper-pro-main", "dist")
        if alt.exists():
            dist_dir = alt
    if dist_dir.exists():
        # Serve the built Vite app and let it handle client-side routing
        app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")
    else:
        # If no frontend build is found, keep backend only
        print("[packaged] No dist/ folder found. Backend APIs will run without serving frontend.")


def open_browser_when_ready(url: str):
    def _opener():
        # small delay so server is ready
        time.sleep(1.2)
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=_opener, daemon=True).start()



def main():
    mount_frontend()
    # Allow overriding port via environment variable; default to 4000 for packaged exe
    port = int(os.environ.get("PORT", "4000"))
    url = f"http://127.0.0.1:{port}"
    open_browser_when_ready(url)
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()

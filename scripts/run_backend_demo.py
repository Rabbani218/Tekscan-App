"""Jalankan backend FastAPI dalam MODE DEMO."""
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
backend_dir = root / "backend"
sys.path.insert(0, str(backend_dir))
os.environ["MODEL_MODE"] = "demo"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=7860, reload=False, app_dir=str(backend_dir))

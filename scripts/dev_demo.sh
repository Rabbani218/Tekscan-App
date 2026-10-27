#!/usr/bin/env bash
# scripts/dev_demo.sh — Menjalankan TEKSCAN dalam MODE DEMO di Linux / macOS / WSL

set -e

echo -e "\033[1;35m======================================================\033[0m"
echo -e "\033[1;35m        TEKSCAN — MODE DEMO (Local Development)       \033[0m"
echo -e "\033[1;35m======================================================\033[0m"
echo -e "\033[1;33mPERHATIAN: Berjalan dengan model tiruan untuk pengujian\033[0m"
echo -e "\033[1;33mjalur end-to-end sebelum model asli Colab dipasang.\n\033[0m"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"

if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

if [ ! -d "$ROOT_DIR/backend/models_demo" ]; then
    echo -e "\033[0;36mMenghasilkan berkas model demo...\033[0m"
    "$PYTHON_BIN" "$ROOT_DIR/scripts/make_demo_models.py"
fi

export MODEL_MODE="demo"
export NEXT_PUBLIC_API_URL="http://localhost:7860"

echo -e "\033[0;32m[1/2] Menjalankan Backend FastAPI (MODE DEMO) di http://localhost:7860 ...\033[0m"
(cd "$BACKEND_DIR" && "$PYTHON_BIN" -m uvicorn main:app --host 0.0.0.0 --port 7860 --reload) &
BACKEND_PID=$!

trap "kill $BACKEND_PID 2>/dev/null || true" EXIT INT TERM

echo -e "      Backend PID: $BACKEND_PID"
echo -e "      Health Check: http://localhost:7860/health"
echo -e "      Swagger Docs: http://localhost:7860/docs"

echo -e "\n\033[0;32m[2/2] Menjalankan Frontend Next.js di http://localhost:3000 ...\033[0m"
cd "$ROOT_DIR"
npm run dev

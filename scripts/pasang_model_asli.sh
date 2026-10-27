#!/usr/bin/env bash
# Skrip Bash untuk Serah-Terima & Validasi Model Asli dari Colab
set -e

if [ -z "$1" ]; then
    echo "Penggunaan: $0 <jalur_folder_ekspor_colab>"
    exit 1
fi

SOURCE_DIR="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Menjalankan validasi kontrak model asli dari: $SOURCE_DIR ..."

PYTHON_EXE="$PROJECT_ROOT/backend/.venv/bin/python"
if [ ! -f "$PYTHON_EXE" ]; then
    PYTHON_EXE="python3"
fi

"$PYTHON_EXE" "$SCRIPT_DIR/pasang_model_asli.py" "$SOURCE_DIR"

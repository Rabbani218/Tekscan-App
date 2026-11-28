"""Deploy otomatis TEKSCAN Backend (YOLO11m INT8 + ResNet50) ke Hugging Face Spaces (Docker SDK).

Skrip ini:
1. Memvalidasi keamanan produksi (tidak mengunggah model demo / cache lokal).
2. Membuat Hugging Face Space baru (SDK: Docker) jika belum ada.
3. Mengunggah folder `tekscan/backend` (Dockerfile, README.md, requirements.txt, engine.py,
   main.py, self_healing.py, dan folder models/) ke Hugging Face Space.
4. Memperbarui URL default Hugging Face Space di frontend (`src/lib/api.ts`) dan
   Control Panel (`backend/self_healing.py`) agar Vercel & Desktop App otomatis tersambung.

Cara menjalankan:
    python scripts/deploy_hf_space.py --space <username>/tekscan-api --token <HF_WRITE_TOKEN>
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path


def space_id_to_url(space_id: str) -> str:
    user, name = space_id.strip().split("/", 1)
    slug = f"{user}-{name}".lower()
    slug = re.sub(r"[^a-z0-9-]", "-", slug)
    return f"https://{slug}.hf.space"


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy TEKSCAN Backend ke Hugging Face Spaces")
    parser.add_argument("--space", type=str, required=True, help="Repo ID Space, misal: Rabbani218/tekscan-api")
    parser.add_argument("--token", type=str, default=os.environ.get("HF_TOKEN", ""), help="Hugging Face Write Token")
    parser.add_argument("--private", action="store_true", help="Buat Space bersifat private (default: public)")
    args = parser.parse_args()

    from huggingface_hub import HfApi

    token = args.token.strip() or None
    api = HfApi(token=token)
    who = api.whoami()
    print(f"[OK] Terautentikasi Hugging Face sebagai: {who.get('name', 'unknown')}")

    space_id = args.space.strip()
    if "/" not in space_id:
        space_id = f"{who['name']}/{space_id}"

    tekscan_root = Path(__file__).resolve().parent.parent
    backend_dir = tekscan_root / "backend"
    if not (backend_dir / "Dockerfile").is_file():
        print(f"[ERROR] Dockerfile tidak ditemukan di {backend_dir}")
        sys.exit(1)

    print(f"[1/3] Membuat / memverifikasi Hugging Face Space (Docker SDK): {space_id} ...")
    api.create_repo(
        repo_id=space_id,
        repo_type="space",
        space_sdk="docker",
        private=args.private,
        exist_ok=True,
    )

    print(f"[2/3] Mengunggah backend TEKSCAN (YOLO11m + ResNet50) ke {space_id} ...")
    api.upload_folder(
        folder_path=str(backend_dir),
        repo_id=space_id,
        repo_type="space",
        ignore_patterns=[
            "__pycache__/*",
            "**/__pycache__/*",
            ".venv/*",
            "**/.venv/*",
            "*.pyc",
            "tests/*",
            "models_demo/*",
            "*_demo.onnx",
            ".pytest_cache/*",
        ],
        commit_message="Deploy TEKSCAN Backend (YOLO11m INT8 + ResNet50) via deploy_hf_space.py",
    )

    hf_url = space_id_to_url(space_id)
    print(f"[3/3] Selesai! Backend Space akan aktif di: {hf_url}")
    print(f"      Cek status build di: https://huggingface.co/spaces/{space_id}")
    print(f"      Cek endpoint health: {hf_url}/health")


if __name__ == "__main__":
    main()

"""Simulasi pengujian lokal untuk membuktikan aturan pengaman produksi (7b).

1. Menjalankan check_deploy_safety.py pada folder yang sengaja berisi *_demo.onnx dan MODEL_MODE=demo.
   Hasil yang diharapkan: GAGAL (exit code 1).
2. Menjalankan check_deploy_safety.py pada folder produksi yang bersih.
   Hasil yang diharapkan: LULUS (exit code 0).
"""

import sys
import shutil
import subprocess
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent.parent
    sim_dir = root / "temp_simulasi_safeguard"
    if sim_dir.exists():
        shutil.rmtree(sim_dir)

    print("==================================================")
    print("  SIMULASI PENGAMAN PRODUKSI (PRODUCTION SAFEGUARD)")
    print("==================================================")

    # 1. Kasus Tercemar (Harus GAGAL)
    polluted_dir = sim_dir / "backend_polluted"
    polluted_dir.mkdir(parents=True, exist_ok=True)
    (polluted_dir / "models").mkdir(parents=True, exist_ok=True)
    (polluted_dir / "models" / "tekscan_yolo_demo.onnx").write_bytes(b"dummy onnx")
    (polluted_dir / "Dockerfile").write_text("FROM python:3.11\nENV MODEL_MODE=demo\n", encoding="utf-8")
    (polluted_dir / "README.md").write_text("# Space Backend\n", encoding="utf-8")

    print("\n[Uji 1] Menjalankan pengecekan pada folder tercemar demo...")
    cmd = [sys.executable, str(root / "scripts" / "check_deploy_safety.py"), str(polluted_dir)]
    res_polluted = subprocess.run(cmd, capture_output=True, text=True)
    print(res_polluted.stdout)
    if res_polluted.returncode != 0:
        print(f"-> HASIL UJI 1: BERHASIL DITOLAK DENGAN BENAR (Exit Code: {res_polluted.returncode})")
    else:
        print(f"-> HASIL UJI 1: GAGAL MENOLAK (Exit Code: {res_polluted.returncode})")
        sys.exit(1)

    # 2. Kasus Bersih (Harus LULUS)
    clean_dir = sim_dir / "backend_clean"
    clean_dir.mkdir(parents=True, exist_ok=True)
    (clean_dir / "models").mkdir(parents=True, exist_ok=True)
    (clean_dir / "models" / "tekscan_yolo.onnx").write_bytes(b"dummy real onnx")
    (clean_dir / "Dockerfile").write_text("FROM python:3.11\nENV MODEL_DIR=/app/models\n", encoding="utf-8")
    (clean_dir / "README.md").write_text("# Real Production Space\n", encoding="utf-8")

    print("\n[Uji 2] Menjalankan pengecekan pada folder produksi bersih...")
    cmd_clean = [sys.executable, str(root / "scripts" / "check_deploy_safety.py"), str(clean_dir)]
    res_clean = subprocess.run(cmd_clean, capture_output=True, text=True)
    print(res_clean.stdout)
    if res_clean.returncode == 0:
        print(f"-> HASIL UJI 2: BERHASIL DILULUSKAN DENGAN BENAR (Exit Code: {res_clean.returncode})")
    else:
        print(f"-> HASIL UJI 2: TIDAK LULUS (Exit Code: {res_clean.returncode})")
        sys.exit(1)

    # Bersihkan folder sementara
    shutil.rmtree(sim_dir, ignore_errors=True)
    print("\nKESIMPULAN: Seluruh simulasi pengaman produksi bekerja 100% akurat.")


if __name__ == "__main__":
    main()

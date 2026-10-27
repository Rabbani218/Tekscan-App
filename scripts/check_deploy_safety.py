"""Skrip pemeriksaan pengaman produksi sebelum deployment backend ke Hugging Face.

Aturan Keras Pengaman Produksi (Aturan 7b):
1. GAGAL jika folder yang akan dikirim ke Hugging Face (backend/) memuat berkas *_demo.onnx atau folder models_demo.
2. GAGAL jika Dockerfile atau README.md di folder backend memuat 'MODEL_MODE=demo'.

Jika ditemukan pelanggaran, skrip keluar dengan status 1 (GAGAL).
Jika bersih, skrip keluar dengan status 0 (LULUS).
"""

import sys
from pathlib import Path


def check_safety(backend_dir: Path) -> bool:
    print(f"=== PEMERIKSAAN PENGAMAN PRODUKSI UNTUK: {backend_dir} ===")
    violations = []

    if not backend_dir.exists():
        print(f"ERROR: Direktori {backend_dir} tidak ditemukan!")
        return False

    # 1. Periksa berkas *_demo.onnx
    demo_onnx_files = list(backend_dir.rglob("*_demo.onnx"))
    if demo_onnx_files:
        for f in demo_onnx_files:
            violations.append(f"Ditemukan berkas model demo terlarang: {f.relative_to(backend_dir)}")

    # 2. Periksa folder models_demo
    for p in backend_dir.rglob("models_demo"):
        if p.is_dir():
            violations.append(f"Ditemukan direktori model demo terlarang: {p.relative_to(backend_dir)}")

    # 3. Periksa konfigurasi MODEL_MODE=demo di Dockerfile atau README.md
    check_files = ["Dockerfile", "README.md"]
    for fname in check_files:
        fpath = backend_dir / fname
        if fpath.exists():
            try:
                content = fpath.read_text(encoding="utf-8", errors="ignore")
                for lineno, line in enumerate(content.splitlines(), start=1):
                    # Flag jika ada MODEL_MODE=demo
                    clean_line = line.strip().replace(" ", "").lower()
                    if "model_mode=demo" in clean_line:
                        violations.append(f"{fname}:{lineno} memuat konfigurasi 'MODEL_MODE=demo': {line.strip()}")
            except Exception as e:
                violations.append(f"Gagal membaca {fname}: {e}")

    if violations:
        print("\n[GAGAL] PENGAMAN PRODUKSI MENDETEKSI PELANGGARAN:")
        for v in violations:
            print(f"  - {v}")
        print("\nPengiriman ke Hugging Face Spaces DIBATALKAN!")
        return False

    print("\n[LULUS] Tidak ditemukan model demo atau konfigurasi MODEL_MODE=demo di Dockerfile/README. Aman untuk dideploy.")
    return True


def main():
    target_dir = sys.argv[1] if len(sys.argv) > 1 else "backend"
    backend_path = Path(target_dir).resolve()
    passed = check_safety(backend_path)
    if not passed:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()

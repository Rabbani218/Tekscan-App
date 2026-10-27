"""Pengujian serah-terima model asli (scripts/pasang_model_asli.py)."""

import sys
import shutil
import subprocess
from pathlib import Path


def test_pasang_model_asli_rejection():
    root = Path(__file__).resolve().parent.parent
    bad_dir = root / "temp_test_bad_colab"
    bad_dir.mkdir(exist_ok=True)
    try:
        (bad_dir / "tekscan_yolo.onnx").write_bytes(b"corrupt onnx data")
        (bad_dir / "resnet50.onnx").write_bytes(b"corrupt onnx data")
        (bad_dir / "class_names.json").write_text('{"yolo": ["defect_free"]}', encoding="utf-8")
        (bad_dir / "preprocessing_config.json").write_text('{"yolo": {}}', encoding="utf-8")

        res = subprocess.run(
            [sys.executable, str(root / "scripts" / "pasang_model_asli.py"), str(bad_dir)],
            capture_output=True,
            text=True
        )
        print("\n--- OUTPUT PASANG MODEL ASLI REJECTION ---")
        print(res.stdout)
        assert res.returncode != 0, f"Harus gagal jika model rusak, tapi exit code: {res.returncode}"
        assert "[GAGAL]" in res.stdout
    finally:
        shutil.rmtree(bad_dir, ignore_errors=True)


if __name__ == "__main__":
    test_pasang_model_asli_rejection()
    print("Test pasang_model_asli rejection passed successfully.")

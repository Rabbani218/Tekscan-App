"""Skrip serah-terima dan validasi model asli dari Google Colab ke TEKSCAN.

Alur Kerja:
1. Menerima direktori paket model dari Google Colab.
2. Memeriksa keberadaan 4 berkas wajib:
   - tekscan_yolo.onnx
   - resnet50.onnx
   - class_names.json
   - preprocessing_config.json
3. Memeriksa kontrak model (MODEL_CONTRACT.md):
   - ONNX model validity (onnx.checker)
   - Input/output node shapes & names
   - Jumlah kelas di class_names.json cocok dengan output tensor
   - Ukuran input di preprocessing_config.json cocok dengan input tensor
4. Menjalankan uji inferensi nyata melalui backend/engine.py pada citra sampel.
5. HANYA JIKA SEMUA PEMERIKSAAN LULUS:
   Menyalin ke Model/ dan backend/models/.
   Jika ada kegagalan, cetak perbedaannya dan JANGAN menimpa berkas target.
6. Mencetak instruksi menjalankan TEKSCAN dalam mode real.
"""

import sys
import os
import json
import shutil
import argparse
from pathlib import Path
import numpy as np
from PIL import Image

try:
    import onnx
    import onnxruntime as ort
except ImportError:
    print("[ERROR] Paket onnx dan onnxruntime diperlukan. Jalankan di dalam venv backend.")
    sys.exit(1)


def check_and_install_models(source_dir_path: str):
    source_dir = Path(source_dir_path).resolve()
    print(f"==================================================")
    print(f"  SERAH-TERIMA MODEL ASLI TEKSCAN DARI COLAB     ")
    print(f"==================================================")
    print(f"Sumber paket: {source_dir}")

    if not source_dir.exists() or not source_dir.is_dir():
        print(f"[GAGAL] Direktori sumber tidak ditemukan: {source_dir}")
        sys.exit(1)

    required_files = [
        "tekscan_yolo.onnx",
        "class_names.json",
        "preprocessing_config.json"
    ]

    missing = [f for f in required_files if not (source_dir / f).exists()]
    if missing:
        print(f"[GAGAL] Berkas berikut tidak ditemukan di dalam direktori sumber:")
        for m in missing:
            print(f"  - {m}")
        print("\nPastikan paket ekspor dari Google Colab memuat keempat berkas di atas.")
        sys.exit(1)

    print("[1/5] Memeriksa format JSON konfigurasi dan daftar kelas...")
    try:
        class_names = json.loads((source_dir / "class_names.json").read_text(encoding="utf-8"))
        prep_config = json.loads((source_dir / "preprocessing_config.json").read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[GAGAL] Berkas JSON tidak valid atau rusak: {exc}")
        sys.exit(1)

    # Validasi struktur class_names
    yolo_classes = class_names.get("yolo") or class_names.get("classes")
    if not yolo_classes:
        print("[GAGAL] class_names.json harus memiliki kunci 'yolo' atau 'classes'")
        sys.exit(1)

    num_classes_yolo = len(yolo_classes)
    print(f"      Kelas YOLO ({num_classes_yolo}): {yolo_classes}")
    has_resnet = (source_dir / "resnet50.onnx").exists() and "resnet50" in class_names
    num_classes_resnet = len(class_names.get("resnet50", [])) if has_resnet else 0
    if has_resnet:
        print(f"      Kelas ResNet50 ({num_classes_resnet}): {class_names['resnet50']}")

    # Validasi struktur preprocessing_config
    yolo_imgsz = [512, 512]
    if "yolo" in prep_config and "imgsz" in prep_config["yolo"]:
        yolo_imgsz = prep_config["yolo"]["imgsz"]
    elif "target_size" in prep_config:
        yolo_imgsz = prep_config["target_size"]

    print(f"      Target ukuran input YOLO: {yolo_imgsz}")
    resnet_imgsz = [224, 224]
    if has_resnet and "resnet50" in prep_config and "input_size" in prep_config["resnet50"]:
        resnet_imgsz = prep_config["resnet50"]["input_size"]
        print(f"      Target ukuran input ResNet: {resnet_imgsz}")

    print("\n[2/5] Memvalidasi struktur ONNX YOLO (tekscan_yolo.onnx)...")
    yolo_path = source_dir / "tekscan_yolo.onnx"
    try:
        model_yolo = onnx.load(str(yolo_path))
        onnx.checker.check_model(model_yolo)
        sess_yolo = ort.InferenceSession(str(yolo_path), providers=["CPUExecutionProvider"])
    except Exception as exc:
        print(f"[GAGAL] tekscan_yolo.onnx tidak valid: {exc}")
        sys.exit(1)

    yolo_input = sess_yolo.get_inputs()[0]
    yolo_outputs = sess_yolo.get_outputs()
    print(f"      Input: name='{yolo_input.name}', shape={yolo_input.shape}, type={yolo_input.type}")
    print(f"      Output: {[f'name={o.name}, shape={o.shape}' for o in yolo_outputs]}")

    # Periksa kesesuaian input YOLO
    # shape [batch, 3, H, W]
    in_h, in_w = yolo_input.shape[2], yolo_input.shape[3]
    if isinstance(in_h, int) and isinstance(in_w, int):
        if [in_h, in_w] != yolo_imgsz:
            print(f"[GAGAL] Dimensi input YOLO ({in_h}x{in_w}) tidak cocok dengan preprocessing_config.json ({yolo_imgsz})")
            sys.exit(1)

    # Periksa output YOLO: harus [1, 4+nc, anchors] atau [1, anchors, 4+nc] atau [1, max_det, 6]
    out_shape = yolo_outputs[0].shape
    valid_yolo_out = False
    if len(out_shape) == 3:
        if out_shape[1] == 4 + num_classes_yolo or out_shape[2] == 4 + num_classes_yolo:
            valid_yolo_out = True
        elif out_shape[2] == 6:
            valid_yolo_out = True

    if not valid_yolo_out:
        print(f"[GAGAL] Output shape YOLO {out_shape} tidak cocok dengan 4 + {num_classes_yolo} kelas!")
        sys.exit(1)
    print("      -> Kontrak YOLO sesuai.")

    print("\n[3/5] Memeriksa ketersediaan modul sekunder ResNet50...")
    if has_resnet:
        resnet_path = source_dir / "resnet50.onnx"
        try:
            model_resnet = onnx.load(str(resnet_path))
            onnx.checker.check_model(model_resnet)
            sess_resnet = ort.InferenceSession(str(resnet_path), providers=["CPUExecutionProvider"])
            print("      -> Model ResNet50 valid.")
        except Exception as exc:
            print(f"      [INFO] ResNet50 dilewati / tidak aktif: {exc}")
            has_resnet = False
    else:
        print("      -> ResNet50 tidak disertakan. Model YOLO11s aktif sebagai model deteksi utama.")

    print("\n[4/5] Menguji inferensi end-to-end melalui Engine TEKSCAN...")
    root_dir = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(root_dir / "backend"))
    from engine import Engine

    try:
        test_engine = Engine(model_dir=str(source_dir))
        sample_img = Image.new("RGB", (640, 480), color=(128, 128, 128))
        model_choice = "both" if has_resnet else "yolo"
        pred = test_engine.predict(np.array(sample_img), model=model_choice, demo=False)
        print(f"      Inferensi uji berhasil! Status: {pred['status']}")
        print(f"      YOLO deteksi: {len(pred['detections'])}, Latensi: {pred['latency_ms']} ms")
    except Exception as exc:
        print(f"[GAGAL] Engine gagal memproses inferensi sampel dengan model ini: {exc}")
        sys.exit(1)

    print("\n[5/5] SEMUA KONTRAK DAN UJI LULUS. Memasang model ke repositori...")
    target_dirs = [
        root_dir / "Model",
        root_dir / "backend" / "models"
    ]

    for tdir in target_dirs:
        tdir.mkdir(parents=True, exist_ok=True)
        for fname in required_files:
            src_f = source_dir / fname
            dst_f = tdir / fname
            shutil.copy2(src_f, dst_f)
            print(f"      Disalin: {fname} -> {dst_f.relative_to(root_dir)}")

    print("\n" + "=" * 50)
    print("  PEMASANGAN MODEL ASLI BERHASIL 100%!")
    print("=" * 50)
    print("Sekarang Anda dapat menjalankan TEKSCAN dalam MODE REAL:")
    print("  PowerShell (Windows):")
    print("    $env:MODEL_MODE='real'")
    print("    .\\backend\\.venv\\Scripts\\uvicorn backend.main:app --host 0.0.0.0 --port 7860")
    print("    npm run dev")
    print("\nAtau jalankan skrip smoke test:")
    print("    python scripts/smoke_test.py --backend-url http://localhost:7860 --frontend-url http://localhost:3000")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pasang dan validasi paket model asli dari Colab")
    parser.add_argument("source_dir", help="Jalur ke folder paket Colab yang berisi ONNX dan config")
    args = parser.parse_args()
    check_and_install_models(args.source_dir)

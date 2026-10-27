"""Uji kesamaan output antara model PyTorch/ultralytics dan ONNX Runtime TEKSCAN.

Memeriksa toleransi:
- Selisih skor deteksi maksimum < 0.01
- Jumlah kotak deteksi sama persis
"""
import argparse
import sys
from pathlib import Path
import numpy as np

# Tambahkan backend ke sys.path untuk impor engine
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from engine import Engine, decode_image


def test_parity(yolo_pt_path: Path, onnx_model_dir: Path, test_images_dir: Path):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Ultralytics belum terpasang. Pasang dengan `pip install ultralytics`.")
        return False

    print("Memuat Engine ONNX...")
    engine = Engine(onnx_model_dir)

    print("Memuat model PyTorch YOLO...")
    pt_model = YOLO(str(yolo_pt_path))

    images = list(test_images_dir.glob("*.jpg")) + list(test_images_dir.glob("*.png"))
    if not images:
        print(f"Tidak ada gambar pengujian di {test_images_dir}")
        return False

    print(f"\nMenjalankan uji kesamaan pada {len(images)} gambar:")
    print(f"{'Gambar':<25} | {'Box PT':<8} | {'Box ONNX':<8} | {'Diff Max Score':<15} | {'Status':<10}")
    print("-" * 75)

    all_passed = True

    for img_path in images:
        raw_bytes = img_path.read_bytes()
        img_rgb = decode_image(raw_bytes)

        # 1. Hasil ONNX
        onnx_dets = engine.detect(img_rgb)

        # 2. Hasil PyTorch Ultralytics
        c = engine.cfg.yolo
        pt_res = pt_model.predict(
            source=img_rgb,
            imgsz=c.imgsz,
            conf=c.conf_threshold,
            iou=c.iou_threshold,
            max_det=c.max_det,
            verbose=False
        )[0]

        pt_boxes = pt_res.boxes
        pt_count = len(pt_boxes)
        onnx_count = len(onnx_dets)

        box_match = (pt_count == onnx_count)
        
        diff_score = 0.0
        if pt_count > 0 and onnx_count > 0:
            pt_top_score = float(pt_boxes.conf.max().item()) if pt_count > 0 else 0.0
            onnx_top_score = onnx_dets[0]["score"] if onnx_count > 0 else 0.0
            diff_score = abs(pt_top_score - onnx_top_score)
        
        score_ok = diff_score < 0.01
        passed = box_match and score_ok

        if not passed:
            all_passed = False

        status_str = "LULUS" if passed else "GAGAL"
        print(f"{img_path.name:<25} | {pt_count:<8} | {onnx_count:<8} | {diff_score:<15.5f} | {status_str:<10}")

    print("-" * 75)
    if all_passed:
        print("SEMUA UJI KESAMAAN LULUS (Toleransi selisih skor < 0.01 & jumlah kotak sama).")
    else:
        print("BEBERAPA UJI KESAMAAN GAGAL!")
    return all_passed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Uji kesamaan PyTorch vs ONNX")
    parser.add_argument("--yolo-pt", required=True, type=Path)
    parser.add_argument("--onnx-dir", required=True, type=Path)
    parser.add_argument("--images-dir", required=True, type=Path)
    args = parser.parse_args()

    ok = test_parity(args.yolo_pt, args.onnx_dir, args.images_dir)
    sys.exit(0 if ok else 1)

"""Skrip Pelatihan & Ekspor Model YOLO11m (Medium) untuk TEKSCAN (6 Kelas Cacat Tekstil).

Gunakan di Google Colab (GPU T4/A100) atau PC lokal dengan CUDA untuk melatih ulang
bobot YOLO11m dari `yolo11m.pt` pada dataset tekstil Anda, lalu otomatis mengekspor
ke `tekscan_yolo.onnx` + kuantisasi INT8 agar ringan dan cepat di CPU.

Contoh penggunaan:
    python scripts/train_yolo11m.py --data path/to/data.yaml --epochs 80 --imgsz 512
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Latih & ekspor YOLO11m ONNX untuk TEKSCAN")
    parser.add_argument("--data", type=str, required=True, help="Path ke file data.yaml (6 kelas)")
    parser.add_argument("--weights", type=str, default="yolo11m.pt", help="Bobot awal (default: yolo11m.pt)")
    parser.add_argument("--epochs", type=int, default=80, help="Jumlah epoch pelatihan")
    parser.add_argument("--imgsz", type=int, default=512, help="Ukuran input (default: 512)")
    parser.add_argument("--batch", type=int, default=16, help="Ukuran batch")
    parser.add_argument("--out", type=str, default="backend/models", help="Folder tujuan ekspor ONNX")
    parser.add_argument("--quantize", action="store_true", help="Kuantisasi INT8 untuk kecepatan CPU optimal")
    args = parser.parse_args()

    from ultralytics import YOLO

    model = YOLO(args.weights)
    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project="runs/tekscan_yolo11m",
        name="yolo11m_textile_6cls",
        patience=20,
        cos_lr=True,
        mosaic=0.8,
        mixup=0.1,
    )
    best_pt = Path(results.save_dir) / "weights" / "best.pt"
    trained = YOLO(str(best_pt))
    onnx_path = Path(trained.export(format="onnx", imgsz=args.imgsz, opset=12, simplify=True))

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / "tekscan_yolo.onnx"

    if args.quantize:
        from onnxruntime.quantization import QuantType, quantize_dynamic
        quantize_dynamic(str(onnx_path), str(target), weight_type=QuantType.QUInt8)
        print(f"[OK] YOLO11m INT8 ONNX diekspor ke: {target}")
    else:
        shutil.copy2(onnx_path, target)
        print(f"[OK] YOLO11m FP32 ONNX diekspor ke: {target}")


if __name__ == "__main__":
    main()

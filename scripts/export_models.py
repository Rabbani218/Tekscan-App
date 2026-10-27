"""Ekspor model TEKSCAN ke ONNX + tulis class_names.json dan preprocessing_config.json (schema 2).

Jalankan di Colab (atau lokal) setelah pelatihan. Semua nilai praproses diambil dari
model itu sendiri (YOLO: train_args.imgsz & names) atau WAJIB diberikan eksplisit sesuai
transform pelatihan (ResNet50: --mean/--std/--resize-mode/...). Tidak ada nilai tebakan.

Contoh (model TEKSCAN):
  python scripts/export_models.py --out Model \
      --yolo-pt runs/detect/train/weights/best.pt \
      --resnet-weights resnet50_best.pth \
      --resnet-classes defect_free hole lines stain \
      --resnet-input-size 224 --resnet-resize-mode resize_shorter_center_crop --resnet-resize-shorter 256 \
      --resnet-mean 0.485 0.456 0.406 --resnet-std 0.229 0.224 0.225 \
      --clean-class defect_free

Hasil di --out: tekscan_yolo.onnx, resnet50.onnx, class_names.json, preprocessing_config.json
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


def export_yolo(pt: Path, out_dir: Path, imgsz_arg: Optional[int]) -> Dict[str, Any]:
    from ultralytics import YOLO

    model = YOLO(str(pt))
    if model.task != "detect":
        sys.exit(f"{pt} adalah model task '{model.task}', bukan 'detect'.")
    train_imgsz = (model.ckpt or {}).get("train_args", {}).get("imgsz") if hasattr(model, "ckpt") else None
    imgsz = imgsz_arg or train_imgsz
    if imgsz is None:
        sys.exit("imgsz tidak ada di checkpoint; berikan --yolo-imgsz sesuai pelatihan.")
    if imgsz_arg and train_imgsz and imgsz_arg != train_imgsz:
        print(f"PERINGATAN: --yolo-imgsz {imgsz_arg} berbeda dengan train_args.imgsz {train_imgsz}")
    onnx_path = Path(model.export(format="onnx", imgsz=imgsz, dynamic=False, simplify=False, nms=False, opset=17))
    dst = out_dir / "tekscan_yolo.onnx"
    shutil.copyfile(onnx_path, dst)
    names = [model.names[i] for i in sorted(model.names)]
    h, w = (imgsz, imgsz) if isinstance(imgsz, int) else (int(imgsz[0]), int(imgsz[1]))
    print(f"YOLO -> {dst} imgsz={(h, w)} names={names}")
    return {
        "names": names,
        "config": {
            "file": dst.name,
            "imgsz": [h, w],
            "input_range": "0-1",
            "channel_order": "RGB",
            "layout": "NCHW",
            "letterbox_pad_value": 114,
            "conf_threshold": 0.25,
            "iou_threshold": 0.5,
            "max_det": 300,
        },
    }


def _load_resnet(path: Path, num_classes: int):
    import torch
    import torchvision

    obj = torch.load(str(path), map_location="cpu", weights_only=False)
    if isinstance(obj, torch.nn.Module):
        return obj
    if isinstance(obj, dict):
        for k in ("model_state_dict", "state_dict", "model"):
            if k in obj and isinstance(obj[k], dict):
                obj = obj[k]
                break
        obj = {k.replace("module.", "", 1): v for k, v in obj.items()}
        model = torchvision.models.resnet50(num_classes=num_classes)
        model.load_state_dict(obj, strict=True)
        return model
    sys.exit(f"Format bobot ResNet50 tidak dikenal: {type(obj)}. Simpan dengan torch.save(model) atau state_dict.")


def export_resnet(args: argparse.Namespace, out_dir: Path) -> Dict[str, Any]:
    import torch
    import torchvision

    if args.resnet_torchvision_imagenet:
        # Hanya untuk verifikasi pipeline: semua nilai praproses dibaca dari metadata bobot torchvision.
        weights = torchvision.models.ResNet50_Weights.IMAGENET1K_V2
        model = torchvision.models.resnet50(weights=weights)
        t = weights.transforms()
        names = list(weights.meta["categories"])
        size = int(t.crop_size[0])
        cfg = {
            "resize": {"mode": "resize_shorter_center_crop", "shorter": int(t.resize_size[0])},
            "input_size": [size, size],
            "interpolation": t.interpolation.value,
            "mean": list(t.mean),
            "std": list(t.std),
        }
    else:
        missing = [n for n in ("resnet_classes", "resnet_input_size", "resnet_resize_mode", "resnet_mean", "resnet_std")
                   if getattr(args, n) is None]
        if missing:
            sys.exit("Untuk --resnet-weights wajib diberikan (sesuai transform pelatihan): "
                     + ", ".join("--" + m.replace("_", "-") for m in missing))
        if args.resnet_resize_mode == "resize_shorter_center_crop" and args.resnet_resize_shorter is None:
            sys.exit("--resnet-resize-shorter wajib untuk mode resize_shorter_center_crop.")
        names = list(args.resnet_classes)
        model = _load_resnet(Path(args.resnet_weights), len(names))
        resize: Dict[str, Any] = {"mode": args.resnet_resize_mode}
        if args.resnet_resize_mode == "resize_shorter_center_crop":
            resize["shorter"] = args.resnet_resize_shorter
        cfg = {
            "resize": resize,
            "input_size": [args.resnet_input_size, args.resnet_input_size],
            "interpolation": args.resnet_interpolation,
            "mean": args.resnet_mean,
            "std": args.resnet_std,
        }
    model.eval()
    size = cfg["input_size"]
    example = torch.zeros(1, 3, size[0], size[1])  # hanya untuk tracing grafik ekspor
    dst = out_dir / "resnet50.onnx"
    torch.onnx.export(model, example, str(dst), input_names=["input"], output_names=["logits"],
                      opset_version=17, dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}}, dynamo=False)
    print(f"ResNet50 -> {dst} input={size} classes={len(names)}")
    cfg.update({"file": dst.name, "channel_order": "RGB", "layout": "NCHW", "output": "logits"})
    return {"names": names, "config": cfg}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--yolo-pt", type=Path)
    ap.add_argument("--yolo-imgsz", type=int)
    ap.add_argument("--resnet-weights", type=Path)
    ap.add_argument("--resnet-torchvision-imagenet", action="store_true",
                    help="Verifikasi pipeline saja: ResNet50 ImageNet torchvision (BUKAN model TEKSCAN).")
    ap.add_argument("--resnet-classes", nargs="+", help="Urutan kelas PERSIS seperti indeks pelatihan.")
    ap.add_argument("--resnet-input-size", type=int)
    ap.add_argument("--resnet-resize-mode", choices=["resize", "resize_shorter_center_crop"])
    ap.add_argument("--resnet-resize-shorter", type=int)
    ap.add_argument("--resnet-interpolation", default="bilinear", choices=["bilinear", "bicubic", "nearest"])
    ap.add_argument("--resnet-mean", type=float, nargs=3)
    ap.add_argument("--resnet-std", type=float, nargs=3)
    ap.add_argument("--clean-class", help="Nama kelas 'bersih' di ResNet50 (mis. defect_free).")
    ap.add_argument("--defect-threshold", type=float, default=0.5)
    ap.add_argument("--verify-threshold", type=float, default=0.25)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    cfg_path, names_path = args.out / "preprocessing_config.json", args.out / "class_names.json"
    cfg: Dict[str, Any] = json.loads(cfg_path.read_text()) if cfg_path.is_file() else {}
    names: Dict[str, List[str]] = json.loads(names_path.read_text()) if names_path.is_file() else {}
    if cfg.get("schema_version") != 2 or not isinstance(names, dict):
        cfg, names = {}, {}
    cfg["schema_version"] = 2

    if args.yolo_pt:
        y = export_yolo(args.yolo_pt, args.out, args.yolo_imgsz)
        cfg["yolo"], names["yolo"] = y["config"], y["names"]
    if args.resnet_weights or args.resnet_torchvision_imagenet:
        r = export_resnet(args, args.out)
        cfg["resnet50"], names["resnet50"] = r["config"], r["names"]
        if args.clean_class is None:
            sys.exit("--clean-class wajib bersama ResNet50.")
        if args.clean_class not in r["names"]:
            sys.exit(f"--clean-class '{args.clean_class}' tidak ada di kelas ResNet50.")
    if "yolo" not in cfg and "resnet50" not in cfg:
        sys.exit("Berikan --yolo-pt dan/atau --resnet-weights.")
    cfg["status"] = {
        "defect_threshold": args.defect_threshold,
        "verify_threshold": args.verify_threshold,
        "clean_class": args.clean_class if args.clean_class else cfg.get("status", {}).get("clean_class"),
    }
    cfg_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    names_path.write_text(json.dumps(names, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Ditulis: {cfg_path}, {names_path}")


if __name__ == "__main__":
    main()

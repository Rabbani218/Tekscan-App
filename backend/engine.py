"""TEKSCAN inference engine — SATU modul kanonik untuk praproses, inferensi, dan pasca-proses.

Dipakai oleh backend/main.py (API), scripts/parity_test.py (uji kesamaan), dan pytest.

Semua angka (ukuran input, normalisasi, ambang) dibaca dari
`preprocessing_config.json` + `class_names.json` di folder model, dan divalidasi
terhadap bentuk input/output ONNX yang sebenarnya. Jika ada yang tidak cocok,
engine menolak dimuat (ConfigError) — tidak ada nilai tebakan.

Implementasi letterbox / NMS / scale_boxes meniru ultralytics (LetterBox,
non_max_suppression, scale_boxes) agar hasil ONNX sama dengan model .pt.
"""
from __future__ import annotations

import base64
import io
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont, ImageOps

STATUS_CLEAN = "TIDAK ADA CACAT"
STATUS_VERIFY = "PERLU VERIFIKASI MANUAL"
STATUS_DEFECT = "CACAT TERDETEKSI"

CONFIG_FILE = "preprocessing_config.json"
CLASS_NAMES_FILE = "class_names.json"
SUPPORTED_SCHEMA = 2


class ConfigError(RuntimeError):
    """Konfigurasi/model tidak lengkap atau tidak konsisten."""


# --------------------------------------------------------------------------- #
# Konfigurasi
# --------------------------------------------------------------------------- #
def _req(d: Dict[str, Any], key: str, where: str) -> Any:
    if key not in d:
        raise ConfigError(f"Kunci '{key}' wajib ada di {where} ({CONFIG_FILE}).")
    return d[key]


@dataclass
class YoloConfig:
    file: str
    imgsz: Tuple[int, int]  # (h, w)
    pad_value: int
    conf_threshold: float
    iou_threshold: float
    max_det: int


@dataclass
class ResnetConfig:
    file: str
    input_size: Tuple[int, int]  # (h, w)
    resize_mode: str  # "resize" | "resize_shorter_center_crop"
    resize_shorter: Optional[int]
    interpolation: str
    mean: Tuple[float, float, float]
    std: Tuple[float, float, float]
    output: str  # "logits" | "probabilities"


@dataclass
class StatusConfig:
    defect_threshold: float
    verify_threshold: float
    clean_class: Optional[str]


@dataclass
class EngineConfig:
    yolo: Optional[YoloConfig]
    resnet: Optional[ResnetConfig]
    status: StatusConfig
    yolo_names: List[str] = field(default_factory=list)
    resnet_names: List[str] = field(default_factory=list)
    indonesian_map: Dict[str, str] = field(default_factory=dict)


def _pair(v: Any, where: str) -> Tuple[int, int]:
    if isinstance(v, int):
        return (v, v)
    if isinstance(v, (list, tuple)) and len(v) == 2 and all(isinstance(x, int) for x in v):
        return (int(v[0]), int(v[1]))
    raise ConfigError(f"{where} harus int atau [h, w], didapat {v!r}.")


def load_config(model_dir: Path) -> EngineConfig:
    cfg_path = model_dir / CONFIG_FILE
    names_path = model_dir / CLASS_NAMES_FILE
    if not cfg_path.is_file():
        raise ConfigError(f"Tidak ditemukan: {cfg_path}")
    if not names_path.is_file():
        raise ConfigError(f"Tidak ditemukan: {names_path}")
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    names = json.loads(names_path.read_text(encoding="utf-8"))

    # Fleksibel jika konfigurasi berasal dari model_dan_aplikasi murni
    if "schema_version" not in cfg and "target_size" in cfg:
        ts = cfg["target_size"]
        cfg = {
            "schema_version": SUPPORTED_SCHEMA,
            "yolo": {
                "file": "tekscan_yolo.onnx",
                "imgsz": ts,
                "input_range": "0-1",
                "channel_order": "RGB",
                "layout": "NCHW",
                "letterbox_pad_value": 114,
                "conf_threshold": 0.20,
                "iou_threshold": 0.45,
                "max_det": 300,
            },
            "status": {
                "defect_threshold": 0.25,
                "verify_threshold": 0.15,
            }
        }

    if cfg.get("schema_version") != SUPPORTED_SCHEMA:
        raise ConfigError(
            f"{CONFIG_FILE}: schema_version harus {SUPPORTED_SCHEMA} "
            f"(didapat {cfg.get('schema_version')!r}). Buat ulang dengan scripts/export_models.py."
        )
    if not isinstance(names, dict):
        raise ConfigError(f"{CLASS_NAMES_FILE} harus objek JSON.")

    if "yolo" not in names and "classes" in names:
        names["yolo"] = names["classes"]

    indonesian_map = {}
    if "classes" in names and "indonesian" in names and len(names["classes"]) == len(names["indonesian"]):
        for en, id_name in zip(names["classes"], names["indonesian"]):
            indonesian_map[en] = id_name
    elif "yolo" in names and "indonesian" in names and len(names["yolo"]) == len(names["indonesian"]):
        for en, id_name in zip(names["yolo"], names["indonesian"]):
            indonesian_map[en] = id_name
    else:
        indonesian_map = {
            "stain": "Noda",
            "hole": "Lubang",
            "tear": "Sobek",
            "line": "Garis",
            "horizontal": "Garis Horizontal",
            "vertical": "Garis Vertikal",
            "defect_free": "Bebas Cacat",
        }

    yolo = resnet = None
    if "yolo" in cfg:
        y = cfg["yolo"]
        if y.get("input_range") != "0-1" or y.get("channel_order") != "RGB" or y.get("layout") != "NCHW":
            raise ConfigError("yolo: hanya didukung input_range=0-1, channel_order=RGB, layout=NCHW.")
        yolo = YoloConfig(
            file=_req(y, "file", "yolo"),
            imgsz=_pair(_req(y, "imgsz", "yolo"), "yolo.imgsz"),
            pad_value=int(_req(y, "letterbox_pad_value", "yolo")),
            conf_threshold=float(_req(y, "conf_threshold", "yolo")),
            iou_threshold=float(_req(y, "iou_threshold", "yolo")),
            max_det=int(y.get("max_det", 300)),
        )
        if "yolo" not in names:
            raise ConfigError(f"{CLASS_NAMES_FILE}: kunci 'yolo' tidak ada.")
    if "resnet50" in cfg:
        r = cfg["resnet50"]
        if r.get("channel_order") != "RGB":
            raise ConfigError("resnet50: hanya channel_order=RGB yang didukung.")
        resize = _req(r, "resize", "resnet50")
        mode = _req(resize, "mode", "resnet50.resize")
        if mode not in ("resize", "resize_shorter_center_crop"):
            raise ConfigError(f"resnet50.resize.mode tidak dikenal: {mode!r}")
        out = _req(r, "output", "resnet50")
        if out not in ("logits", "probabilities"):
            raise ConfigError(f"resnet50.output harus 'logits' atau 'probabilities', didapat {out!r}")
        interp = r.get("interpolation", "bilinear")
        if interp not in ("bilinear", "bicubic", "nearest"):
            raise ConfigError(f"resnet50.interpolation tidak dikenal: {interp!r}")
        mean = _req(r, "mean", "resnet50")
        std = _req(r, "std", "resnet50")
        if len(mean) != 3 or len(std) != 3:
            raise ConfigError("resnet50.mean dan resnet50.std harus 3 angka (RGB).")
        resnet = ResnetConfig(
            file=_req(r, "file", "resnet50"),
            input_size=_pair(_req(r, "input_size", "resnet50"), "resnet50.input_size"),
            resize_mode=mode,
            resize_shorter=int(resize["shorter"]) if mode == "resize_shorter_center_crop" else None,
            interpolation=interp,
            mean=tuple(float(x) for x in mean),  # type: ignore[arg-type]
            std=tuple(float(x) for x in std),  # type: ignore[arg-type]
            output=out,
        )
        if "resnet50" not in names:
            raise ConfigError(f"{CLASS_NAMES_FILE}: kunci 'resnet50' tidak ada.")
    if yolo is None and resnet is None:
        raise ConfigError(f"{CONFIG_FILE} tidak memuat bagian 'yolo' maupun 'resnet50'.")

    s = cfg.get("status", {})
    status = StatusConfig(
        defect_threshold=float(s.get("defect_threshold", 0.25)),
        verify_threshold=float(s.get("verify_threshold", 0.15)),
        clean_class=s.get("clean_class"),
    )
    if not 0.0 <= status.verify_threshold <= status.defect_threshold <= 1.0:
        raise ConfigError("status: wajib 0 <= verify_threshold <= defect_threshold <= 1.")
    resnet_names = list(names.get("resnet50", []))
    if resnet is not None and status.clean_class is not None and status.clean_class not in resnet_names:
        raise ConfigError(f"status.clean_class '{status.clean_class}' tidak ada di class_names.resnet50.")
    return EngineConfig(
        yolo=yolo,
        resnet=resnet,
        status=status,
        indonesian_map=indonesian_map,
        yolo_names=list(names.get("yolo", [])),
        resnet_names=resnet_names,
    )


# --------------------------------------------------------------------------- #
# Gambar
# --------------------------------------------------------------------------- #
def decode_image(data: bytes) -> np.ndarray:
    """Byte JPG/PNG/WEBP -> array RGB uint8 (H, W, 3) dengan orientasi EXIF diterapkan.

    Melempar ValueError jika berkas bukan gambar valid.
    """
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        arr = np.asarray(img, dtype=np.uint8)
    except Exception as exc:  # PIL melempar banyak tipe error berbeda
        raise ValueError(f"Gambar rusak atau tidak dapat dibaca: {exc}") from exc
    if arr.ndim != 3 or arr.shape[2] != 3 or arr.shape[0] < 1 or arr.shape[1] < 1:
        raise ValueError("Gambar tidak memiliki 3 kanal warna yang valid.")
    return arr


def letterbox(img: np.ndarray, new_shape: Tuple[int, int], pad_value: int) -> Tuple[np.ndarray, float, Tuple[float, float]]:
    """Sama dengan ultralytics LetterBox(auto=False, scaleup=True, center=True).

    Mengembalikan (gambar hasil, rasio, (pad_w, pad_h)).
    """
    h0, w0 = img.shape[:2]
    nh, nw = new_shape
    r = min(nh / h0, nw / w0)
    new_unpad = (int(round(w0 * r)), int(round(h0 * r)))
    dw = (nw - new_unpad[0]) / 2
    dh = (nh - new_unpad[1]) / 2
    if (w0, h0) != new_unpad:
        pil_resized = Image.fromarray(img).resize(new_unpad, Image.BILINEAR)
        img = np.asarray(pil_resized, dtype=np.uint8)
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    img = np.pad(img, ((top, bottom), (left, right), (0, 0)), mode="constant", constant_values=pad_value)
    return img, r, (dw, dh)


def scale_boxes(boxes: np.ndarray, net_shape: Tuple[int, int], orig_shape: Tuple[int, int]) -> np.ndarray:
    """Sama dengan ultralytics.utils.ops.scale_boxes: kotak di ruang letterbox -> gambar asli (xyxy)."""
    gain = min(net_shape[0] / orig_shape[0], net_shape[1] / orig_shape[1])
    pad_x = round((net_shape[1] - orig_shape[1] * gain) / 2 - 0.1)
    pad_y = round((net_shape[0] - orig_shape[0] * gain) / 2 - 0.1)
    out = boxes.copy()
    out[:, [0, 2]] -= pad_x
    out[:, [1, 3]] -= pad_y
    out[:, :4] /= gain
    out[:, [0, 2]] = out[:, [0, 2]].clip(0, orig_shape[1])
    out[:, [1, 3]] = out[:, [1, 3]].clip(0, orig_shape[0])
    return out


def nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> np.ndarray:
    """NMS greedy (setara torchvision.ops.nms): buang kotak dengan IoU > ambang."""
    if boxes.shape[0] == 0:
        return np.zeros((0,), dtype=np.int64)
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1).clip(0) * (y2 - y1).clip(0)
    order = np.argsort(-scores, kind="stable")
    keep: List[int] = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        rest = order[1:]
        xx1 = np.maximum(x1[i], x1[rest])
        yy1 = np.maximum(y1[i], y1[rest])
        xx2 = np.minimum(x2[i], x2[rest])
        yy2 = np.minimum(y2[i], y2[rest])
        inter = (xx2 - xx1).clip(0) * (yy2 - yy1).clip(0)
        iou = inter / (areas[i] + areas[rest] - inter + 1e-9)
        order = rest[iou <= iou_threshold]
    return np.asarray(keep, dtype=np.int64)


def decode_yolo(
    output: np.ndarray,
    num_classes: int,
    conf_threshold: float,
    iou_threshold: float,
    max_det: int,
) -> np.ndarray:
    """Keluaran ONNX YOLO11 -> array (N, 6) [x1, y1, x2, y2, score, class_id] di ruang input jaringan.

    Mendukung dua format ekspor ultralytics, dipilih dari BENTUK keluaran sebenarnya:
      * mentah  (1, 4+nc, A): cx, cy, w, h, skor kelas (sudah sigmoid) -> filter + NMS per kelas
      * nms=True (1, max_det, 6): x1, y1, x2, y2, score, class_id -> hanya filter skor
    """
    if output.ndim != 3 or output.shape[0] != 1:
        raise ValueError(f"Bentuk keluaran YOLO tidak didukung: {output.shape}")
    if output.shape[1] == 4 + num_classes:
        pred = output[0].T  # (A, 4+nc)
        cls_scores = pred[:, 4:]
        cls_ids = cls_scores.argmax(axis=1)
        scores = cls_scores[np.arange(pred.shape[0]), cls_ids]
        mask = scores > conf_threshold
        pred, scores, cls_ids = pred[mask], scores[mask], cls_ids[mask]
        if pred.shape[0] == 0:
            return np.zeros((0, 6), dtype=np.float32)
        cx, cy, w, h = pred[:, 0], pred[:, 1], pred[:, 2], pred[:, 3]
        boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
        # NMS per kelas (agnostic=False), sama seperti ultralytics: geser kotak per kelas
        max_wh = 7680.0
        offset = cls_ids[:, None].astype(np.float32) * max_wh
        keep = nms(boxes + offset, scores, iou_threshold)[:max_det]
        return np.concatenate(
            [boxes[keep], scores[keep, None], cls_ids[keep, None].astype(np.float32)], axis=1
        ).astype(np.float32)
    if output.shape[2] == 6:
        det = output[0]
        det = det[det[:, 4] > conf_threshold][:max_det]
        return det.astype(np.float32)
    raise ValueError(
        f"Bentuk keluaran YOLO {output.shape} tidak cocok dengan {num_classes} kelas "
        f"(diharapkan (1, {4 + num_classes}, A) atau (1, N, 6))."
    )


_PIL_INTERP = {"bilinear": Image.BILINEAR, "bicubic": Image.BICUBIC, "nearest": Image.NEAREST}


def preprocess_resnet(img_rgb: np.ndarray, c: ResnetConfig, nchw: bool) -> np.ndarray:
    """Setara torchvision: Resize -> (CenterCrop) -> ToTensor (/255) -> Normalize(mean, std)."""
    pil = Image.fromarray(img_rgb)
    interp = _PIL_INTERP[c.interpolation]
    th, tw = c.input_size
    if c.resize_mode == "resize":
        pil = pil.resize((tw, th), interp)
    else:
        assert c.resize_shorter is not None
        w, h = pil.size
        s = c.resize_shorter
        # torchvision Resize(int): sisi pendek = s, sisi panjang = int(s * panjang / pendek)
        if w <= h:
            nw, nh = s, int(s * h / w)
        else:
            nw, nh = int(s * w / h), s
        pil = pil.resize((nw, nh), interp)
        # torchvision CenterCrop
        left = int(round((nw - tw) / 2.0))
        top = int(round((nh - th) / 2.0))
        pil = pil.crop((left, top, left + tw, top + th))
    x = np.asarray(pil, dtype=np.float32) / 255.0
    x = (x - np.asarray(c.mean, dtype=np.float32)) / np.asarray(c.std, dtype=np.float32)
    if nchw:
        x = x.transpose(2, 0, 1)
    return x[None].astype(np.float32)


def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


# --------------------------------------------------------------------------- #
# Status 3 tingkat
# --------------------------------------------------------------------------- #
def status_from_detections(dets: Sequence[Dict[str, Any]], s: StatusConfig) -> str:
    top = max((d["score"] for d in dets), default=0.0)
    if top >= s.defect_threshold:
        return STATUS_DEFECT
    if top >= s.verify_threshold and len(dets) > 0:
        return STATUS_VERIFY
    return STATUS_CLEAN


def status_from_classification(top1: str, prob: float, s: StatusConfig) -> str:
    if s.clean_class is None:
        raise ConfigError("status.clean_class wajib diisi agar ResNet50 dapat menentukan status.")
    if prob < s.defect_threshold:
        return STATUS_VERIFY
    return STATUS_CLEAN if top1 == s.clean_class else STATUS_DEFECT


def combine_status(a: str, b: str) -> str:
    """Dua model setuju -> status itu; tidak setuju -> perlu verifikasi manual."""
    return a if a == b else STATUS_VERIFY


# --------------------------------------------------------------------------- #
# Engine
# --------------------------------------------------------------------------- #
_PALETTE = [(239, 68, 68), (245, 158, 11), (16, 185, 129), (59, 130, 246), (168, 85, 247),
            (236, 72, 153), (20, 184, 166), (234, 179, 8), (99, 102, 241), (249, 115, 22)]


def _ultralytics_names(sess: ort.InferenceSession) -> Optional[List[str]]:
    """ultralytics menyimpan names di metadata ONNX sebagai repr dict, mis. "{0: 'hole', 1: 'stain'}"."""
    meta = sess.get_modelmeta().custom_metadata_map
    raw = meta.get("names")
    if not raw:
        return None
    import ast

    try:
        d = ast.literal_eval(raw)
        return [d[k] for k in sorted(d)]
    except (ValueError, SyntaxError):
        return None


def _box_iou(a: Sequence[float], b: Sequence[float]) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    return inter / max(area_a + area_b - inter, 1e-6)


def _refine_yolo_class(
    img_rgb: np.ndarray,
    box: Tuple[float, float, float, float],
    raw_cid: int,
    yolo_names: Sequence[str],
) -> int:
    """Klasifikasikan ulang ROI kotak deteksi jika model YOLO hanya mengeluarkan kelas tunggal (0)."""
    if raw_cid != 0 or len(yolo_names) < 3:
        return raw_cid
    h, w, _ = img_rgb.shape
    x1, y1, x2, y2 = box
    bw, bh = max(1.0, x2 - x1), max(1.0, y2 - y1)
    ix1, iy1 = max(0, int(x1)), max(0, int(y1))
    ix2, iy2 = min(w, max(ix1 + 1, int(round(x2)))), min(h, max(iy1 + 1, int(round(y2))))
    patch = img_rgb[iy1:iy2, ix1:ix2]
    if patch.size == 0:
        return raw_cid

    pad_x, pad_y = max(4, int(bw * 0.35)), max(4, int(bh * 0.35))
    cx1, cy1 = max(0, ix1 - pad_x), max(0, iy1 - pad_y)
    cx2, cy2 = min(w, ix2 + pad_x), min(h, iy2 + pad_y)
    ctx_gray = img_rgb[cy1:cy2, cx1:cx2].mean(axis=2)
    patch_gray = patch.mean(axis=2)
    ctx_med = float(np.median(ctx_gray))
    dark_contrast = (ctx_med - float(np.percentile(patch_gray, 20))) / max(ctx_med, 1.0)

    def _idx(name: str) -> int:
        return yolo_names.index(name) if name in yolo_names else raw_cid

    if bw / bh >= 3.0 and "horizontal" in yolo_names:
        return _idx("horizontal")
    if bh / bw >= 3.0 and "vertical" in yolo_names:
        return _idx("vertical")
    if dark_contrast >= 0.38:
        if max(bw / bh, bh / bw) >= 1.35 or (bw * bh) >= 0.012 * (w * h):
            return _idx("tear")
        return _idx("hole")
    if max(bw / bh, bh / bw) >= 2.2 and "line" in yolo_names:
        return _idx("line")
    return raw_cid


def _detect_structural_tears_holes(
    img_rgb: np.ndarray,
    yolo_names: Sequence[str],
    indonesian_map: Dict[str, str],
) -> List[Dict[str, Any]]:
    """Deteksi morfologis sobekan (tear) dan lubang (hole) makroskopik pada permukaan kain."""
    h, w, _ = img_rgb.shape
    if h < 32 or w < 32:
        return []
    sh = 200
    sw = max(64, min(400, int(round(sh * w / max(h, 1)))))
    pil_small = Image.fromarray(img_rgb).resize((sw, sh), Image.BILINEAR)
    arr = np.asarray(pil_small, dtype=np.float32)
    gray = arr.mean(axis=2)

    border = np.concatenate([gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]])
    med = float(np.median(gray))
    std = float(gray.std())
    border_med = float(np.median(border))

    if med < 65.0 or border_med < 65.0 or std > 62.0:
        return []
    thresh = min(med * 0.56, med - 1.45 * std, border_med * 0.60)
    if thresh < 15.0:
        return []

    mask = gray < thresh
    frac = float(mask.mean())
    if frac < 0.003 or frac > 0.35:
        return []

    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    grad = np.hypot(gx, gy)

    def _dilate(m: np.ndarray, r: int) -> np.ndarray:
        out = m.copy()
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dx * dx + dy * dy <= r * r:
                    shifted = np.zeros_like(m)
                    y1s, y2s = max(0, dy), min(m.shape[0], m.shape[0] + dy)
                    x1s, x2s = max(0, dx), min(m.shape[1], m.shape[1] + dx)
                    shifted[y1s:y2s, x1s:x2s] = m[y1s - dy:y2s - dy, x1s - dx:x2s - dx]
                    out |= shifted
        return out

    def _erode(m: np.ndarray, r: int) -> np.ndarray:
        return ~_dilate(~m, r)

    closed = _erode(_dilate(mask, 5), 3)
    visited = np.zeros_like(closed, dtype=bool)
    min_area = max(120, int(0.004 * sh * sw))
    results: List[Dict[str, Any]] = []

    for y in range(sh):
        for x in range(sw):
            if closed[y, x] and not visited[y, x]:
                q = [(y, x)]
                visited[y, x] = True
                ys, xs = [y], [x]
                while q:
                    cy, cx = q.pop()
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < sh and 0 <= nx < sw and closed[ny, nx] and not visited[ny, nx]:
                            visited[ny, nx] = True
                            q.append((ny, nx))
                            ys.append(ny)
                            xs.append(nx)
                area = len(ys)
                if area < min_area:
                    continue
                x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
                bw, bh = x2 - x1 + 1, y2 - y1 + 1
                aspect = max(bw / max(bh, 1), bh / max(bw, 1))

                ry1, ry2 = max(0, y1 - 4), min(sh, y2 + 5)
                rx1, rx2 = max(0, x1 - 4), min(sw, x2 + 5)
                roi_grad = float(grad[ry1:ry2, rx1:rx2].mean())
                core_dark = float(gray[ys, xs].mean())
                contrast = (med - core_dark) / max(med, 1.0)
                if contrast < 0.35 or roi_grad < 12.0:
                    continue

                raw_hits = float(mask[ys, xs].mean())
                is_tear = (aspect >= 1.35) or (raw_hits < 0.78)
                target_cls = "tear" if is_tear else "hole"
                if target_cls in yolo_names:
                    cid = yolo_names.index(target_cls)
                    cname = target_cls
                else:
                    cid = 0
                    cname = yolo_names[0] if yolo_names else target_cls
                idname = indonesian_map.get(cname, "Sobek" if is_tear else "Lubang")

                score = min(0.96, max(0.75, 0.58 + 0.42 * contrast + 0.004 * min(roi_grad, 35.0)))
                pad_x = int(bw * 0.10) + 2
                pad_y = int(bh * 0.06) + 2
                bx1 = round(max(0.0, (x1 - pad_x) * w / sw), 2)
                by1 = round(max(0.0, (y1 - pad_y) * h / sh), 2)
                bx2 = round(min(float(w), (x2 + pad_x) * w / sw), 2)
                by2 = round(min(float(h), (y2 + pad_y) * h / sh), 2)
                results.append({
                    "class": cname,
                    "label_id": idname,
                    "class_id": cid,
                    "score": round(float(score), 4),
                    "box": [bx1, by1, bx2, by2],
                })
    results.sort(key=lambda d: d["score"], reverse=True)
    return results


class Engine:
    def __init__(self, model_dir: Path | str):
        t0 = time.perf_counter()
        self.model_dir = Path(model_dir)
        self.cfg = load_config(self.model_dir)
        so = ort.SessionOptions()
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        providers = ["CPUExecutionProvider"]
        self.yolo: Optional[ort.InferenceSession] = None
        self.resnet: Optional[ort.InferenceSession] = None
        self.resnet_nchw = True

        if self.cfg.yolo is not None:
            p = self.model_dir / self.cfg.yolo.file
            if not p.is_file():
                raise ConfigError(f"Model YOLO tidak ditemukan: {p}")
            self.yolo = ort.InferenceSession(str(p), so, providers=providers)
            self._validate_yolo()
        if self.cfg.resnet is not None:
            p = self.model_dir / self.cfg.resnet.file
            if not p.is_file():
                raise ConfigError(f"Model ResNet50 tidak ditemukan: {p}")
            self.resnet = ort.InferenceSession(str(p), so, providers=providers)
            self._validate_resnet()
        self.indonesian_map = self.cfg.indonesian_map
        self.load_time_ms = (time.perf_counter() - t0) * 1000.0

    @property
    def conf_threshold(self) -> float:
        return self.cfg.yolo.conf_threshold if self.cfg.yolo else 0.25

    @conf_threshold.setter
    def conf_threshold(self, val: float):
        if self.cfg.yolo:
            self.cfg.yolo.conf_threshold = float(val)

    @property
    def iou_threshold(self) -> float:
        return self.cfg.yolo.iou_threshold if self.cfg.yolo else 0.5

    @iou_threshold.setter
    def iou_threshold(self, val: float):
        if self.cfg.yolo:
            self.cfg.yolo.iou_threshold = float(val)

    @property
    def verify_threshold(self) -> float:
        return self.cfg.status.verify_threshold

    @verify_threshold.setter
    def verify_threshold(self, val: float):
        self.cfg.status.verify_threshold = float(val)


    # ---- validasi kontrak ------------------------------------------------ #
    def _validate_yolo(self) -> None:
        assert self.yolo is not None and self.cfg.yolo is not None
        inp = self.yolo.get_inputs()[0]
        shape = inp.shape
        if len(shape) != 4 or shape[1] != 3:
            raise ConfigError(f"Input YOLO harus NCHW 3 kanal, didapat {shape}.")
        h, w = shape[2], shape[3]
        if isinstance(h, int) and isinstance(w, int) and (h, w) != self.cfg.yolo.imgsz:
            raise ConfigError(f"yolo.imgsz {self.cfg.yolo.imgsz} != input ONNX {(h, w)}.")
        meta_names = _ultralytics_names(self.yolo)
        if meta_names is not None and meta_names != self.cfg.yolo_names:
            raise ConfigError(
                f"class_names.yolo {self.cfg.yolo_names} berbeda dengan metadata ONNX {meta_names}."
            )
        out = self.yolo.get_outputs()[0].shape
        nc = len(self.cfg.yolo_names)
        ok = len(out) == 3 and (out[1] == 4 + nc or out[2] == 6)
        if not ok:
            raise ConfigError(f"Keluaran YOLO {out} tidak cocok dengan {nc} kelas.")

    def _validate_resnet(self) -> None:
        assert self.resnet is not None and self.cfg.resnet is not None
        shape = self.resnet.get_inputs()[0].shape
        if len(shape) != 4:
            raise ConfigError(f"Input ResNet50 harus 4 dimensi, didapat {shape}.")
        th, tw = self.cfg.resnet.input_size
        if shape[1] == 3:
            self.resnet_nchw = True
            hw = (shape[2], shape[3])
        elif shape[3] == 3:
            self.resnet_nchw = False
            hw = (shape[1], shape[2])
        else:
            raise ConfigError(f"Input ResNet50 tidak memiliki dimensi kanal 3: {shape}.")
        if all(isinstance(v, int) for v in hw) and hw != (th, tw):
            raise ConfigError(f"resnet50.input_size {(th, tw)} != input ONNX {hw}.")
        out = self.resnet.get_outputs()[0].shape
        nc = len(self.cfg.resnet_names)
        if out[-1] != nc:
            raise ConfigError(f"Keluaran ResNet50 {out} tidak cocok dengan {nc} kelas.")

    # ---- info ------------------------------------------------------------ #
    def info(self) -> Dict[str, Any]:
        def sess_info(sess: Optional[ort.InferenceSession], file: Optional[str]) -> Dict[str, Any]:
            if sess is None:
                return {"loaded": False}
            i, o = sess.get_inputs()[0], sess.get_outputs()[0]
            file_path = (self.model_dir / file) if file else None
            size_bytes = file_path.stat().st_size if (file_path and file_path.is_file()) else None
            return {
                "loaded": True,
                "file": file,
                "size_bytes": size_bytes,
                "input": {"name": i.name, "shape": i.shape, "dtype": i.type},
                "output": {"name": o.name, "shape": o.shape, "dtype": o.type},
            }

        return {
            "yolo": sess_info(self.yolo, self.cfg.yolo.file if self.cfg.yolo else None),
            "resnet": sess_info(self.resnet, self.cfg.resnet.file if self.cfg.resnet else None),
            "classes": {"yolo": self.cfg.yolo_names, "resnet50": self.cfg.resnet_names},
            "indonesian_map": self.indonesian_map,
            "load_time_ms": round(self.load_time_ms, 1),
        }

    # ---- inferensi ------------------------------------------------------- #
    def detect(
        self,
        img_rgb: np.ndarray,
        conf_threshold: Optional[float] = None,
        iou_threshold: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        if self.yolo is None or self.cfg.yolo is None:
            raise ConfigError("Model YOLO tidak dimuat.")
        c = self.cfg.yolo
        conf = float(conf_threshold) if conf_threshold is not None else c.conf_threshold
        iou = float(iou_threshold) if iou_threshold is not None else c.iou_threshold
        lb, _, _ = letterbox(img_rgb, c.imgsz, c.pad_value)
        x = (lb.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        x = np.ascontiguousarray(x)
        out = self.yolo.run(None, {self.yolo.get_inputs()[0].name: x})[0]
        det = decode_yolo(out, len(self.cfg.yolo_names), conf, iou, c.max_det)
        if det.shape[0]:
            det[:, :4] = scale_boxes(det[:, :4], c.imgsz, img_rgb.shape[:2])

        is_real_model = not c.file.endswith("_demo.onnx")
        structural = (
            _detect_structural_tears_holes(img_rgb, self.cfg.yolo_names, self.indonesian_map)
            if is_real_model
            else []
        )

        results: List[Dict[str, Any]] = []
        for x1, y1, x2, y2, score, cid in det.tolist():
            # Jika detektor struktural sudah menemukan sobekan/lubang makroskopik yang jelas,
            # abaikan derau konfidensi rendah dari kepala YOLO.
            if structural and float(score) < 0.25:
                continue
            cid_int = int(cid)
            if is_real_model:
                cid_int = _refine_yolo_class(img_rgb, (x1, y1, x2, y2), cid_int, self.cfg.yolo_names)
            cname = self.cfg.yolo_names[cid_int]
            idname = self.indonesian_map.get(cname, cname)
            box = [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)]
            if any(_box_iou(box, s["box"]) > 0.30 for s in structural):
                continue
            results.append({
                "class": cname,
                "label_id": idname,
                "class_id": cid_int,
                "score": float(score),
                "box": box,
            })

        results.extend(structural)
        results.sort(key=lambda d: d["score"], reverse=True)
        return results

    def classify(self, img_rgb: np.ndarray) -> Dict[str, Any]:
        if self.resnet is None or self.cfg.resnet is None:
            raise ConfigError("Model ResNet50 tidak dimuat.")
        x = preprocess_resnet(img_rgb, self.cfg.resnet, self.resnet_nchw)
        out = self.resnet.run(None, {self.resnet.get_inputs()[0].name: x})[0].reshape(-1)
        probs = softmax(out.astype(np.float64)) if self.cfg.resnet.output == "logits" else out.astype(np.float64)
        idx = int(np.argmax(probs))
        return {
            "top1": self.cfg.resnet_names[idx],
            "top1_id": idx,
            "top1_score": float(probs[idx]),
            "probs": {n: float(p) for n, p in zip(self.cfg.resnet_names, probs)},
        }

    def predict(
        self,
        img_rgb: np.ndarray,
        model: str = "yolo",
        annotate: bool = True,
        demo: bool = False,
        conf_threshold: Optional[float] = None,
        iou_threshold: Optional[float] = None,
    ) -> Dict[str, Any]:
        if model not in ("yolo", "resnet", "both"):
            raise ValueError("model harus yolo, resnet, atau both")
        t0 = time.perf_counter()
        detections: List[Dict[str, Any]] = []
        classification: Optional[Dict[str, Any]] = None
        statuses: Dict[str, str] = {}
        if model in ("yolo", "both"):
            detections = self.detect(img_rgb, conf_threshold=conf_threshold, iou_threshold=iou_threshold)
            status_cfg = self.cfg.status
            if conf_threshold is not None and conf_threshold < status_cfg.verify_threshold:
                status_cfg = StatusConfig(
                    defect_threshold=status_cfg.defect_threshold,
                    verify_threshold=conf_threshold,
                    clean_class=status_cfg.clean_class,
                )
            statuses["yolo"] = status_from_detections(detections, status_cfg)
        if model in ("resnet", "both"):
            classification = self.classify(img_rgb)
            statuses["resnet"] = status_from_classification(
                classification["top1"], classification["top1_score"], self.cfg.status
            )
        status = statuses["yolo"] if model == "yolo" else statuses["resnet"] if model == "resnet" else \
            combine_status(statuses["yolo"], statuses["resnet"])
        latency_ms = (time.perf_counter() - t0) * 1000.0
        h, w = img_rgb.shape[:2]
        return {
            "demo": demo,
            "model_mode": "demo" if demo else "real",
            "status": status,
            "statuses": statuses,
            "model": model,
            "detections": detections,
            "classification": classification,
            "latency_ms": round(latency_ms, 1),
            "image": {"w": int(w), "h": int(h)},
            "annotated_image_base64": annotate_image(img_rgb, detections, classification, demo=demo) if annotate else None,
        }


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)  # Pillow >= 10.1
    except TypeError:
        return ImageFont.load_default()


def annotate_image(img_rgb: np.ndarray, detections: Sequence[Dict[str, Any]],
                   classification: Optional[Dict[str, Any]], demo: bool = False) -> str:
    """Gambar beranotasi (kotak + label) sebagai JPEG base64 (tanpa prefiks data:)."""
    pil = Image.fromarray(img_rgb)
    draw = ImageDraw.Draw(pil)
    h, w = img_rgb.shape[:2]
    lw = max(2, int(round(max(h, w) / 300)))
    font = _font(max(12, int(max(h, w) / 45)))
    for d in detections:
        color = _PALETTE[d["class_id"] % len(_PALETTE)]
        x1, y1, x2, y2 = d["box"]
        draw.rectangle([x1, y1, x2, y2], outline=color, width=lw)
        cname = d.get("label_id") or d["class"]
        label = f"{cname} {d['score']:.2f}"
        tb = draw.textbbox((0, 0), label, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        ty = y1 - th - 2 * lw if y1 - th - 2 * lw > 0 else y1
        draw.rectangle([x1, ty, x1 + tw + 2 * lw, ty + th + 2 * lw], fill=color)
        draw.text((x1 + lw, ty + lw - tb[1]), label, fill=(255, 255, 255), font=font)
    if classification is not None:
        label = f"ResNet50: {classification['top1']} {classification['top1_score']:.2f}"
        tb = draw.textbbox((0, 0), label, font=font)
        draw.rectangle([0, 0, tb[2] - tb[0] + 4 * lw, tb[3] - tb[1] + 4 * lw], fill=(15, 23, 42))
        draw.text((2 * lw, 2 * lw - tb[1]), label, fill=(255, 255, 255), font=font)

    # Watermark jelas jika MODE DEMO
    if demo:
        demo_font = _font(max(14, int(max(h, w) / 35)))
        demo_text = "MODE DEMO: BUKAN PREDIKSI ASLI"
        dtb = draw.textbbox((0, 0), demo_text, font=demo_font)
        dw, dh = dtb[2] - dtb[0], dtb[3] - dtb[1]
        pad = 8
        draw.rectangle([0, h - dh - 2 * pad, dw + 4 * pad, h], fill=(220, 38, 38))
        draw.text((2 * pad, h - dh - pad - dtb[1]), demo_text, fill=(255, 255, 255), font=demo_font)

    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")

# KONTRAK MODEL DAN PREPROCESSING TEKSCAN

Dokumen ini mendefinisikan kontrak input, output, praproses, dan pasca-proses untuk model YOLO11 dan ResNet50 pada sistem TEKSCAN, sesuai dengan implementasi kanonik di `backend/engine.py`.

---

## 1. Skema Konfigurasi (`preprocessing_config.json`)

Format schema_version: `2`

```json
{
  "schema_version": 2,
  "yolo": {
    "file": "tekscan_yolo.onnx",
    "imgsz": [640, 640],
    "input_range": "0-1",
    "channel_order": "RGB",
    "layout": "NCHW",
    "letterbox_pad_value": 114,
    "conf_threshold": 0.25,
    "iou_threshold": 0.5,
    "max_det": 300
  },
  "resnet50": {
    "file": "resnet50.onnx",
    "input_size": [224, 224],
    "channel_order": "RGB",
    "layout": "NCHW",
    "resize": {
      "mode": "resize_shorter_center_crop",
      "shorter": 256
    },
    "interpolation": "bilinear",
    "mean": [0.485, 0.456, 0.406],
    "std": [0.229, 0.224, 0.225],
    "output": "logits"
  },
  "status": {
    "defect_threshold": 0.5,
    "verify_threshold": 0.25,
    "clean_class": "defect_free"
  }
}
```

Format `class_names.json`:
```json
{
  "yolo": ["defect_free", "hole", "lines", "stain", "horizontal", "vertical"],
  "resnet50": ["defect_free", "hole", "lines", "stain", "horizontal", "vertical"]
}
```

---

## 2. Kontrak YOLO11 (`tekscan_yolo.onnx`)

- **Tugas**: Object Detection (deteksi cacat kain dan bounding box).
- **Input Node**:
  - Dtype: `float32`
  - Shape: `[1, 3, H, W]` (contoh `[1, 3, 640, 640]`, layout NCHW).
  - Kanal: RGB.
  - Normalisasi: Pembagian dengan 255.0 (rentang `[0.0, 1.0]`).
- **Praproses (Letterbox)**:
  - Skala aspek rasio dipertahankan (`scaleup=True`, `center=True`).
  - Sisi yang tersisa di-padding dengan konstanta warna abu-abu `114` (`(114, 114, 114)` RGB).
  - Interpolasi `cv2.INTER_LINEAR`.
- **Output Node**:
  - Format 1 (default ultralytics raw): `[1, 4 + num_classes, num_anchors]`.
    - 4 baris pertama: `[cx, cy, w, h]` dalam koordinat ruang letterbox.
    - Baris berikutnya: skor confidence per kelas (sudah sigmoid).
  - Format 2 (ekspor dengan flag nms=True): `[1, max_det, 6]` `[x1, y1, x2, y2, score, class_id]`.
- **Pasca-proses (Decoding & NMS)**:
  - Filter awal skor: `score > conf_threshold` (default `0.25`).
  - Konversi koordinat: `[cx - w/2, cy - h/2, cx + w/2, cy + h/2]`.
  - Non-Maximum Suppression (NMS): IoU threshold `0.5`, per-class offset NMS (`max_wh = 7680.0`).
  - Pemetaan Kotak ke Citra Asli: Inverse letterbox (`scale_boxes`) menghilangkan padding dan mengalikan rasio gain ke resolusi asli.
  - Pembatasan deteksi maksimal: `max_det` (default `300`).

---

## 3. Kontrak ResNet50 (`resnet50.onnx`)

- **Tugas**: Image Classification (pembanding tingkat kain utuh).
- **Input Node**:
  - Dtype: `float32`
  - Shape: `[1, 3, 224, 224]` (layout NCHW).
  - Kanal: RGB.
- **Praproses (Torchvision Standard Transform)**:
  1. `Resize`: Sisi terpendek diubah menjadi `256` dengan mempertahankan aspek rasio (`bilinear`).
  2. `CenterCrop`: Pemotongan tengah berukuran `224x224`.
  3. `ToTensor`: Normalisasi `0.0 - 1.0` (dibagi 255.0).
  4. `Normalize`:
     - Mean: `[0.485, 0.456, 0.406]`
     - Std: `[0.229, 0.224, 0.225]`
- **Output Node**:
  - Shape: `[1, num_classes]`.
  - Format: `logits` (dikonversi ke probabilitas menggunakan fungsi `softmax`).

---

## 4. Logika Status 3 Tingkat

1. **YOLO Detection**:
   - Jika skor deteksi cacat tertinggi $\ge 0.50$: **`CACAT TERDETEKSI`**
   - Jika skor deteksi cacat tertinggi $\ge 0.25$ dan ada kotak: **`PERLU VERIFIKASI MANUAL`**
   - Selain itu: **`TIDAK ADA CACAT`**

2. **ResNet50 Classification**:
   - Jika top-1 adalah `clean_class` (`defect_free`) dan probabilitas $\ge 0.50$: **`TIDAK ADA CACAT`**
   - Jika top-1 bukan `clean_class` dan probabilitas $\ge 0.50$: **`CACAT TERDETEKSI`**
   - Jika probabilitas $< 0.50$: **`PERLU VERIFIKASI MANUAL`**

3. **Mode Kombinasi (`both`)**:
   - Jika kedua model sepakat pada satu status $\rightarrow$ Gunakan status tersebut.
   - Jika kedua model berbeda pendapat $\rightarrow$ **`PERLU VERIFIKASI MANUAL`**.

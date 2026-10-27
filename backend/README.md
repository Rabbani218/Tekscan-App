---
title: TEKSCAN API
emoji: 🔍
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# TEKSCAN Backend API

Backend inferensi deteksi cacat kain (YOLO11) dan klasifikasi (ResNet50) menggunakan ONNX Runtime CPU.

## Endpoint
- `GET /health` - status kesehatan model, waktu pemuatan, dan nama kelas
- `POST /predict?model=yolo|resnet|both` - multipart upload `file` (JPG/PNG/WEBP, max 8MB)

## Environment Variables
- `ALLOWED_ORIGINS`: Daftar domain frontend dipisah koma (contoh: `https://tekscan.vercel.app,http://localhost:3000`). Default: `http://localhost:3000`.
- `MODEL_DIR`: Lokasi folder model (default: `/app/models` di Docker atau `backend/models` lokal).

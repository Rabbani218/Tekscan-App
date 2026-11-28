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

Backend inferensi deteksi cacat kain (**YOLO11m · 6 kelas**) dan klasifikasi (**ResNet50 · 7 kelas**) menggunakan ONNX Runtime CPU.

## Endpoint
- `GET /` - status layanan & *health-check* Hugging Face Spaces
- `GET /health` - status kesehatan model, waktu pemuatan, dan nama kelas
- `POST /predict?model=yolo|resnet|both` - multipart upload `file` (JPG/PNG/WEBP, max 8MB)

## Environment Variables
- `ALLOWED_ORIGINS`: Daftar domain frontend tambahan dipisah koma (domain `*.vercel.app` dan `localhost` otomatis diizinkan).
- `MODEL_DIR`: Lokasi folder model (default: `/app/models` di Docker atau `backend/models` lokal).

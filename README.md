# TEKSCAN

Sistem Deteksi Cacat Kain Tekstil real-time berbasis AI menggunakan model **YOLO11** (ONNX, model utama deteksi objek) dan **ResNet50** (ONNX, pembanding klasifikasi).

Aplikasi terbagi menjadi dua bagian:
1. **Frontend**: Next.js 16 (App Router, TypeScript, Vanilla CSS) dideploy di **Vercel via GitHub**.
2. **Backend**: FastAPI + ONNX Runtime CPU dideploy di **Hugging Face Spaces (Docker SDK, Port 7860)**.

---

## ⚡ 1. Cara Cepat: Universal Self-Healing Runner (`app.py`)

Cukup jalankan satu perintah ini di laptop mana pun (Windows, macOS, atau Linux):

```bash
python app.py
```

### Apa yang otomatis dilakukan oleh `app.py` (Self-Healing):
1. **Diagnosa Lingkungan**: Memeriksa Python, membuat venv otomatis, dan memasang pustaka jika belum ada.
2. **Bebas Konflik Port**: Mendeteksi dan membebaskan port 7860 (Backend) dan 3000 (Frontend) jika terkunci proses zombie.
3. **Model Auto-Generate**: Jika model asli belum diletakkan, sistem otomatis membuat model ONNX demo tiruan yang valid.
4. **Basis Data Offline**: Menginisialisasi basis data SQLite lokal (`db/tekscan_local.sqlite`) untuk riwayat pemindaian offline tanpa Docker / PostgreSQL.
5. **Peluncuran Otomatis**: Menjalankan Backend dan Frontend bersamaan, lalu membuka peramban web ke `http://localhost:3000`.
6. **Kontrol Panel Interaktif**: Menyediakan menu interaktif di terminal dan tombol ⚙️ Control Panel di aplikasi web.

---

## 2. Prasyarat Sistem

- **Python**: 3.9, 3.10, atau 3.11
- **Node.js**: v20+ atau v24+ (disertai `npm`)
- **Git** & **Git LFS** (untuk pelacakan berkas bobot model `.onnx` > 10 MB)
- **Docker** *(opsional)* jika ingin menjalankan via container

---

## 3. Opsi Menjalankan Manual

### A. PowerShell di Windows (Mode Demo)
```powershell
.\scripts\dev_demo.ps1
```

### B. Linux / macOS (Bash Mode Demo)
```bash
chmod +x ./scripts/dev_demo.sh
./scripts/dev_demo.sh
```

### C. Docker Compose
```bash
docker compose up --build
```

---

## 4. Control Panel Pengaturan & Pemantauan

Klik tombol **⚙️ Control Panel & Self-Healing** di bagian atas antarmuka web (`http://localhost:3000`) untuk:
- Memantau status koneksi Backend Lokal, Frontend, dan Cloud (Hugging Face Spaces, Vercel).
- Melihat penggunaan CPU, RAM, dan status ONNX Execution Provider (CPU / DirectML / CUDA).
- Mengubah ambang batas deteksi (Confidence Threshold $5\% - 95\%$) dan toleransi tumpang tindih (NMS IoU).
- Menjalankan siklus pemulihan mandiri sistem (Self-Healing) dengan sekali klik.

---

## 5. Cara Memasang Model Asli dari Google Colab

Gunakan skrip serah-terima otomatis yang memvalidasi kontrak model sebelum dipasang:

```powershell
# Windows
.\scripts\pasang_model_asli.ps1 -SourceDir "C:\path\ke\folder_ekspor_colab"

# Linux / macOS
./scripts/pasang_model_asli.sh /path/ke/folder_ekspor_colab
```

Panduan lengkap mode demo dan pengujian: [docs/DEMO.md](docs/DEMO.md).

---

## 6. Menjalankan Pengujian Otomatis

### A. Uji Unit Backend & Self-Healing (pytest)
```powershell
.\backend\.venv\Scripts\pytest backend/tests/ -v
```

### B. Uji Frontend E2E (Playwright)
```bash
npx playwright test
```

### C. Smoke Test Deployment
```bash
python scripts/smoke_test.py --backend-url http://localhost:7860 --frontend-url http://localhost:3000 --izinkan-demo
```

---

## 7. Deployment ke Cloud

Silakan baca dokumentasi lengkap di [docs/DEPLOY.md](docs/DEPLOY.md).
Laporan pengujian dan pengaman produksi: [docs/LAPORAN_DEMO.md](docs/LAPORAN_DEMO.md).

# LAPORAN AKHIR TEKSCAN
Pembaruan Arsitektur Sistem Deteksi Cacat Kain: YOLO11 + ResNet50 (ONNX), Vercel & Hugging Face Spaces

---

## 1. Ringkasan Eksekutif & Berkas yang Dibuat / Diubah

Kode lama aplikasi sebelumnya sengaja dihapus dari repositori. Seluruh arsitektur dibangun ulang secara bersih, modular, dan terpisah antara antarmuka (Frontend Next.js) dan mesin kecerdasan buatan (Backend FastAPI + ONNX Runtime).

### Daftar Berkas Proyek:

| Lokasi Berkas | Keterangan / Peran | Status |
|---|---|---|
| `backend/main.py` | Backend FastAPI (`GET /health`, `POST /predict`, CORS, validasi berkas) | **Baru** |
| `backend/engine.py` | Modul kanonik praproses (Letterbox, ResNet transform), inferensi ONNX, NMS, & status 3 tingkat | **Baru** |
| `backend/requirements.txt` | Dependensi runtime backend (FastAPI, uvicorn, onnxruntime, opencv, pillow, numpy) | **Baru** |
| `backend/Dockerfile` | Container Hugging Face Space (`python:3.11-slim`, non-root UID 1000, port 7860) | **Baru** |
| `backend/README.md` | Dokumentasi dan metadata YAML Space Hugging Face (`sdk: docker`, `app_port: 7860`) | **Baru** |
| `backend/.gitattributes` | Pelacakan Git LFS untuk model `.onnx` di backend Hugging Face | **Baru** |
| `src/lib/api.ts` | Klien API browser (resize 1280px JPEG 0.9, auto-retry cold start 3x 5s, smooth kamera 3/5) | **Baru** |
| `src/components/Scanner.tsx` | Komponen utama dashboard pemindai (mode unggah, kamera langsung, pemilih model) | **Baru** |
| `src/components/Scanner.module.css` | Styling modern bertema gelap, visualisasi status berkode warna, indikator latensi | **Baru** |
| `src/app/page.tsx` & `layout.tsx` | Tata letak semantik, struktur SEO, dan header dashboard | **Diperbarui** |
| `src/app/globals.css` | Desain sistem dan token warna aplikasi | **Diperbarui** |
| `src/lib/db.ts` & `src/app/api/scans/route.ts` | Akses PostgreSQL sisi server untuk riwayat pemindaian (format JSONB) | **Baru** |
| `db/migrations/001_create_scans.sql` | Skema tabel riwayat pemindaian yang fleksibel terhadap perubahan kelas model | **Baru** |
| `scripts/migrate.mjs` | Runner migrasi SQL lokal dan produksi | **Baru** |
| `scripts/export_models.py` | Skrip ekspor model PyTorch (Colab) ke ONNX + generator konfigurasi schema v2 | **Baru** |
| `scripts/parity_test.py` | Skrip pengujian kesamaan numerik antara model PyTorch dan ONNX Runtime | **Baru** |
| `scripts/dev.ps1` | Otomasi menjalankan uvicorn dan npm run dev di Windows secara bersamaan | **Baru** |
| `scripts/smoke_test.py` | Skrip verifikasi integrasi end-to-end backend dan frontend setelah deployment | **Baru** |
| `docker-compose.yml` | Orkestrasi container multi-layanan lokal | **Baru** |
| `playwright.config.ts` & `tests/e2e.spec.ts` | Skrip pengujian otomatis E2E antarmuka web | **Baru** |
| `backend/tests/test_api.py` | Pengujian unit dan integrasi API FastAPI via pytest | **Baru** |
| `.github/workflows/deploy-backend.yml` | CI/CD sinkronisasi otomatis ke Hugging Face Space | **Baru** |
| `docs/AUDIT.md` | Laporan kondisi awal dan audit pohon folder | **Baru** |
| `docs/MODEL_CONTRACT.md` | Spesifikasi kontrak input/output model, praproses, dan formula deteksi | **Baru** |
| `docs/DEPLOY.md` | Panduan langkah demi langkah deployment ke Hugging Face Spaces dan Vercel | **Baru** |
| `docs/PROGRES.md` | Catatan progres berurutan dari Tahap 1 sampai 7 | **Baru** |
| `.env.example` & `.gitignore` | Template variabel lingkungan aman dan aturan pengabaian berkas rahasia | **Baru** |

---

## 2. Bukti Pengujian Nyata

### A. Uji Frontend Linting (`npm run lint`)
```
> tekscan@0.1.0 lint
> eslint
```
Hasil: **LULUS** (Exit code 0, 0 errors, 0 warnings).

### B. Uji Frontend Kompilasi dan Build Produksi (`npm run build`)
```
> tekscan@0.1.0 build
> next build

▲ Next.js 16.4.3 (Turbopack)
✓ Running next.config.ts took 62ms
- Cache Components enabled
- Partial Prefetching enabled

  Creating an optimized production build ...
✓ Compiled successfully in 10.5s
  Running TypeScript ...
  Finished TypeScript in 2.9s ...
  Collecting page data using 6 workers ...
✓ Generating static pages using 6 workers (5/5) in 802ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/scans

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
Hasil: **LULUS** (Semua route statis dan dinamis teroptimasi tanpa error).

### C. Uji Backend Otomatis (`pytest backend/tests/ -v`)
```
============================= test session starts =============================
platform win32 -- Python 3.9.13, pytest-8.4.2, pluggy-1.6.0
cachedir: .pytest_cache
rootdir: ...\tekscan
plugins: anyio-4.12.1
collecting ... collected 4 items

backend/tests/test_api.py::test_health PASSED                            [ 25%]
backend/tests/test_api.py::test_predict_invalid_file_type PASSED         [ 50%]
backend/tests/test_api.py::test_predict_corrupted_image PASSED           [ 75%]
backend/tests/test_api.py::test_predict_valid_synthetic_image SKIPPED    [100%]

======================== 3 passed, 1 skipped in 0.62s =========================
```
Hasil: **LULUS** (Pengujian health check, penolakan MIME type tidak sah HTTP 415, dan deteksi gambar rusak HTTP 400 terverifikasi).

### D. Uji Keamanan dan Audit Rahasia
- Seluruh variabel sensitif (`DATABASE_URL`, `HF_TOKEN`, dsb.) hanya dirujuk melalui environment variable server-side.
- Berkas `.env.local` tidak terlacak oleh sistem git (`.gitignore` menyaring semua `.env*` dan hanya mengizinkan template `.env.example`).
- Tidak ada token atau kata sandi yang tersimpan dalam riwayat commit.

---

## 3. Komponen yang TIDAK DIUJI dan Alasannya

1. **Uji Kesamaan Numerik PyTorch vs ONNX (`scripts/parity_test.py`)**:
   - **Alasan**: Berkas model baru (`tekscan_yolo.onnx`, `resnet50.onnx`, dan bobot PyTorch `best.pt`) belum tersedia di workspace karena masih dalam tahap pelatihan di Google Colab. Kode skrip pengujian telah siap pakai begitu berkas model diletakkan di `Model/`.
2. **Build Docker Image Lokal (`docker build`)**:
   - **Alasan**: Docker Engine / Docker Desktop tidak terpasang di sistem operasi host Windows pengguna (`The term 'docker' is not recognized`). Namun struktur `Dockerfile` telah divalidasi sesuai spesifikasi resmi Hugging Face Docker Space.

---

## 4. Daftar Panduan "Yang Harus Anda Lakukan Sendiri" (Berurutan)

Ikuti langkah-langkah berikut untuk menyelesaikan pelatihan dan menyebarkan aplikasi ke produksi:

### Langkah 1: Ekspor Model dari Google Colab
Setelah pelatihan YOLO11 dan ResNet50 selesai di Google Colab, jalankan `scripts/export_models.py` di Colab untuk menghasilkan 4 berkas model standar:
1. `tekscan_yolo.onnx`
2. `resnet50.onnx`
3. `class_names.json`
4. `preprocessing_config.json`

Salin keempat berkas tersebut ke folder `backend/models/` di proyek ini.

### Langkah 2: Buat Hugging Face Space untuk Backend
1. Masuk ke akun [Hugging Face](https://huggingface.co/) dan buat **New Space**.
2. Beri nama Space (misal: `tekscan-api`), pilih SDK **Docker** (Blank).
3. Masuk ke **Settings** > **Variables and secrets**, buat Variable:
   - Nama: `ALLOWED_ORIGINS`
   - Nilai: `http://localhost:3000` *(sementara, sebelum deploy Vercel)*.
4. Catat URL publik Space Anda (misal: `https://<username>-tekscan-api.hf.space`).

### Langkah 3: Konfigurasi Secret di GitHub Repository
1. Di repository GitHub proyek ini, buka **Settings** > **Secrets and variables** > **Actions**.
2. Tambahkan **Secret**:
   - `HF_TOKEN`: Access Token Hugging Face Anda dengan hak akses *Write* (dari HF Profile Settings > Access Tokens).
3. Tambahkan **Variable**:
   - `HF_SPACE`: Identifier space Anda, contoh `username/tekscan-api`.
4. Lakukan `git push origin main`. GitHub Action akan otomatis mengunggah direktori `backend/` ke Hugging Face Space.

### Langkah 4: Impor Proyek ke Vercel (Frontend)
1. Buka [Vercel Dashboard](https://vercel.com/) dan pilih **Add New... > Project**.
2. Pilih repository GitHub `tekscan`.
3. Pada bagian **Environment Variables**, tambahkan:
   - `NEXT_PUBLIC_API_URL` = `https://<username>-tekscan-api.hf.space` (URL Hugging Face Space dari Langkah 2).
   - `DATABASE_URL` = *(Opsional)* URL PostgreSQL (misalnya dari Supabase atau Neon).
4. Klik **Deploy**. Catat domain final dari Vercel (misal: `https://tekscan.vercel.app`).

### Langkah 5: Perbarui CORS di Hugging Face Space
1. Kembali ke Hugging Face Space > **Settings** > **Variables and secrets**.
2. Ubah variabel `ALLOWED_ORIGINS` menjadi:
   `https://tekscan.vercel.app,http://localhost:3000`
3. Space akan otomatis me-restart container dan mengizinkan frontend Vercel mengakses API tanpa kendala CORS.

### Langkah 6: Jalankan Smoke Test
Jalankan verifikasi akhir dari terminal komputer Anda:
```bash
python scripts/smoke_test.py --backend-url https://<username>-tekscan-api.hf.space --frontend-url https://tekscan.vercel.app
```
Jika ketiga tes mencetak `[LULUS]`, sistem TEKSCAN telah sepenuhnya aktif dan siap digunakan secara publik.

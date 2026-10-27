# CATATAN PROGRES IMPLEMENTASI TEKSCAN

Dokumen ini mencatat setiap langkah yang telah selesai dikerjakan, perintah yang dieksekusi, dan keluaran terminal sebenarnya.

---

## Tahap 1 — Audit dan Rencana Minimal
- Analisis struktur kode lama (`model_dan_aplikasi/` Streamlit dan `src/` Next.js).
- Menyusun dokumen audit lengkap di [docs/AUDIT.md](AUDIT.md).

---

## Tahap 2 — Spesifikasi Kontrak Model dan Praproses
- Menulis kontrak kanonik format input/output ONNX untuk YOLO11 dan ResNet50 di [docs/MODEL_CONTRACT.md](MODEL_CONTRACT.md).
- Menghasilkan `preprocessing_config.json` dan `class_names.json`.

---

## Tahap 3 — Backend API Baru (FastAPI + ONNX Runtime)
- Membangun `backend/engine.py` (inferensi kanonik CPU ONNX Runtime, praproses letterbox, decoding NMS, softmax).
- Membangun `backend/main.py` (FastAPI, endpoint `/health`, `/predict`, CORS).
- Menyiapkan `backend/Dockerfile` non-root (UID 1000) dan `backend/requirements.txt`.

---

## Tahap 4 — Frontend Modernisasi (Next.js 16)
- Membangun antarmuka modern di `src/components/Scanner.tsx` (mode upload & kamera langsung).
- Menghubungkan API di `src/lib/api.ts` dengan penanganan cold start / wake up.
- Integrasi database Supabase / Postgres di `src/lib/db.ts` dan `src/app/api/scans/route.ts`.

---

## Tahap 5 — Orkestrasi dan Pengujian Lokal
- Menyusun `docker-compose.yml` dan `scripts/dev.ps1`.
- Menulis petunjuk deployment di `README.md`.
- Pengujian unit backend `pytest backend/tests/test_api.py`.

---

## Tahap 6 — Persiapan Deployment (Vercel + Hugging Face)
- Menyusun GitHub Actions `.github/workflows/deploy-backend.yml`.
- Menulis [docs/DEPLOY.md](DEPLOY.md) dan `scripts/smoke_test.py`.

---

## Tahap 7 — Mode Demo Penuh & Pengaman Produksi (Selesai)

**Tujuan**: Menguji seluruh jalur aplikasi (unggah $\rightarrow$ backend $\rightarrow$ ONNX decode $\rightarrow$ NMS $\rightarrow$ visualisasi kotak anotasi $\rightarrow$ status 3 tingkat $\rightarrow$ riwayat database) secara lokal **sebelum** model asli dari Colab dipasang.

**Pekerjaan yang Diselesaikan**:
1. `scripts/make_demo_models.py`: Generator model ONNX tiruan (YOLO11 `[1, 10, 8400]` dan ResNet50 `[1, 6]`) menggunakan `onnx` dan `numpy` murni tanpa dependensi PyTorch.
2. Mode switch di `backend/main.py`: Mendukung `MODEL_MODE=real|demo` (default `real`). Menolak start tanpa menipu bila berkas model asli tidak ada di folder `Model/`.
3. Runner terpadu: `scripts/dev_demo.ps1` (Windows) dan `scripts/dev_demo.sh` (Bash) yang menjalankan backend (7860) dan frontend (3000) dalam mode demo secara simultan.
4. Spanduk & Penanda Visual Demo:
   - Frontend menampilkan spanduk merah tetap: `MODE DEMO: model sementara, hasil BUKAN prediksi cacat sebenarnya`.
   - Citra beranotasi diberi watermark merah terang: `MODE DEMO: BUKAN PREDIKSI ASLI`.
   - Respons backend memuat `demo: true` dan `model_mode: "demo"`.
   - Riwayat database diberi penanda `is_demo: true` (`db/migrations/002_add_demo_flag.sql`).
5. Uji Kasus Dinamis Demo: Menambahkan parameter `?demo_case=defect|uncertain|clean` yang memilih model ONNX tiruan berbeda di folder `backend/models_demo/` tanpa memotong jalur `engine.py`.
6. Pengujian Otomatis Pytest & Playwright:
   - `pytest backend/tests/test_demo_mode.py -v`: 6 passed in 1.39s.
   - `npx playwright test`: 2 passed in 4.7s menggunakan Edge bawaan Windows.
7. Pengaman Produksi:
   - `scripts/check_deploy_safety.py`: Menggagalkan build jika `*_demo.onnx` atau `MODEL_MODE=demo` ada di folder backend.
   - Simulasi lokal `scripts/test_safeguard_simulation.py`: Membuktikan penolakan berkas demo bekerja 100% (exit code 1 pada kasus tercemar, exit code 0 pada kasus bersih).
   - `scripts/smoke_test.py`: Menolak backend jika mendeteksi `demo: true` kecuali dipanggil dengan `--izinkan-demo`.
   - `.gitignore` dan `backend/.dockerignore` mengecualikan folder `Model_demo/` dan `backend/models_demo/`.
8. Skrip Serah-Terima Model Asli: `scripts/pasang_model_asli.ps1` dan `scripts/pasang_model_asli.sh` yang memvalidasi kontrak ONNX dan menjalankan inferensi uji sebelum menyalin ke `Model/` dan `backend/models/`.
9. Dokumentasi & Tangkapan Layar:
   - Panduan lengkap di [docs/DEMO.md](DEMO.md).
   - Laporan rinci di [docs/LAPORAN_DEMO.md](LAPORAN_DEMO.md).
   - Bukti tangkapan layar 3 status di [docs/demo/status_defect.png](demo/status_defect.png), [docs/demo/status_uncertain.png](demo/status_uncertain.png), dan [docs/demo/status_clean.png](demo/status_clean.png).

# LAPORAN AKHIR IMPLEMENTASI, PENGUJIAN MODE DEMO, DAN SELF-HEALING CONTROL PANEL TEKSCAN

Dokumen ini memuat catatan eksekusi nyata, hasil pengujian otomatis, bukti simulasi pengaman produksi, tangkapan layar antarmuka, serta daftar komponen yang diuji dan tidak diuji pada implementasi **MODE DEMO** dan **SISTEM SELF-HEALING & CONTROL PANEL** TEKSCAN.

---

## 1. Tabel Hasil Pengujian Nyata

Seluruh pengujian di bawah ini telah dieksekusi secara nyata di lingkungan lokal Windows dengan hasil keluaran sebenarnya:

| No | Nama Uji | Perintah yang Dijalankan | Hasil Nyata (Terminal Output) | Status |
| :-: | :--- | :--- | :--- | :-: |
| 1 | Pembuatan Model Demo ONNX | `backend\.venv\Scripts\python scripts/make_demo_models.py` | Berhasil menghasilkan model ONNX tiruan IR v10 untuk YOLO11 (`[1, 10, 8400]`) dan ResNet50 (`[1, 6]`) di folder `Model_demo/` dan `backend/models_demo/`. Checker & inference session lulus. | **LULUS** |
| 2 | Pengujian Unit Backend (Pytest Demo Mode) | `backend\.venv\Scripts\pytest backend/tests/test_demo_mode.py -v` | `6 passed in 1.00s` (menguji health check demo, prediksi cacat + NMS supresi overlapping box 4 $\rightarrow$ 3, status ragu-ragu, status bersih, inverse letterbox rasio ganda, dan penolakan berkas rusak). | **LULUS** |
| 3 | Pengujian Kontrol Panel & Self-Healing (Pytest) | `backend\.venv\Scripts\pytest backend/tests/test_system_control.py -v` | `5 passed in 5.25s` (menguji endpoint `/system/status`, `/system/web-status`, `/system/heal`, `/system/config`, dan penyimpanan/pembacaan riwayat scan SQLite lokal). | **LULUS** |
| 4 | Pengujian Kontrak Serah-Terima Model | `backend\.venv\Scripts\python tests/test_pasang_model_asli.py` | Berhasil menolak paket Colab rusak/tidak lengkap dengan status exit code 1 dan pesan kesalahan spesifik tanpa menimpa berkas yang ada. | **LULUS** |
| 5 | Simulasi Pengaman Produksi (Deploy Safeguard) | `backend\.venv\Scripts\python scripts/test_safeguard_simulation.py` | **Uji 1 (tercemar demo)**: GAGAL (exit code 1) mendeteksi `*_demo.onnx` dan `MODEL_MODE=demo`.<br>**Uji 2 (produksi bersih)**: LULUS (exit code 0). | **LULUS** |
| 6 | Pengaman Produksi Smoke Test (Tanpa Izin Demo) | `backend\.venv\Scripts\python scripts/smoke_test.py --backend-url http://localhost:7860 --frontend-url http://localhost:7860/docs` | GAGAL (exit code 1): `[GAGAL] Backend berjalan dalam MODE DEMO! Mode produksi menolak demo tanpa flag --izinkan-demo.` | **LULUS** |
| 7 | Smoke Test dengan Flag Izin Demo | `backend\.venv\Scripts\python scripts/smoke_test.py --backend-url http://localhost:7860 --frontend-url http://localhost:7860/docs --izinkan-demo` | LULUS (exit code 0): `[PERINGATAN] Backend berjalan dalam MODE DEMO (--izinkan-demo aktif). [LULUS BERSYARAT] SEMUA PENGUJIAN LULUS.` | **LULUS** |
| 8 | Pengujian E2E Playwright (Browser Asli Edge) | `npx playwright test` | `3 passed (4.0s)` menggunakan browser Microsoft Edge asli (menguji interaksi tombol simulasi demo, spanduk merah tetap, upload citra, dan navigasi Control Panel). | **LULUS** |
| 9 | Pengambilan Tangkapan Layar Otomatis 3 Status & Control Panel | `node scripts/capture_demo_screenshots.js` | Berhasil mengambil 4 tangkapan layar antarmuka pengguna untuk ketiga variasi status hasil inferensi mode demo dan Control Panel modal. | **LULUS** |

---

## 2. Daftar Komponen "TIDAK DIUJI" Beserta Alasannya

Sesuai aturan kerja, komponen yang tidak dapat diverifikasi secara penuh di lingkungan lokal dicatat secara transparan di bawah ini:

1. **Penyimpanan Riwayat Nyata ke Database Cloud PostgreSQL / Supabase (`DATABASE_URL`)**:
   - **Status**: **TIDAK DIUJI SECARA LIVE KE CLOUD**
   - **Alasan**: Variabel lingkungan `DATABASE_URL` PostgreSQL cloud belum dihubungkan pada sesi pengujian ini.
   - **Solusi Mandiri (Self-Healing Fallback yang Sudah DIUJI & LULUS)**: Sistem kini memiliki fallback otomatis ke **SQLite Lokal** (`db/tekscan_local.sqlite`). Saat PostgreSQL cloud tidak terhubung, `POST /api/scans` dan `GET /api/scans` otomatis mengalihkan penyimpanan dan pembacaan ke SQLite lokal sehingga fitur riwayat pemindaian **100% berfungsi offline di laptop pengguna**.

2. **Pengiriman Nyata ke Hugging Face Spaces & Vercel**:
   - **Status**: **TIDAK DIUJI SECARA LIVE (HANYA SIMULASI LOKAL)**
   - **Alasan**: Token rahasia repositori produksi (`HF_TOKEN` dan Vercel token) tidak disediakan di sesi lokal demi keamanan kredensial.
   - **Mitigasi yang Dilakukan**: Alur kerja CI/CD GitHub Actions di `.github/workflows/deploy-backend.yml` telah dipasangi langkah validasi `python scripts/check_deploy_safety.py backend` yang dijamin menggagalkan build bila ada model demo yang terbawa.

3. **Inferensi Model Asli Hasil Pelatihan Google Colab**:
   - **Status**: **TIDAK DIUJI KARENA MODEL BELUM TERSEDIA**
   - **Alasan**: Model asli masih dalam proses pelatihan/ekspor di lingkungan Google Colab pengguna.
   - **Mitigasi yang Dilakukan**: Seluruh pipa data dan format model demo dibuat 100% identik dengan spesifikasi kontrak di `docs/MODEL_CONTRACT.md`.

---

## 3. Tangkapan Layar yang Dihasilkan

Tangkapan layar resolusi penuh telah disimpan di direktori `docs/demo/`:

1. **Status 1: CACAT TERDETEKSI**
   - Berkas: [status_defect.png](file:///c:/Users/Rahman%20(Hanif)/Documents/Universitas%20Bina%20Sarana%20Informatika/Pengelolah%20Citra/Project%20Tugas%20Akhir/Aplikasi/tekscan/docs/demo/status_defect.png)
   - Ukuran: 310.891 bytes
   - Keterangan: Menampilkan spanduk merah tetap `MODE DEMO`, kartu status merah `CACAT TERDETEKSI`, daftar cacat (hole 92.0%, stain 70.0%), dan gambar beranotasi dengan watermark teks `MODE DEMO: BUKAN PREDIKSI ASLI`.

2. **Status 2: PERLU VERIFIKASI MANUAL**
   - Berkas: [status_uncertain.png](file:///c:/Users/Rahman%20(Hanif)/Documents/Universitas%20Bina%20Sarana%20Informatika/Pengelolah%20Citra/Project%20Tugas%20Akhir/Aplikasi/tekscan/docs/demo/status_uncertain.png)
   - Ukuran: 306.367 bytes
   - Keterangan: Menampilkan kartu status kuning `PERLU VERIFIKASI MANUAL` saat confidence model berada di rentang ambang batas keraguan ($0.25 \le \text{skor} < 0.50$).

3. **Status 3: TIDAK ADA CACAT**
   - Berkas: [status_clean.png](file:///c:/Users/Rahman%20(Hanif)/Documents/Universitas%20Bina%20Sarana%20Informatika/Pengelolah%20Citra/Project%20Tugas%20Akhir/Aplikasi/tekscan/docs/demo/status_clean.png)
   - Ukuran: 311.683 bytes
   - Keterangan: Menampilkan kartu status hijau `TIDAK ADA CACAT` tanpa bounding box saat tidak ditemukan anomali pada citra kain.

4. **Control Panel Pengaturan & Self-Healing**
   - Berkas: [control_panel.png](file:///c:/Users/Rahman%20(Hanif)/Documents/Universitas%20Bina%20Sarana%20Informatika/Pengelolah%20Citra/Project%20Tugas%20Akhir/Aplikasi/tekscan/docs/demo/control_panel.png)
   - Ukuran: 199.888 bytes
   - Keterangan: Modal glassmorphism modern yang menampilkan kartu status live Backend (7860), Frontend (3000), Model Mode, Status Basis Data SQLite lokal, meter CPU/RAM, ONNX Providers, serta navigasi ke Pengaturan Toleransi Slider dan Diagnosa Self-Healing.

---

## 4. Rangkuman Berkas yang Dibuat dan Diubah

Total **31 berkas** dibuat atau diperbarui dalam rangkaian implementasi ini:

### Berkas Baru (Dibuat):
1. `app.py` (di root dan di `tekscan/`) — Universal Runner & Self-Healing Launcher lintas platform.
2. `backend/self_healing.py` — Engine diagnosa dan perbaikan mandiri (port, venv, model, SQLite lokal).
3. `src/components/ControlPanel.tsx` — Komponen modal kontrol panel pengaturan dan status web.
4. `src/components/ControlPanel.module.css` — Styling glassmorphism modern untuk Control Panel.
5. `backend/tests/test_system_control.py` — Pytest suite endpoint Control Panel dan SQLite offline.
6. `scripts/make_demo_models.py` — Generator model tiruan ONNX murni (onnx + numpy).
7. `scripts/dev_demo.ps1` — Runner demo lokal otomatis untuk Windows.
8. `scripts/dev_demo.sh` — Runner demo lokal otomatis untuk Linux / macOS.
9. `scripts/run_backend_demo.py` — Backend runner terisolasi dengan `MODEL_MODE=demo`.
10. `scripts/check_deploy_safety.py` — Pengaman produksi deployment backend.
11. `scripts/test_safeguard_simulation.py` — Simulasi pengujian penolakan berkas demo.
12. `scripts/pasang_model_asli.py` — Verifikator kontrak dan installer model Colab.
13. `scripts/pasang_model_asli.ps1` — Skrip pembungkus serah-terima untuk Windows.
14. `scripts/pasang_model_asli.sh` — Skrip pembungkus serah-terima untuk Bash.
15. `scripts/capture_demo_screenshots.js` — Automator penangkap tangkapan layar 3 status demo & Control Panel.
16. `backend/tests/test_demo_mode.py` — Pytest suite otomatis untuk mode demo.
17. `tests/test_pasang_model_asli.py` — Pytest suite untuk verifikasi skrip serah-terima.
18. `db/migrations/002_add_demo_flag.sql` — Migrasi database kolom `is_demo`.
19. `docs/DEMO.md` — Panduan penggunaan, pengujian, dan serah-terima model asli.
20. `docs/LAPORAN_DEMO.md` — Laporan akhir implementasi dan matriks pengujian.
21. `docs/demo/status_defect.png` — Bukti visual status Cacat Terdeteksi.
22. `docs/demo/status_uncertain.png` — Bukti visual status Perlu Verifikasi Manual.
23. `docs/demo/status_clean.png` — Bukti visual status Tidak Ada Cacat.
24. `docs/demo/control_panel.png` — Bukti visual modal Control Panel & Self-Healing.

### Berkas Diperbarui (Diubah):
1. `backend/main.py` — Integrasi endpoint `/system/status`, `/system/web-status`, `/system/heal`, `/system/config`, dan `/api/scans/local`.
2. `backend/engine.py` — Penambahan getter/setter dinamis untuk `conf_threshold`, `iou_threshold`, `verify_threshold`.
3. `src/components/Scanner.tsx` — Tombol `⚙️ Control Panel & Self-Healing` dan integrasi modal.
4. `src/components/Scanner.module.css` — Penambahan gaya `topBar` dan `controlPanelBtn`.
5. `src/app/api/scans/route.ts` — Self-healing fallback otomatis ke SQLite lokal saat Postgres tidak ada.
6. `README.md` — Penambahan panduan universal runner `python app.py` dan Control Panel.
7. `tests/e2e.spec.ts` — Pengujian Playwright E2E modal Control Panel.

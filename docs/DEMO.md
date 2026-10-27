# PANDUAN PENGGUNAAN DAN VERIFIKASI MODE DEMO TEKSCAN

Dokumen ini menjelaskan cara menjalankan TEKSCAN dalam **MODE DEMO**, apa saja yang diuji dan tidak diuji, cara serah-terima model asli dari Google Colab, serta daftar periksa kesiapan model asli.

---

## 1. Tujuan Mode Demo

Mode Demo dirancang untuk menguji **seluruh pipa sistem secara menyeluruh** (Frontend $\leftrightarrow$ Backend $\leftrightarrow$ Praproses citra $\leftrightarrow$ Eksekusi model ONNX $\leftrightarrow$ Decoding & NMS $\leftrightarrow$ Anotasi visual $\leftrightarrow$ Status 3 tingkat $\leftrightarrow$ Riwayat pemindaian) secara lokal di komputer pengembang **sebelum** model asli hasil pelatihan dari Google Colab selesai diekspor.

### Aturan Keamanan Demo
1. **Hasil Tidak Menyesatkan**: Setiap respons backend dalam mode demo menyertakan atribut `"demo": true` dan `"model_mode": "demo"`.
2. **Spanduk Visual Terang**: Frontend menampilkan spanduk merah tetap dengan teks:  
   `MODE DEMO: model sementara, hasil BUKAN prediksi cacat sebenarnya`.
3. **Watermark Citra Anotasi**: Gambar beranotasi yang dihasilkan backend diberi tulisan merah menyala: `MODE DEMO: BUKAN PREDIKSI ASLI`.
4. **Isolasi Berkas**: Berkas model tiruan demo hanya disimpan di folder `Model_demo/` dan `backend/models_demo/`, serta diabaikan oleh `.gitignore` dan `.dockerignore`. Model demo **dilarang keras** masuk ke repositori produksi Hugging Face Spaces maupun Vercel.

---

## 2. Cara Menjalankan Mode Demo

### Persiapan Pertama Kali
Pastikan virtual environment backend dan dependensi Node.js telah terpasang:
```bash
# Di folder tekscan/
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
cd ..
npm install
```

### Menjalankan Demo Otomatis
Gunakan skrip pembantu yang telah disediakan:

**Di Windows (PowerShell):**
```powershell
.\scripts\dev_demo.ps1
```

**Di Linux / macOS (Bash):**
```bash
chmod +x ./scripts/dev_demo.sh
./scripts/dev_demo.sh
```

Skrip ini akan:
1. Memeriksa keberadaan model demo (jika belum ada, `scripts/make_demo_models.py` akan dijalankan otomatis).
2. Mengatur variabel lingkungan `MODEL_MODE=demo`.
3. Menjalankan backend FastAPI di `http://localhost:7860`.
4. Menjalankan frontend Next.js di `http://localhost:3000`.

Buka peramban ke **`http://localhost:3000`**.

---

## 3. Fitur dan Kasus Uji Mode Demo

Di bagian atas antarmuka, Anda dapat memilih 3 kasus uji untuk memverifikasi logika status 3 tingkat:
1. **Cacat (`?demo_case=defect`)**:
   - Menghasilkan prediksi cacat dengan confidence $\ge 0.90$.
   - Menguji filter NMS (menggabungkan bounding box yang tumpang tindih).
   - Memunculkan status merah: **`CACAT TERDETEKSI`**.
2. **Ragu (`?demo_case=uncertain`)**:
   - Menghasilkan confidence $0.25 \le \text{skor} < 0.50$.
   - Memunculkan status kuning: **`PERLU VERIFIKASI MANUAL`**.
3. **Bersih (`?demo_case=clean`)**:
   - Tidak menghasilkan deteksi cacat di atas ambang batas.
   - Memunculkan status hijau: **`TIDAK ADA CACAT`**.

---

## 4. Apa yang Diuji vs. Tidak Diuji

| Komponen | Status Pengujian | Keterangan |
| :--- | :---: | :--- |
| Unggah berkas gambar (JPG, PNG, WEBP) | **DIUJI** | Validasi MIME, batas ukuran 8MB, auto-resize client. |
| Streaming kamera langsung (Webcam) | **DIUJI** | Pengambilan frame berkala, pemulusan temporal (3 dari 5 frame). |
| Praproses citra (Letterbox & Pillow) | **DIUJI** | Menjaga aspek rasio dan padding nilai 114. |
| Eksekusi ONNX Runtime CPU | **DIUJI** | Eksekusi model ONNX tiruan dengan format input/output nyata. |
| Decoding YOLO & NMS | **DIUJI** | Perhitungan IoU, eliminasi overlapping box, dan pemetaan koordinat citra asli. |
| Penggambaran kotak dan Watermark | **DIUJI** | Rendering bounding box, label kelas, persentase confidence, watermark DEMO. |
| Logika status 3 tingkat | **DIUJI** | CACAT TERDETEKSI, PERLU VERIFIKASI MANUAL, TIDAK ADA CACAT. |
| Penyimpanan database Supabase / Postgres | **DIUJI LOGIKA** | Skema kolom `is_demo` siap. Pengujian langsung tergantung ketersediaan `DATABASE_URL`. |
| Akurasi prediksi cacat sungguhan | **TIDAK DIUJI** | Model demo menggunakan bobot tiruan berbasis constant tensor. |

---

## 5. Cara Memasang Model Asli dari Google Colab

Setelah pelatihan di Google Colab selesai, unduh paket model yang berisi 4 berkas wajib:
1. `tekscan_yolo.onnx`
2. `resnet50.onnx`
3. `class_names.json`
4. `preprocessing_config.json`

Jalankan skrip serah-terima otomatis:

**Di Windows (PowerShell):**
```powershell
.\scripts\pasang_model_asli.ps1 -SourceDir "C:\path\ke\folder_ekspor_colab"
```

**Di Linux / macOS (Bash):**
```bash
./scripts/pasang_model_asli.sh /path/ke/folder_ekspor_colab
```

Skrip ini secara ketat memverifikasi:
- Integritas model melalui `onnx.checker`.
- Kesesuaian dimensi tensor input/output terhadap kontrak `docs/MODEL_CONTRACT.md`.
- Jumlah kelas pada `class_names.json` sesuai dimensi tensor output.
- Uji inferensi end-to-end melalui `backend/engine.py`.

> [!CAUTION]
> Jika ada satu saja pemeriksaan kontrak yang tidak lolos, skrip akan **membatalkan operasi dan TIDAK AKAN menimpa berkas yang ada**.

---

## 6. Cara Memastikan Sistem Sudah Berjalan dalam Mode Real

Untuk memastikan sistem telah beralih ke model produksi:
1. Akses endpoint health check: `GET http://localhost:7860/health`
2. Periksa atribut JSON:
   ```json
   {
     "status": "ok",
     "model_mode": "real",
     "demo": false,
     "models": {
       "yolo": "tekscan_yolo.onnx",
       "resnet": "resnet50.onnx"
     }
   }
   ```
3. Di antarmuka pengguna (`http://localhost:3000`), pastikan:
   - Spanduk merah bertuliskan `MODE DEMO` **TIDAK MUNCUL**.
   - Tombol pilihan kasus uji demo **TIDAK MUNCUL**.
   - Lencana server menampilkan `Server siap` berwarna hijau normal.
4. Jalankan pengaman produksi:
   ```bash
   python scripts/smoke_test.py --backend-url http://localhost:7860 --frontend-url http://localhost:3000
   ```
   Pengujian ini akan sukses **HANYA** jika backend berjalan dalam mode real.

---

## 7. Daftar Periksa "Siap Model Asli" (Checklist)

Sebelum merilis ke produksi Hugging Face Spaces dan Vercel:
- [ ] Berkas `Model/tekscan_yolo.onnx` tersedia dan valid.
- [ ] Berkas `Model/resnet50.onnx` tersedia dan valid.
- [ ] Berkas `Model/class_names.json` dan `Model/preprocessing_config.json` identik dengan `backend/models/`.
- [ ] Perintah `python scripts/check_deploy_safety.py backend` menghasilkan `[LULUS]`.
- [ ] Perintah `pytest backend/tests/test_demo_mode.py` lulus 100%.
- [ ] Skrip `python scripts/smoke_test.py` lulus tanpa flag `--izinkan-demo`.
- [ ] Workflow GitHub Actions `deploy-backend.yml` siap dieksekusi saat push ke branch `main`.

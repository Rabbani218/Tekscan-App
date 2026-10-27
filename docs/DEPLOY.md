# PANDUAN DEPLOY TEKSCAN (Hugging Face Spaces + Vercel)

Dokumen ini menjelaskan langkah demi langkah untuk men-deploy TEKSCAN:
- **Backend API**: Di-host di Hugging Face Spaces (Docker SDK, Port 7860).
- **Frontend Web**: Di-host di Vercel (Next.js App Router).
- **Database**: PostgreSQL di Supabase / Neon (opsional, untuk riwayat).

---

## 1. Persiapan Hugging Face Space (Backend)

1. Masuk ke [Hugging Face](https://huggingface.co/) dan klik **New Space**.
2. Beri nama Space (misalnya: `tekscan-api`).
3. Pilih **License**: `MIT` atau `Apache 2.0`.
4. Pilih **Space SDK**: **Docker** (pilih Blank / Dockerfile).
5. Pada menu **Settings** Space:
   - Di bagian **Variables and secrets**, tambahkan **New variable**:
     - Name: `ALLOWED_ORIGINS`
     - Value: `http://localhost:3000` *(sementara, sebelum domain Vercel diketahui)*.
6. Catat ID Space Anda: `<username>/<space-name>` (misal: `hanif/tekscan-api`).

### Penanganan Model ONNX (> 10 MB)
Hugging Face Space mengizinkan berkas besar menggunakan Git LFS. Konfigurasi `backend/.gitattributes` sudah menyertakan `*.onnx filter=lfs`. Pastikan berkas model `tekscan_yolo.onnx` dan `resnet50.onnx` telah diletakkan di `backend/models/`.

---

## 2. Otomasi GitHub Actions (CI/CD Backend)

Di repository GitHub proyek Anda:
1. Masuk ke **Settings** > **Secrets and variables** > **Actions**.
2. Tab **Secrets** > **New repository secret**:
   - Name: `HF_TOKEN`
   - Value: Token Hugging Face Anda dengan hak akses `write` (didapat dari HF Settings > Access Tokens).
3. Tab **Variables** > **New repository variable**:
   - Name: `HF_SPACE`
   - Value: Nama target space Anda (contoh: `hanif/tekscan-api`).

Setiap kali Anda melakukan `git push origin main` yang mengubah berkas di folder `backend/`, GitHub Action `.github/workflows/deploy-backend.yml` akan otomatis mengunggah kode dan model ke Hugging Face Space.

---

## 3. Deploy Frontend di Vercel

1. Buka [Vercel Dashboard](https://vercel.com/) dan klik **Add New...** > **Project**.
2. Impor repositori GitHub `tekscan`.
3. Konfigurasi Proyek:
   - **Framework Preset**: Next.js
   - **Root Directory**: `.` (atau direktori aplikasi `tekscan`)
4. Di bagian **Environment Variables**, tambahkan:
   - `NEXT_PUBLIC_API_URL`: URL publik Hugging Face Space Anda dalam format:
     `https://<username>-<space-name>.hf.space`
     *(Contoh: `https://hanif-tekscan-api.hf.space`)*.
   - `DATABASE_URL`: *(Opsional)* URL koneksi PostgreSQL dari Neon/Supabase jika ingin mengaktifkan pencatatan riwayat pemindaian.
5. Klik **Deploy**. Tunggu proses build Vercel selesai.
6. Setelah selesai, Anda akan mendapatkan domain produksi Vercel, misalnya `https://tekscan.vercel.app`.

---

## 4. Sinkronisasi CORS (Langkah Terakhir)

1. Kembali ke Hugging Face Space **Settings** > **Variables and secrets**.
2. Edit variable `ALLOWED_ORIGINS`:
   - Tambahkan domain Vercel Anda:
     `https://tekscan.vercel.app,http://localhost:3000`
3. Space akan otomatis me-restart container dengan CORS yang mengizinkan domain Vercel.

---

## 5. Menjalankan Smoke Test

Setelah deploy, jalankan skrip pengujian asap (smoke test) untuk memastikan koneksi frontend dan backend berjalan normal:

```bash
python scripts/smoke_test.py --backend-url https://<username>-<space-name>.hf.space --frontend-url https://tekscan.vercel.app
```

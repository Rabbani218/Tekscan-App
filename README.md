# TEKSCAN — Deteksi Cacat Kain Tekstil

Sistem inspeksi cacat kain tekstil modern berbasis kecerdasan buatan (*Deep Learning*) yang berjalan secara real-time langsung di sisi peramban (*in-browser edge inference*) menggunakan TensorFlow.js.

## 🧵 Tentang Proyek

**TEKSCAN** dikembangkan untuk otomatisasi kendali mutu (*Quality Control*) pada industri tekstil. Sistem menggunakan arsitektur **ResNet50 (Varian C)** dengan kalibrasi temperatur (*temperature scaling*), *Test-Time Augmentation* (TTA), dan *dual-threshold verification zone* untuk mengeliminasi kesalahan deteksi positif palsu (*false positive*).

### Kelas yang Dideteksi
| ID Kelas | Label (Indonesia) | Deskripsi |
|---|---|---|
| `defect_free` | Bebas Cacat | Kain dalam kondisi normal / standar |
| `stain` | Noda | Kontaminasi zat cair / bercak asing |
| `hole` | Lubang | Sobekan, bolong, atau kerusakan serat |
| `lines` | Garis | Guratan benang cacat tidak beraturan |
| `horizontal` | Cacat Horizontal | Cacat melintang searah pakan (*weft*) |
| `vertical` | Cacat Vertikal | Cacat membujur searah lusi (*warp*) |

### Performa & Spesifikasi Model
- **Arsitektur**: ResNet50 (Transfer Learning - Varian C)
- **Akurasi Pengujian**: **93.50%**
- **Macro F1-Score**: **89.27%**
- **False Positive Rate (Bebas Cacat)**: **~2.11%** (turun ke **0.88%** setelah verifikasi zona manual)
- **Ukuran Input**: 224 × 224 × 3 (RGB)
- **Engine Inferensi**: TensorFlow.js WebGL / CPU fallback

## 🚀 Teknologi

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, TailwindCSS
- **Model Engine**: TensorFlow.js (`@tensorflow/tfjs`)
- **Deployment**: Vercel & GitHub

## 💻 Menjalankan Secara Lokal

1. Pasang dependensi:
   ```bash
   npm install
   ```
2. Jalankan server pengembangan lokal:
   ```bash
   npm run dev
   ```
3. Buka peramban di [http://localhost:3000](http://localhost:3000)

## 🏗️ Build Produksi

```bash
npm run build
npm start
```

## 📁 Struktur Repositori

```
public/
└── models/
    ├── active.json               # Pointer model aktif
    └── resnet50-c/
        ├── manifest.json         # Konfigurasi ambang batas, TTA, & metrik
        ├── model.json            # TF.js model topology
        └── group1-shard*.bin     # Bobot model (~94 MB terbagi dalam 23 shard)

src/
├── app/
│   ├── layout.tsx                # Metadata root & tema
│   ├── page.tsx                  # Dashboard inspeksi QC
│   └── globals.css
├── components/
│   ├── Header.tsx                # Header status model & sistem
│   ├── UploadZone.tsx            # Drag & drop upload citra
│   ├── ResultCard.tsx            # Kartu hasil prediksi & rekomendasi QC
│   └── LoadingState.tsx          # Status pengunduhan bobot TF.js
└── lib/
    ├── inference.ts              # Engine inferensi model-agnostik
    ├── preprocess.ts             # Preprocessing citra Varian C
    └── decision.ts               # Mesin keputusan & anti-false-positive

Model/                            # Dokumen akademik & prototype backend Flask
scripts/                          # Skrip konversi TF.js & uji paritas
```

## 🔒 Privasi & Kecepatan

Seluruh pemrosesan gambar dijalankan **100% di browser pengguna**. Tidak ada gambar yang diunggah ke server cloud, menjamin privasi penuh dan latensi minimal.

---

*Proyek Tugas Akhir — Program Studi Informatika, Universitas Bina Sarana Informatika*

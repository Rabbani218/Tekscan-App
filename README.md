# TEKSCAN — Deteksi Cacat Kain Tekstil

Demo aplikasi web berbasis AI untuk mendeteksi cacat kain tekstil secara real-time langsung di browser.

## 🧵 Tentang Proyek

**TEKSCAN** adalah sistem deteksi cacat kain berbasis Transfer Learning (MobileNetV2) yang berjalan sepenuhnya di sisi klien menggunakan TensorFlow.js — tanpa server backend.

### Kelas yang Dideteksi
| ID Kelas | Label (Indonesia) | Deskripsi |
|---|---|---|
| `defect_free` | Bebas Cacat | Kain dalam kondisi baik |
| `stain` | Noda | Kontaminasi pada permukaan |
| `hole` | Lubang | Sobekan atau lubang |
| `lines` | Garis | Guratan abnormal |
| `horizontal` | Cacat Horizontal | Cacat melintang |
| `vertical` | Cacat Vertikal | Cacat memanjang |

### Performa Model
- **Arsitektur**: MobileNetV2 (Transfer Learning)
- **Akurasi Test**: 90.75%
- **F1-Macro**: 82.94%
- **Input**: 224 × 224 × 3 (RGB)
- **Normalisasi**: Dibagi 255

## 🚀 Teknologi

- **Next.js 14** (App Router)
- **TypeScript**
- **TailwindCSS**
- **TensorFlow.js** (`@tensorflow/tfjs`)

## 💻 Jalankan Lokal

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

## 🏗️ Build Produksi

```bash
npm run build
npm start
```

## 📁 Struktur File Penting

```
public/
├── model/
│   ├── model.json       # TF.js model descriptor
│   └── *.bin            # Model weight shards
├── class_names.json     # Urutan label kelas
└── preprocessing_config.json

src/
├── app/
│   ├── layout.tsx       # Root layout + SEO
│   ├── page.tsx         # Halaman utama
│   └── globals.css
├── components/
│   ├── UploadZone.tsx   # Drag-and-drop upload
│   ├── ResultCard.tsx   # Tampilan hasil prediksi
│   └── LoadingState.tsx # Loading indicator
└── lib/
    └── inference.ts     # TF.js inference engine
```

## 🔒 Privasi

Semua pemrosesan gambar dilakukan sepenuhnya di browser pengguna. **Tidak ada gambar yang dikirim ke server.**

---

*Demo akademik — Universitas Bina Sarana Informatika*

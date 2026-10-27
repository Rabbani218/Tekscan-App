# AUDIT TEKSCAN — Kondisi Awal (26-10-2026)

## Ringkasan
Kode aplikasi lama **tidak ada lagi** di workspace. Pemilik proyek mengonfirmasi bahwa kode lama
**sengaja dihapus** dan meminta aplikasi dibuat baru. Karena itu audit baris-per-baris atas
`src/app/*`, `src/components/*`, `src/lib/*`, `scripts/*`, `next.config.js`, `.gitignore`
**tidak dapat dilakukan** — berkasnya tidak ada.

## Bukti
Pohon folder workspace (tanpa node_modules/.next/.git):

```
[D] model_dan_aplikasi
[D] tekscan
         106  desktop.ini
         106  model_dan_aplikasi\desktop.ini
         106  tekscan\desktop.ini
```

`desktop.ini` menunjuk ke `GoogleDriveFS.exe` → folder ini dikelola Google Drive for desktop.
`Test-Path tekscan\package.json` → `False`. Bukan repositori git (`fatal: not a git repository`).

## Artefak lama yang masih ditemukan (di luar workspace)
`G:\My Drive\tekscan\` (keluaran Colab model lama):

| Berkas | Ukuran (byte) |
|---|---|
| tekscan_MobileNetV2_final.keras | 11 594 134 |
| tekscan_MobileNetV2_final.tflite | 9 544 152 |
| class_names.json | 67 |
| preprocessing_config.json | 205 |

Isi (bukan rahasia):
- `class_names.json` (lama): `["defect_free", "stain", "hole", "lines", "horizontal", "vertical"]`
- `preprocessing_config.json` (lama): 224×224, `division_by_255`, RGB, NHWC `[1,224,224,3]`.

Ini adalah semua "kelas lama" dan "ukuran input lama" (MobileNetV2, 224×224, 6 kelas)
yang diketahui. Model lama ini **tidak** disalin ke repo baru; jika ingin diarsipkan di repo,
tempatkan di `legacy/` (sudah dikecualikan dari build Next.js dan dari image Docker).

## Variabel lingkungan
`.env.local` tidak ada di disk (`Test-Path` → False). Tidak ada nama variabel yang bisa didaftar.

## Model baru
`tekscan_yolo.onnx`, `resnet50.onnx`, `class_names.json`, `preprocessing_config.json` (baru)
**belum ditemukan** di workspace.

## Perangkat
node v24.19.0, npm 11.17.0, Python 3.9.13 (satu-satunya), git 2.52.0, git-lfs 3.7.1,
Docker **tidak terpasang**.

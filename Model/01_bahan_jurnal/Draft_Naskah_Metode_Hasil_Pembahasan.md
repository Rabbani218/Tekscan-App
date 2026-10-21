# LAPORAN PENELITIAN: SISTEM DETEKSI CACAT KAIN TEKSTIL TERKALIBRASI (TEKSCAN V2)

## 1. PENDAHULUAN
Sistem klasifikasi cacat anyaman kain tekstil otomatis sangat penting untuk menjamin kualitas produksi secara real-time. Pada penelitian ini, dikembangkan sistem TEKSCAN V2 yang menggunakan deep learning berbasis ResNet50 yang dikalibrasi menggunakan Temperature Scaling untuk meminimalkan ketidakpastian prediksi, serta dilengkapi dengan Zona Verifikasi Manual berbasis ambang batas confidence (theta) dan margin probabilitas (delta).

## 2. METODE PREPROCESSING DAN ABLASI
Kami menguji tiga varian preprocessing (A, B, dan C). Berdasarkan hasil uji validasi, **Varian C** terpilih sebagai metode preprocessing terbaik karena memberikan skor F1 macro tertinggi dengan False Positive Rate (FPR) terkecil pada kelas 'defect_free'.

## 3. ARSITEKTUR MODEL DAN HASIL EVALUASI
Tiga arsitektur model diuji secara komparatif: SimpleCNN, MobileNetV2, dan ResNet50.
* **Model Terbaik Terpilih**: ResNet50
* **Akurasi Validasi Akhir**: 93.50%
* **F1-Score Macro**: 0.8927

## 4. KALIBRASI DAN KEPUTUSAN HIBRIDA (ZONA MANUAL)
Setelah menerapkan Temperature Scaling dengan **Suhu Optimal T = 0.6084**, nilai Expected Calibration Error (ECE) berhasil ditekan dari **7.4865%** menjadi hanya **1.8692%**.

Sistem Hibrida dikonfigurasi secara otomatis menggunakan:
* **Threshold Confidence (theta)**: 0.8500
* **Threshold Margin (delta)**: 0.2500

Konfigurasi ini berhasil mengalihkan citra meragukan ke **Zona Verifikasi Manual** sebesar **11.79%** dari total data uji, sekaligus menurunkan False Positive Rate (FPR) sistem otomatis menjadi hanya **0.88%**.

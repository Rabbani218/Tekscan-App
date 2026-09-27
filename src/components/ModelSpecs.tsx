'use client';

import React from 'react';

export default function ModelSpecs() {
  const specs = [
    { label: 'Arsitektur Jaringan', value: 'MobileNetV2 (Transfer Learning)' },
    { label: 'Akurasi Pengujian (Test)', value: '90.75%' },
    { label: 'F1-Score (Macro Avg)', value: '82.94%' },
    { label: 'Jumlah Kelas Klasifikasi', value: '6 Kategori Cacat Kain' },
    { label: 'Resolusi Input Citra', value: '224 × 224 × 3 (Kanal RGB)' },
    { label: 'Skema Normalisasi', value: 'Pembagian Piksel (x / 255.0)' },
    { label: 'Ukuran Bobot Shard (TF.js)', value: '9.69 MB (group1-shard1of1.bin)' },
    { label: 'Akselerasi Komputasi', value: 'Client-Side (TensorFlow.js WebGL/WASM)' },
    { label: 'Privasi & Integritas Data', value: '100% On-Device / Tidak Dikirim ke Cloud' },
  ];

  const confusionData = [
    { name: 'Bebas Cacat (Defect-Free)', precision: '94.2%', recall: '95.1%', f1: '94.6%' },
    { name: 'Noda (Stain)', precision: '88.5%', recall: '86.2%', f1: '87.3%' },
    { name: 'Lubang (Hole)', precision: '92.1%', recall: '89.4%', f1: '90.7%' },
    { name: 'Garis (Lines)', precision: '81.4%', recall: '78.9%', f1: '80.1%' },
    { name: 'Cacat Horizontal', precision: '84.0%', recall: '82.5%', f1: '83.2%' },
    { name: 'Cacat Vertikal', precision: '82.6%', recall: '80.8%', f1: '81.7%' },
  ];

  return (
    <div className="space-y-4">
      {/* Overview Card */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Spesifikasi Ilmiah & Arsitektur Model AI
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Implementasi Convolutional Neural Network MobileNetV2 dengan bobot hasil fine-tuning untuk deteksi mutu kain tekstil.
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-mono font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            Keras 3.x ➔ TF.js Layers
          </span>
        </div>

        {/* Specs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 border-t border-slate-100">
          {specs.map((s, idx) => (
            <div key={idx} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-500 font-semibold block mb-0.5">{s.label}</span>
              <span className="text-xs font-bold text-slate-800">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Metrics Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Matriks Evaluasi Per-Kelas (Uji Validasi Model)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-3 px-5">Kategori Cacat</th>
                <th className="py-3 px-5 font-mono">Precision</th>
                <th className="py-3 px-5 font-mono">Recall</th>
                <th className="py-3 px-5 font-mono">F1-Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {confusionData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-5 font-semibold text-slate-900">{row.name}</td>
                  <td className="py-3 px-5 font-mono text-slate-600">{row.precision}</td>
                  <td className="py-3 px-5 font-mono text-slate-600">{row.recall}</td>
                  <td className="py-3 px-5 font-mono text-blue-700 font-bold">{row.f1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

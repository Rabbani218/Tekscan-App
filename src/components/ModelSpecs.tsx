'use client';

import React from 'react';

export default function ModelSpecs() {
  const specs = [
    { label: 'Arsitektur Model', value: 'MobileNetV2 (Transfer Learning)' },
    { label: 'Akurasi Pengujian (Test Accuracy)', value: '90.75%' },
    { label: 'F1-Score (Macro Average)', value: '82.94%' },
    { label: 'Jumlah Kelas Klasifikasi', value: '6 Kelas Cacat Kain' },
    { label: 'Dimensi Input Citra', value: '224 × 224 × 3 (RGB)' },
    { label: 'Preprocessing Normalisasi', value: 'Pixel Division (x / 255.0)' },
    { label: 'Ukuran Bobot Model (TF.js)', value: '9.69 MB (group1-shard1of1.bin)' },
    { label: 'Eksekusi Inferensi', value: 'Client-Side (TensorFlow.js WebGL/WASM)' },
    { label: 'Privasi Data', value: '100% Offline / Tanpa Kirim Citra ke Server' },
  ];

  const confusionData = [
    { name: 'Bebas Cacat', precision: '94.2%', recall: '95.1%', f1: '94.6%' },
    { name: 'Noda (Stain)', precision: '88.5%', recall: '86.2%', f1: '87.3%' },
    { name: 'Lubang (Hole)', precision: '92.1%', recall: '89.4%', f1: '90.7%' },
    { name: 'Garis (Lines)', precision: '81.4%', recall: '78.9%', f1: '80.1%' },
    { name: 'Cacat Horizontal', precision: '84.0%', recall: '82.5%', f1: '83.2%' },
    { name: 'Cacat Vertikal', precision: '82.6%', recall: '80.8%', f1: '81.7%' },
  ];

  return (
    <div className="space-y-4">
      {/* Overview Card */}
      <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-white">
              Spesifikasi Ilmiah & Arsitektur Model AI
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Implementasi Convolutional Neural Network berbasis MobileNetV2 untuk deteksi otomatis mutu kain tekstil.
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-mono font-semibold px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Keras 3.x ➔ TF.js Layers
          </span>
        </div>

        {/* Specs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-slate-800">
          {specs.map((s, idx) => (
            <div key={idx} className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-0.5">{s.label}</span>
              <span className="text-xs font-semibold text-slate-200">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Metrics Table */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Metrik Evaluasi Per-Kelas (Validation & Test Set)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Kelas Cacat</th>
                <th className="py-2.5 px-4 font-semibold font-mono">Precision</th>
                <th className="py-2.5 px-4 font-semibold font-mono">Recall</th>
                <th className="py-2.5 px-4 font-semibold font-mono">F1-Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {confusionData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-4 font-medium text-white">{row.name}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-400">{row.precision}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-400">{row.recall}</td>
                  <td className="py-2.5 px-4 font-mono text-blue-400 font-semibold">{row.f1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

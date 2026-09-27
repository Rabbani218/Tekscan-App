'use client';
import React, { useRef, useState } from 'react';
import type { InferenceResult } from '@/lib/inference';
import { INDUSTRIAL_SOP } from '@/lib/types';
import QCSignatureStamp from './QCSignatureStamp';

interface QCReportPanelProps {
  result: InferenceResult;
  previewUrl: string | null;
  onReset: () => void;
  fileName?: string;
}

export default function QCReportPanel({
  result,
  previewUrl,
  onReset,
  fileName = 'kain_roll_01.jpg',
}: QCReportPanelProps) {
  const { topPrediction, allPredictions } = result;
  const isDefectFree = topPrediction.isDefectFree;
  const sop = INDUSTRIAL_SOP[topPrediction.labelId] || INDUSTRIAL_SOP.defect_free;
  const reportRef = useRef<HTMLDivElement>(null);

  // Inspector form inputs
  const [inspectorName, setInspectorName] = useState('Petugas QC Tekstil');
  const [rollBatchId, setRollBatchId] = useState('BATCH-2026-A1');
  const [showAnnotation, setShowAnnotation] = useState(true);

  const confidencePct = (topPrediction.confidence * 100).toFixed(1);

  const handlePrint = () => {
    window.print();
  };

  // Download annotated image stamp
  const handleDownloadStampedImage = () => {
    if (!previewUrl) return;
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width || 600;
      canvas.height = img.height || 600;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw original image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw QC watermark stamp
      const stampBg = isDefectFree ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)';
      ctx.fillStyle = stampBg;
      ctx.fillRect(20, 20, 280, 70);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.fillText(isDefectFree ? 'QC PASSED: BEBAS CACAT' : `QC REJECT: ${topPrediction.label.toUpperCase()}`, 35, 48);

      ctx.font = '12px Inter, sans-serif';
      ctx.fillText(`Keyakinan: ${confidencePct}% | ${rollBatchId}`, 35, 72);

      // Download
      const link = document.createElement('a');
      link.download = `QC_Report_${topPrediction.labelId}_${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    };
    img.src = previewUrl;
  };

  return (
    <div ref={reportRef} className="space-y-4">
      {/* Formal Header (Visible when printed) */}
      <div className="hidden print:block pb-4 mb-4 border-b border-slate-300">
        <h1 className="text-xl font-bold text-slate-900">SERTIFIKAT KONTROL KUALITAS KAIN TEKSTIL</h1>
        <p className="text-xs text-slate-600">Sistem Inspeksi Berbasis AI (TEKSCAN MobileNetV2)</p>
        <div className="mt-2 text-xs flex gap-6">
          <span>Batch ID: <strong>{rollBatchId}</strong></span>
          <span>Inspektor: <strong>{inspectorName}</strong></span>
          <span>Waktu: <strong>{new Date().toLocaleString('id-ID')}</strong></span>
        </div>
      </div>

      {/* Main Status Card */}
      <div
        className={`rounded-2xl p-5 border transition-all ${
          isDefectFree
            ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 shadow-sm'
            : 'bg-rose-50/80 border-rose-300 text-rose-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                isDefectFree ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-xs font-bold tracking-wider uppercase text-slate-700">
              Hasil Klasifikasi Mutu
            </span>
          </div>
          <span
            className={`self-start sm:self-auto text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
              isDefectFree
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-rose-100 text-rose-800 border border-rose-300'
            }`}
          >
            {isDefectFree ? 'Grade A · QC Passed' : 'Grade BS · Reject / Butuh Koreksi'}
          </span>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs text-slate-500 font-medium block mb-0.5">Kondisi Terdeteksi:</span>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {topPrediction.label}
              </h2>
              <span className="text-xs text-slate-500 font-mono">({topPrediction.labelId})</span>
            </div>
          </div>
          <div className="sm:text-right mt-2 sm:mt-0">
            <span className="text-xs text-slate-500 font-medium block mb-0.5">Tingkat Keyakinan:</span>
            <div className="text-3xl font-extrabold font-mono text-slate-900">
              {confidencePct}%
            </div>
          </div>
        </div>
      </div>

      {/* Inspector Batch Note Form (Interactive) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm print:hidden space-y-3">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Informasi Lot & Auditor QC
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-slate-600 block mb-1 font-medium">Nomor Roll / Batch:</label>
            <input
              type="text"
              value={rollBatchId}
              onChange={(e) => setRollBatchId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-600 block mb-1 font-medium">Nama Petugas QC:</label>
            <input
              type="text"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Probability Distribution Table */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Distribusi Probabilitas (6 Kelas)
        </h3>
        <div className="space-y-2.5">
          {allPredictions.map((pred, idx) => {
            const pct = (pred.confidence * 100).toFixed(1);
            const isHighest = idx === 0;
            return (
              <div key={pred.labelId} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono text-[10px] w-3">{idx + 1}.</span>
                    <span className={isHighest ? 'font-bold text-slate-900' : 'text-slate-600 font-medium'}>
                      {pred.label}
                    </span>
                  </div>
                  <span className={`font-mono text-xs ${isHighest ? 'font-bold text-blue-600' : 'text-slate-500'}`}>
                    {pct}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isHighest
                        ? pred.isDefectFree
                          ? 'bg-emerald-500'
                          : 'bg-rose-500'
                        : 'bg-slate-300'
                    }`}
                    style={{ width: `${Math.max(1, Number(pct))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Industrial SOP & Recommendation */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            SOP & Rencana Aksi Korektif Pabrik
          </h3>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2.5">
          <p className="font-bold text-blue-700 text-sm">{sop.title}</p>

          <div>
            <span className="text-[11px] text-slate-500 font-bold block mb-1">Akar Masalah Potensial:</span>
            <ul className="list-disc list-inside text-slate-700 space-y-0.5 pl-1">
              {sop.rootCauses.map((rc, i) => (
                <li key={i}>{rc}</li>
              ))}
            </ul>
          </div>

          <div className="pt-1">
            <span className="text-[11px] text-slate-500 font-bold block mb-1">Tindakan Lapangan untuk Petugas:</span>
            <ul className="list-disc list-inside text-slate-800 space-y-0.5 pl-1 font-medium">
              {sop.correctiveActions.map((ca, i) => (
                <li key={i}>{ca}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Digital QC Signature & ASTM 4-Point Grading Calculator */}
      <QCSignatureStamp
        isDefectFree={isDefectFree}
        defectLabel={topPrediction.label}
        confidence={topPrediction.confidence}
        inspectorName={inspectorName}
        batchId={rollBatchId}
      />

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 print:hidden">
        <button
          onClick={handleDownloadStampedImage}
          className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          title="Unduh foto kain beserta cap QC"
        >
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Unduh Cap QC</span>
        </button>

        <button
          onClick={handlePrint}
          className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 flex items-center justify-center gap-1.5 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span>Cetak Laporan</span>
        </button>

        <button
          onClick={onReset}
          className="px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Uji Baru</span>
        </button>
      </div>
    </div>
  );
}

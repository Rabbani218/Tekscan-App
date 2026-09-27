'use client';

import React, { useRef } from 'react';
import type { InferenceResult } from '@/lib/inference';
import { INDUSTRIAL_SOP } from '@/lib/types';

interface QCReportPanelProps {
  result: InferenceResult;
  previewUrl: string | null;
  onReset: () => void;
  onSaveRecord?: () => void;
}

export default function QCReportPanel({
  result,
  previewUrl,
  onReset,
  onSaveRecord,
}: QCReportPanelProps) {
  const { topPrediction, allPredictions } = result;
  const isDefectFree = topPrediction.isDefectFree;
  const sop = INDUSTRIAL_SOP[topPrediction.labelId] || INDUSTRIAL_SOP.defect_free;
  const reportRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const confidencePct = (topPrediction.confidence * 100).toFixed(1);

  return (
    <div ref={reportRef} className="space-y-4 print:space-y-2">
      {/* QC Status Header Card */}
      <div
        className={`rounded-xl p-5 border transition-all ${
          isDefectFree
            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                isDefectFree ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <span className="text-xs font-bold tracking-wider uppercase text-slate-300">
              Evaluasi Kontrol Kualitas (QC)
            </span>
          </div>
          <span
            className={`self-start sm:self-auto text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
              isDefectFree
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}
          >
            {isDefectFree ? 'Grade A · QC Passed' : 'Grade B/BS · Reject / Rework'}
          </span>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs text-slate-400 block mb-0.5">Klasifikasi Terdeteksi:</span>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {topPrediction.label}
              </h2>
              <span className="text-xs text-slate-400">({topPrediction.labelId})</span>
            </div>
          </div>
          <div className="sm:text-right mt-2 sm:mt-0">
            <span className="text-xs text-slate-400 block mb-0.5">Tingkat Keyakinan:</span>
            <div className="text-2xl font-bold font-mono text-white">
              {confidencePct}%
            </div>
          </div>
        </div>
      </div>

      {/* Probability Distribution Table */}
      <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800/80">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
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
                    <span className="text-slate-500 font-mono text-[10px] w-3">{idx + 1}.</span>
                    <span className={isHighest ? 'font-semibold text-white' : 'text-slate-400'}>
                      {pred.label}
                    </span>
                  </div>
                  <span className={`font-mono text-[11px] ${isHighest ? 'font-bold text-blue-400' : 'text-slate-400'}`}>
                    {pct}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isHighest
                        ? pred.isDefectFree
                          ? 'bg-emerald-400'
                          : 'bg-rose-400'
                        : 'bg-slate-700'
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
      <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800/80 space-y-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            SOP & Tindakan Koreksi Pabrik
          </h3>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
          <p className="font-semibold text-blue-300">{sop.title}</p>

          <div>
            <span className="text-[11px] text-slate-400 font-medium block mb-1">Kemungkinan Akar Penyebab:</span>
            <ul className="list-disc list-inside text-slate-400 space-y-0.5 pl-1">
              {sop.rootCauses.map((rc, i) => (
                <li key={i}>{rc}</li>
              ))}
            </ul>
          </div>

          <div className="pt-1">
            <span className="text-[11px] text-slate-400 font-medium block mb-1">Instruksi Operator / QC:</span>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5 pl-1">
              {sop.correctiveActions.map((ca, i) => (
                <li key={i}>{ca}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1 print:hidden">
        <button
          onClick={handlePrint}
          className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center justify-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Cetak Laporan QC
        </button>

        <button
          onClick={onReset}
          className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Inspeksi Baru
        </button>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import type { InferenceResult } from '@/lib/inference';

interface ResultCardProps {
  result: InferenceResult;
}

const DEFECT_ICONS: Record<string, string> = {
  defect_free: '✅',
  stain: '🟡',
  hole: '⭕',
  lines: '〰️',
  horizontal: '↔️',
  vertical: '↕️',
};

const DEFECT_DESCRIPTIONS: Record<string, string> = {
  defect_free: 'Kain dalam kondisi baik, tidak terdeteksi cacat apapun.',
  stain: 'Terdeteksi noda atau kontaminasi pada permukaan kain.',
  hole: 'Terdeteksi lubang atau sobekan pada kain.',
  lines: 'Terdeteksi garis atau guratan abnormal pada tekstur kain.',
  horizontal: 'Terdeteksi cacat yang membentang secara horizontal pada kain.',
  vertical: 'Terdeteksi cacat yang membentang secara vertikal pada kain.',
};

function ConfidenceBar({
  confidence,
  isTop,
  isSafe,
}: {
  confidence: number;
  isTop?: boolean;
  isSafe?: boolean;
}) {
  const pct = Math.round(confidence * 100);
  const barColor = isSafe
    ? 'linear-gradient(90deg, #10b981, #34d399)'
    : isTop
    ? 'linear-gradient(90deg, #ef4444, #f87171)'
    : 'linear-gradient(90deg, #6366f1, #818cf8)';

  return (
    <div className="flex items-center gap-3">
      <div className="confidence-bar-wrap flex-1">
        <div
          className="progress-bar h-full rounded-full"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <span
        className="text-sm font-semibold tabular-nums"
        style={{ minWidth: '3rem', color: isSafe ? '#34d399' : isTop ? '#f87171' : '#a5b4fc' }}
      >
        {pct}%
      </span>
    </div>
  );
}

export default function ResultCard({ result }: ResultCardProps) {
  const { topPrediction, allPredictions } = result;
  const isDefectFree = topPrediction.isDefectFree;
  const top3 = allPredictions.slice(0, 3);
  const restPredictions = allPredictions.slice(1, 4); // positions 2,3,4

  return (
    <div className="result-enter space-y-4">
      {/* Main result card */}
      <div
        className="glass rounded-2xl p-6"
        style={{
          border: isDefectFree
            ? '1px solid rgba(52, 211, 153, 0.3)'
            : '1px solid rgba(248, 113, 113, 0.3)',
          boxShadow: isDefectFree
            ? '0 0 30px rgba(52, 211, 153, 0.08)'
            : '0 0 30px rgba(239, 68, 68, 0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">
              Hasil Deteksi
            </p>
            <div className="flex items-center gap-3">
              <span className="text-3xl" role="img" aria-label={topPrediction.label}>
                {DEFECT_ICONS[topPrediction.labelId] ?? '🔍'}
              </span>
              <h2 className="text-2xl font-bold text-white">
                {topPrediction.label}
              </h2>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${isDefectFree ? 'badge-safe' : 'badge-defect'}`}
          >
            {isDefectFree ? 'AMAN' : 'CACAT'}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-400 mb-5 leading-relaxed">
          {DEFECT_DESCRIPTIONS[topPrediction.labelId] ??
            'Kelas terdeteksi pada gambar kain ini.'}
        </p>

        {/* Top confidence bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">
              Tingkat Keyakinan
            </span>
          </div>
          <ConfidenceBar
            confidence={topPrediction.confidence}
            isTop
            isSafe={isDefectFree}
          />
        </div>
      </div>

      {/* Top-3 other predictions */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest mb-4">
          📊 Distribusi Semua Kelas
        </h3>
        <div className="space-y-4">
          {allPredictions.map((pred, index) => (
            <div key={pred.labelId} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {index === 0 && (
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: pred.isDefectFree
                          ? 'rgba(52, 211, 153, 0.2)'
                          : 'rgba(239, 68, 68, 0.2)',
                        color: pred.isDefectFree ? '#34d399' : '#f87171',
                      }}
                    >
                      1
                    </span>
                  )}
                  {index > 0 && (
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs text-slate-500"
                          style={{ background: 'rgba(255,255,255,0.05)' }}>
                      {index + 1}
                    </span>
                  )}
                  <span className="text-sm">
                    <span className="mr-1.5">
                      {DEFECT_ICONS[pred.labelId] ?? '🔍'}
                    </span>
                    <span
                      className={
                        index === 0
                          ? 'font-semibold text-white'
                          : 'text-slate-400'
                      }
                    >
                      {pred.label}
                    </span>
                  </span>
                </div>
              </div>
              <ConfidenceBar
                confidence={pred.confidence}
                isTop={index === 0}
                isSafe={pred.isDefectFree && index === 0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-xs text-slate-600">
        * Hasil ini merupakan prediksi model AI dan bukan diagnosa akhir.
        Gunakan sebagai referensi pendukung.
      </p>
    </div>
  );
}

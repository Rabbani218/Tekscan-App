'use client';

import React from 'react';
import type { InferenceResult } from '@/lib/inference';

interface ResultCardProps {
  result: InferenceResult;
  onReset: () => void;
}

const STYLE = {
  normal: {
    box: 'bg-emerald-50 border-emerald-200',
    badge: 'bg-emerald-600 text-white',
    text: 'text-emerald-800',
    bar: 'bg-emerald-500',
    badgeText: 'KAIN NORMAL',
  },
  defect: {
    box: 'bg-rose-50 border-rose-200',
    badge: 'bg-rose-600 text-white',
    text: 'text-rose-800',
    bar: 'bg-rose-500',
    badgeText: 'TERDETEKSI CACAT',
  },
  uncertain: {
    box: 'bg-amber-50 border-amber-300',
    badge: 'bg-amber-500 text-white',
    text: 'text-amber-900',
    bar: 'bg-amber-500',
    badgeText: 'TIDAK PASTI',
  },
} as const;

export default function ResultCard({ result, onReset }: ResultCardProps) {
  const { decision, manifest } = result;
  const s = STYLE[decision.verdict];
  const label = (id: string) => manifest.labelsID[id] ?? id;

  const headline =
    decision.verdict === 'uncertain'
      ? 'Perlu pemeriksaan manual'
      : decision.verdict === 'normal'
      ? 'Tidak ditemukan cacat'
      : label(decision.topLabelId);

  return (
    <section className="space-y-4" aria-live="polite">
      <div className={`rounded-2xl border p-5 shadow-sm ${s.box}`}>
        <div className="flex items-center justify-between gap-3">
          <span className={`text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-full ${s.badge}`}>{s.badgeText}</span>
          <span className="text-[11px] text-slate-500 font-mono">{result.elapsedMs} ms</span>
        </div>

        <h2 className={`mt-3 text-2xl font-extrabold tracking-tight ${s.text}`}>{headline}</h2>

        {decision.verdict === 'uncertain' ? (
          <div className="mt-2 space-y-2 text-sm text-slate-700">
            <p>
              Sistem <strong>tidak memberi kesimpulan otomatis</strong> karena hasilnya belum cukup dapat dipercaya:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
              {decision.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="text-xs text-slate-600">
              Kandidat terdekat:{' '}
              <strong>
                {label(decision.ranked[0].labelId)} ({(decision.ranked[0].prob * 100).toFixed(1)}%)
              </strong>{' '}
              /{' '}
              <strong>
                {label(decision.ranked[1].labelId)} ({(decision.ranked[1].prob * 100).toFixed(1)}%)
              </strong>
              . Coba foto ulang dengan cahaya merata dan fokus tajam.
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-600">
            Keyakinan terkalibrasi <strong>{(decision.confidence * 100).toFixed(1)}%</strong> · selisih kelas kedua{' '}
            <strong>{(decision.margin * 100).toFixed(1)}%</strong>
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Distribusi Probabilitas (terkalibrasi)</h3>
        <ul className="space-y-2.5">
          {decision.ranked.map((p, i) => (
            <li key={p.labelId}>
              <div className="flex justify-between text-xs mb-1">
                <span className={i === 0 ? 'font-bold text-slate-900' : 'text-slate-600'}>{label(p.labelId)}</span>
                <span className={`font-mono ${i === 0 ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{(p.prob * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${i === 0 ? s.bar : 'bg-slate-300'}`}
                  style={{ width: `${Math.max(p.prob * 100, 0.5)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          Hasil ini adalah bantuan AI ({manifest.name}, akurasi uji {(manifest.metrics.testAccuracy * 100).toFixed(1)}%), bukan keputusan akhir
          kontrol kualitas.
        </p>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="w-full py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
      >
        Periksa Gambar Lain
      </button>
    </section>
  );
}

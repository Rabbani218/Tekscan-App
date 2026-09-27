'use client';

import React from 'react';
import type { InspectionRecord } from '@/lib/types';

interface BatchHistoryProps {
  records: InspectionRecord[];
  onClearHistory: () => void;
  onSelectRecord?: (record: InspectionRecord) => void;
}

export default function BatchHistory({
  records,
  onClearHistory,
  onSelectRecord,
}: BatchHistoryProps) {
  if (records.length === 0) {
    return (
      <div className="bg-slate-900/60 rounded-xl p-8 border border-slate-800 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-500">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-300">Belum Ada Riwayat Inspeksi</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Lakukan pemindaian atau analisis gambar kain di tab Inspeksi Studio untuk mencatat hasil uji kontrol kualitas di sini.
        </p>
      </div>
    );
  }

  const passedCount = records.filter((r) => r.status === 'PASSED').length;
  const rejectedCount = records.length - passedCount;

  return (
    <div className="space-y-4">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-1">Total Sampel</span>
          <span className="text-xl font-bold font-mono text-white">{records.length}</span>
        </div>
        <div className="bg-emerald-950/20 rounded-xl p-3 border border-emerald-500/20">
          <span className="text-[11px] text-emerald-400 block mb-1">Lolos (Grade A)</span>
          <span className="text-xl font-bold font-mono text-emerald-300">{passedCount}</span>
        </div>
        <div className="bg-rose-950/20 rounded-xl p-3 border border-rose-500/20">
          <span className="text-[11px] text-rose-400 block mb-1">Afkir / Cacat</span>
          <span className="text-xl font-bold font-mono text-rose-300">{rejectedCount}</span>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Daftar Uji Batch Terkini
          </span>
          <button
            onClick={onClearHistory}
            className="text-xs text-rose-400 hover:text-rose-300 hover:underline"
          >
            Hapus Riwayat
          </button>
        </div>

        <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
          {records.map((rec) => {
            const isPassed = rec.status === 'PASSED';
            return (
              <div
                key={rec.id}
                className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex-shrink-0">
                    <img
                      src={rec.imageThumbnail}
                      alt={rec.fileName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {rec.defectLabel}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          isPassed
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {isPassed ? 'PASSED' : 'REJECTED'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 block truncate">
                      {rec.fileName} · {rec.timestamp}
                    </span>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <span className="font-mono text-xs font-semibold text-blue-400">
                    {(rec.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

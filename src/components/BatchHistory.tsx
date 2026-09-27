'use client';

import React, { useState } from 'react';
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
  const [searchTerm, setSearchTerm] = useState('');

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-3 text-blue-600">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-slate-800">Belum Ada Riwayat Uji Kontrol Kualitas</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
          Semua hasil analisis citra kain di tab Studio Inspeksi akan secara otomatis tercatat di halaman log batch ini.
        </p>
      </div>
    );
  }

  const passedCount = records.filter((r) => r.status === 'PASSED').length;
  const rejectedCount = records.length - passedCount;
  const passRate = ((passedCount / records.length) * 100).toFixed(1);

  const filtered = records.filter(
    (r) =>
      r.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.defectLabel.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportCSV = () => {
    const headers = ['ID,Waktu,File,Klasifikasi,Confidence,Status'];
    const rows = records.map(
      (r) =>
        `"${r.id}","${r.timestamp}","${r.fileName}","${r.defectLabel}","${(r.confidence * 100).toFixed(1)}%","${r.status}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `QC_Batch_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold block mb-1">Total Sampel</span>
          <span className="text-2xl font-bold font-mono text-slate-900">{records.length}</span>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 shadow-sm">
          <span className="text-xs text-emerald-800 font-semibold block mb-1">Lolos (Grade A)</span>
          <span className="text-2xl font-bold font-mono text-emerald-700">{passedCount}</span>
        </div>
        <div className="bg-rose-50 rounded-2xl p-4 border border-rose-200 shadow-sm">
          <span className="text-xs text-rose-800 font-semibold block mb-1">Afkir / Cacat</span>
          <span className="text-2xl font-bold font-mono text-rose-700">{rejectedCount}</span>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200 shadow-sm">
          <span className="text-xs text-blue-800 font-semibold block mb-1">Yield Rate (Lolos)</span>
          <span className="text-2xl font-bold font-mono text-blue-700">{passRate}%</span>
        </div>
      </div>

      {/* History Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Cari nama file atau kelas cacat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Ekspor CSV</span>
            </button>
            <button
              onClick={onClearHistory}
              className="px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-600 text-xs font-semibold border border-rose-200 transition-colors"
            >
              Hapus Riwayat
            </button>
          </div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {filtered.map((rec) => {
            const isPassed = rec.status === 'PASSED';
            return (
              <div
                key={rec.id}
                className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 shadow-inner">
                    <img
                      src={rec.imageThumbnail}
                      alt={rec.fileName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {rec.defectLabel}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isPassed
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {isPassed ? 'PASSED' : 'REJECTED'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 block truncate mt-0.5">
                      {rec.fileName} · {rec.timestamp}
                    </span>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <span className="font-mono text-sm font-bold text-blue-600">
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

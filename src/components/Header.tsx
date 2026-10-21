'use client';

import React from 'react';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16M9 3v18M15 3v18" />
            </svg>
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight text-slate-900">TEKSCAN</span>
            <p className="text-[11px] text-slate-500 hidden sm:block font-medium">Deteksi Cacat Kain Tekstil Berbasis AI</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Berjalan di browser</span>
        </div>
      </div>
    </header>
  );
}

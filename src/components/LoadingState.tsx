'use client';

import React from 'react';

interface LoadingStateProps {
  phase: 'model' | 'inference';
  modelProgress?: number;
}

export default function LoadingState({ phase, modelProgress = 0 }: LoadingStateProps) {
  return (
    <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm animate-fade-in">
      {/* Modern Spinner */}
      <div className="relative w-14 h-14 mx-auto mb-4">
        <div className="w-14 h-14 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-blue-600">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>
      </div>

      {phase === 'model' ? (
        <>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            Menginisialisasi Engine Model AI...
          </h3>
          <p className="text-xs text-slate-500 mb-3 max-w-sm mx-auto">
            Memuat bobot MobileNetV2 (9.69 MB) ke memori GPU peramban (hanya pada analisis pertama).
          </p>
          {/* Progress bar */}
          <div className="w-full max-w-xs mx-auto bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200 mb-2">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${modelProgress}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold text-blue-600">{modelProgress}%</span>
        </>
      ) : (
        <>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            Menganalisis Pola Tekstur Kain...
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Ekstraksi fitur konvolusi dan klasifikasi probabilitas cacat sedang berlangsung.
          </p>
          <div className="flex justify-center gap-1.5 mt-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import React from 'react';

interface LoadingStateProps {
  phase: 'model' | 'inference';
  modelProgress?: number;
}

export default function LoadingState({ phase, modelProgress = 0 }: LoadingStateProps) {
  return (
    <div className="glass rounded-2xl p-8 text-center animate-fade-in">
      {/* Spinner */}
      <div className="relative w-16 h-16 mx-auto mb-5">
        <div
          className="spin absolute inset-0 rounded-full"
          style={{
            border: '3px solid rgba(59, 130, 246, 0.15)',
            borderTopColor: '#3b82f6',
          }}
        />
        <div
          className="spin absolute inset-2 rounded-full"
          style={{
            border: '3px solid rgba(99, 102, 241, 0.15)',
            borderTopColor: '#6366f1',
            animationDirection: 'reverse',
            animationDuration: '0.7s',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl">
            {phase === 'model' ? '🧠' : '🔍'}
          </span>
        </div>
      </div>

      {phase === 'model' ? (
        <>
          <h3 className="text-lg font-semibold text-white mb-1">
            Memuat Model AI...
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Model MobileNetV2 sedang dimuat ke browser. Ini hanya terjadi sekali.
          </p>
          {/* Progress bar */}
          <div className="confidence-bar-wrap max-w-xs mx-auto mb-2">
            <div
              className="progress-bar h-full rounded-full"
              style={{
                width: `${modelProgress}%`,
                background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
              }}
            />
          </div>
          <p className="text-xs text-slate-500">{modelProgress}% dimuat</p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-semibold text-white mb-1">
            Menganalisis Kain...
          </h3>
          <p className="text-sm text-slate-400">
            Model sedang memproses gambar dan mendeteksi cacat tekstil
          </p>
          <div className="flex justify-center gap-1.5 mt-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-blue-400"
                style={{
                  animation: 'pulse 1.2s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

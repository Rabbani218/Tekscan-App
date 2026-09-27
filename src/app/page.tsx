'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import UploadZone from '@/components/UploadZone';
import LoadingState from '@/components/LoadingState';
import type { InferenceResult } from '@/lib/inference';

// Dynamically import ResultCard (not needed until result is shown)
const ResultCard = dynamic(() => import('@/components/ResultCard'), {
  loading: () => null,
});

type AppState =
  | 'idle'          // No image uploaded yet
  | 'imageReady'    // Image selected, ready to analyze
  | 'loadingModel'  // TF.js model loading
  | 'inferencing'   // Running inference
  | 'done'          // Result ready
  | 'error';        // Error occurred

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [modelProgress, setModelProgress] = useState(0);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const currentObjectUrl = useRef<string | null>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (currentObjectUrl.current) {
        URL.revokeObjectURL(currentObjectUrl.current);
      }
    };
  }, []);

  const handleImageSelected = useCallback((file: File, objectUrl: string) => {
    // Revoke previous object URL
    if (currentObjectUrl.current) {
      URL.revokeObjectURL(currentObjectUrl.current);
    }
    currentObjectUrl.current = objectUrl;
    setPreviewUrl(objectUrl);
    setResult(null);
    setErrorMsg('');
    setAppState('imageReady');
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!previewUrl) return;

    try {
      // Dynamically import inference only on client, only when needed
      const { loadModel, runInference } = await import('@/lib/inference');

      // Phase 1: Load model
      setAppState('loadingModel');
      setModelProgress(0);
      await loadModel((progress) => setModelProgress(progress));

      // Phase 2: Run inference
      setAppState('inferencing');

      // Create an image element for preprocessing
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Gagal memuat gambar untuk preprocessing'));
        img.src = previewUrl;
      });

      imageRef.current = img;
      const inferenceResult = await runInference(img);

      setResult(inferenceResult);
      setAppState('done');
    } catch (err) {
      console.error('Inference error:', err);
      const message =
        err instanceof Error ? err.message : 'Terjadi kesalahan tidak diketahui.';
      setErrorMsg(message);
      setAppState('error');
    }
  }, [previewUrl]);

  const handleReset = useCallback(() => {
    if (currentObjectUrl.current) {
      URL.revokeObjectURL(currentObjectUrl.current);
      currentObjectUrl.current = null;
    }
    setPreviewUrl(null);
    setResult(null);
    setErrorMsg('');
    setAppState('idle');
    setModelProgress(0);
  }, []);

  const isProcessing =
    appState === 'loadingModel' || appState === 'inferencing';

  return (
    <>
      {/* Animated background */}
      <div className="bg-mesh" aria-hidden="true" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* ===== HEADER ===== */}
        <header className="pt-12 pb-8 px-4 text-center">
          {/* Logo mark */}
          <div className="flex justify-center mb-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center relative"
              style={{
                background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
                boxShadow: '0 0 40px rgba(37, 99, 235, 0.4)',
              }}
            >
              <svg
                className="w-9 h-9 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" />
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeLinecap="round" />
                <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
              </svg>
              {/* Glow ring */}
              <div
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: 'transparent',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.15) inset',
                }}
              />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
            <span className="gradient-text">TEKSCAN</span>
          </h1>
          <p className="text-lg sm:text-xl font-medium text-slate-300 mb-2">
            Deteksi Cacat Kain Tekstil
          </p>
          <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
            Sistem berbasis kecerdasan buatan (MobileNetV2) untuk mendeteksi 6 jenis kondisi kain
            secara otomatis langsung di browser Anda
          </p>

          {/* Accuracy badge */}
          <div className="flex justify-center mt-4">
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium"
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                color: '#93c5fd',
              }}
            >
              <span
                className="w-2 h-2 rounded-full bg-blue-400"
                style={{ animation: 'pulse 2s ease-in-out infinite' }}
              />
              Model Akurasi 90.75% · F1-Macro 82.94% · 6 Kelas
            </div>
          </div>
        </header>

        {/* ===== MAIN CONTENT ===== */}
        <main className="flex-1 px-4 pb-12">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Upload section */}
            <section aria-labelledby="upload-section-title">
              <h2 id="upload-section-title" className="sr-only">
                Upload Gambar Kain
              </h2>
              <UploadZone
                onImageSelected={handleImageSelected}
                previewUrl={previewUrl}
                disabled={isProcessing}
              />
            </section>

            {/* Analyze button */}
            {(appState === 'imageReady' || appState === 'done') && (
              <div className="flex gap-3">
                <button
                  id="analyze-btn"
                  onClick={handleAnalyze}
                  disabled={isProcessing || appState !== 'imageReady'}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                  aria-label="Analisis gambar kain untuk deteksi cacat"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Analisis Kain
                </button>
                <button
                  id="reset-btn"
                  onClick={handleReset}
                  className="px-4 py-3 rounded-xl text-sm font-medium text-slate-400 transition-all hover:text-white"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  aria-label="Reset dan upload gambar baru"
                >
                  Reset
                </button>
              </div>
            )}

            {/* Re-analyze button after done */}
            {appState === 'done' && (
              <div className="flex gap-3">
                <button
                  id="reanalyze-btn"
                  onClick={handleAnalyze}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                  aria-label="Analisis ulang gambar yang sama"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Analisis Ulang
                </button>
                <button
                  id="new-image-btn"
                  onClick={handleReset}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-slate-300 transition-all hover:text-white"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  aria-label="Upload gambar baru"
                >
                  Gambar Baru
                </button>
              </div>
            )}

            {/* Loading state */}
            {isProcessing && (
              <LoadingState
                phase={appState === 'loadingModel' ? 'model' : 'inference'}
                modelProgress={modelProgress}
              />
            )}

            {/* Error state */}
            {appState === 'error' && (
              <div
                className="glass rounded-2xl p-6 animate-fade-in"
                style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(239, 68, 68, 0.15)' }}
                  >
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-red-400 mb-1">Terjadi Kesalahan</h3>
                    <p className="text-sm text-slate-400 mb-3">{errorMsg}</p>
                    <p className="text-xs text-slate-500">
                      Pastikan file model tersedia di <code className="text-blue-400">/public/model/</code> dan
                      coba refresh halaman.
                    </p>
                  </div>
                </div>
                <button
                  id="retry-btn"
                  onClick={handleAnalyze}
                  className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium text-red-300 transition-all hover:text-white"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  Coba Lagi
                </button>
              </div>
            )}

            {/* Results */}
            {appState === 'done' && result && (
              <ResultCard result={result} />
            )}

            {/* Class legend — shown in idle state */}
            {appState === 'idle' && (
              <div className="glass rounded-2xl p-6 animate-fade-in">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                  Kelas yang Dapat Dideteksi
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'defect_free', label: 'Bebas Cacat', icon: '✅', safe: true },
                    { id: 'stain', label: 'Noda', icon: '🟡', safe: false },
                    { id: 'hole', label: 'Lubang', icon: '⭕', safe: false },
                    { id: 'lines', label: 'Garis', icon: '〰️', safe: false },
                    { id: 'horizontal', label: 'Cacat Horizontal', icon: '↔️', safe: false },
                    { id: 'vertical', label: 'Cacat Vertikal', icon: '↕️', safe: false },
                  ].map((cls) => (
                    <div
                      key={cls.id}
                      className="flex items-center gap-2.5 p-3 rounded-xl transition-colors"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="text-xl">{cls.icon}</span>
                      <span className={`text-sm font-medium ${cls.safe ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {cls.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ===== FOOTER ===== */}
        <footer className="py-8 px-4 text-center border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)' }}
              >
                <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 3v18" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-400">TEKSCAN</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Demo akademik — Sistem Deteksi Cacat Kain Tekstil menggunakan
              Transfer Learning MobileNetV2.{' '}
              <br className="hidden sm:inline" />
              Akurasi test <strong className="text-slate-500">90.75%</strong> · F1-Macro{' '}
              <strong className="text-slate-500">82.94%</strong> · Dataset 6 kelas cacat kain.
            </p>
            <p className="text-xs text-slate-700 mt-2">
              Inferensi berjalan sepenuhnya di browser menggunakan TensorFlow.js — data gambar tidak dikirim ke server.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

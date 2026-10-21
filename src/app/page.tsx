'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Header from '@/components/Header';
import UploadZone from '@/components/UploadZone';
import CameraCapture from '@/components/CameraCapture';
import LoadingState from '@/components/LoadingState';
import ResultCard from '@/components/ResultCard';
import type { InferenceResult, ModelManifest } from '@/lib/inference';

export default function HomePage() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [phase, setPhase] = useState<'model' | 'inference'>('model');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    import('@/lib/inference').then((m) => m.loadManifest()).then(setManifest).catch(() => {});
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  const handleImageSelected = useCallback((file: File, url: string) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = url;
    setPreviewUrl(url);
    setFileName(file.name);
    setResult(null);
    setErrorMsg(null);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!previewUrl) return;
    try {
      setIsProcessing(true);
      setErrorMsg(null);
      const { loadModel, runInference } = await import('@/lib/inference');
      setPhase('model');
      setProgress(0);
      await loadModel(setProgress);
      setPhase('inference');
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Gagal membaca gambar.'));
        img.src = previewUrl;
      });
      setResult(await runInference(img));
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan saat menganalisis gambar.');
    } finally {
      setIsProcessing(false);
    }
  }, [previewUrl]);

  const handleReset = useCallback(() => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    setPreviewUrl(null);
    setFileName('');
    setResult(null);
    setErrorMsg(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="pb-4 mb-6 border-b border-slate-200">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">Inspeksi Cacat Kain</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl">
            Unggah atau foto kain secara close-up (tekstur terlihat jelas, cahaya merata). Sistem mengenali 6 kondisi: bebas cacat, noda, lubang, garis, cacat
            horizontal, dan cacat vertikal. Bila ragu, sistem akan menyatakan <strong>&quot;Tidak Pasti&quot;</strong> alih-alih menebak.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-4">
            <UploadZone
              onImageSelected={handleImageSelected}
              previewUrl={previewUrl}
              disabled={isProcessing}
              onOpenCamera={() => setIsCameraOpen(true)}
              fileName={fileName}
            />

            {previewUrl && !result && !isProcessing && (
              <button
                id="analyze-button"
                onClick={handleAnalyze}
                className="w-full py-4 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-blue-500/25 transition-all"
              >
                Analisis Gambar
              </button>
            )}

            {isProcessing && <LoadingState phase={phase} modelProgress={progress} />}

            {errorMsg && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs shadow-sm">
                <p className="font-bold text-rose-800">Gagal memproses gambar</p>
                <p className="text-slate-600 mt-0.5">{errorMsg}</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-4">
            {result ? (
              <ResultCard result={result} onReset={handleReset} />
            ) : (
              <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center space-y-2">
                <h2 className="text-base font-bold text-slate-800">Menunggu gambar kain</h2>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Pilih file atau buka kamera, lalu tekan <strong className="text-slate-800">Analisis Gambar</strong>.
                </p>
                <p className="text-[11px] text-slate-400">Gambar tidak dikirim ke server — diproses langsung di perangkat Anda.</p>
              </div>
            )}

            {manifest && (
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-xs text-slate-600">
                <h3 className="font-bold text-slate-800 mb-2">Info Model</h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-slate-500">Arsitektur</dt>
                  <dd className="font-semibold text-slate-800">{manifest.name}</dd>
                  <dt className="text-slate-500">Akurasi uji</dt>
                  <dd className="font-semibold text-slate-800">{(manifest.metrics.testAccuracy * 100).toFixed(1)}%</dd>
                  <dt className="text-slate-500">F1-macro</dt>
                  <dd className="font-semibold text-slate-800">{(manifest.metrics.macroF1 * 100).toFixed(1)}%</dd>
                  <dt className="text-slate-500">FPR otomatis</dt>
                  <dd className="font-semibold text-slate-800">{(manifest.metrics.fprAutoAfterVerification * 100).toFixed(2)}%</dd>
                </dl>
              </div>
            )}
          </div>
        </div>
      </main>

      {isCameraOpen && <CameraCapture onCapture={handleImageSelected} onClose={() => setIsCameraOpen(false)} />}

      <footer className="border-t border-slate-200 bg-white py-5 px-4 text-center text-[11px] text-slate-500">
        Project Tugas Akhir — Pengolahan Citra Digital · Universitas Bina Sarana Informatika · © 2026 TEKSCAN
      </footer>
    </div>
  );
}

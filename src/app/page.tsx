'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Header from '@/components/Header';
import UploadZone from '@/components/UploadZone';
import FabricSamples from '@/components/FabricSamples';
import QCReportPanel from '@/components/QCReportPanel';
import BatchHistory from '@/components/BatchHistory';
import DefectCatalog from '@/components/DefectCatalog';
import ModelSpecs from '@/components/ModelSpecs';
import CameraCapture from '@/components/CameraCapture';
import LoadingState from '@/components/LoadingState';
import type { InferenceResult } from '@/lib/inference';
import type { InspectionRecord } from '@/lib/types';
import type { SampleFabric } from '@/lib/fabricSamples';

type ActiveTab = 'inspection' | 'history' | 'catalog' | 'specs';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('inspection');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>('sample_fabric.jpg');
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<'model' | 'inference'>('model');
  const [modelProgress, setModelProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Inspection history stored in localStorage
  const [historyRecords, setHistoryRecords] = useState<InspectionRecord[]>([]);

  const currentObjectUrl = useRef<string | null>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tekscan_qc_history');
      if (saved) {
        setHistoryRecords(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }, []);

  // Save history to localStorage
  const saveToHistory = useCallback((rec: InspectionRecord) => {
    setHistoryRecords((prev) => {
      const updated = [rec, ...prev.slice(0, 49)]; // keep max 50 records
      try {
        localStorage.setItem('tekscan_qc_history', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist history:', e);
      }
      return updated;
    });
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistoryRecords([]);
    try {
      localStorage.removeItem('tekscan_qc_history');
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  }, []);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (currentObjectUrl.current) {
        URL.revokeObjectURL(currentObjectUrl.current);
      }
    };
  }, []);

  // Handle image selected from upload or camera
  const handleImageSelected = useCallback((file: File, objectUrl: string) => {
    if (currentObjectUrl.current) {
      URL.revokeObjectURL(currentObjectUrl.current);
    }
    currentObjectUrl.current = objectUrl;
    setPreviewUrl(objectUrl);
    setActiveFileName(file.name);
    setResult(null);
    setErrorMsg(null);
  }, []);

  // Handle sample selection from preset
  const handleSelectSample = useCallback((sample: SampleFabric) => {
    if (currentObjectUrl.current) {
      URL.revokeObjectURL(currentObjectUrl.current);
      currentObjectUrl.current = null;
    }
    setPreviewUrl(sample.dataUrl);
    setActiveFileName(`${sample.name}.jpg`);
    setResult(null);
    setErrorMsg(null);
  }, []);

  // Run AI inference
  const handleAnalyze = useCallback(async () => {
    if (!previewUrl) return;

    try {
      setIsProcessing(true);
      setErrorMsg(null);

      // Import TF.js inference engine
      const { loadModel, runInference } = await import('@/lib/inference');

      setProcessingPhase('model');
      setModelProgress(0);
      await loadModel((progress) => setModelProgress(progress));

      setProcessingPhase('inference');

      // Create Image Element for preprocessing
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Gagal memuat citra untuk preprocessing visual.'));
        img.src = previewUrl;
      });

      const inferenceResult = await runInference(img);
      setResult(inferenceResult);

      // Record to history
      const newRecord: InspectionRecord = {
        id: `qc_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        imageThumbnail: previewUrl,
        fileName: activeFileName,
        result: inferenceResult,
        status: inferenceResult.topPrediction.isDefectFree ? 'PASSED' : 'REJECTED',
        defectLabel: inferenceResult.topPrediction.label,
        confidence: inferenceResult.topPrediction.confidence,
      };
      saveToHistory(newRecord);
    } catch (err) {
      console.error('Inference error:', err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan sistem saat menganalisis citra kain.'
      );
    } finally {
      setIsProcessing(false);
    }
  }, [previewUrl, activeFileName, saveToHistory]);

  const handleReset = useCallback(() => {
    if (currentObjectUrl.current) {
      URL.revokeObjectURL(currentObjectUrl.current);
      currentObjectUrl.current = null;
    }
    setPreviewUrl(null);
    setResult(null);
    setErrorMsg(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Enterprise Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        historyCount={historyRecords.length}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* TAB 1: INSPECTION STUDIO */}
        {activeTab === 'inspection' && (
          <div className="space-y-6">
            {/* Top Overview Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>Studio Inspeksi Cacat Kain</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Live
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Unggah atau ambil foto tekstur kain untuk deteksi otomatis cacat noda, lubang, garis, dan ketidakteraturan benang.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="hidden sm:inline">Model: MobileNetV2 (90.75% Akurasi)</span>
              </div>
            </div>

            {/* Main Responsive Grid: Studio Viewport (Left) & QC Panel (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Input Studio (7 cols on Desktop) */}
              <div className="lg:col-span-7 space-y-4">
                <UploadZone
                  onImageSelected={handleImageSelected}
                  previewUrl={previewUrl}
                  disabled={isProcessing}
                  onOpenCamera={() => setIsCameraOpen(true)}
                />

                {/* Preset Fabric Samples */}
                <FabricSamples
                  onSelectSample={handleSelectSample}
                  disabled={isProcessing}
                />

                {/* Main Action Analyze Button */}
                {previewUrl && !result && (
                  <button
                    onClick={handleAnalyze}
                    disabled={isProcessing}
                    className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Mulai Analisis Kontrol Kualitas</span>
                  </button>
                )}

                {/* Loading State Animation */}
                {isProcessing && (
                  <div className="bg-slate-900/60 rounded-xl p-6 border border-slate-800">
                    <LoadingState phase={processingPhase} modelProgress={modelProgress} />
                  </div>
                )}

                {/* Error Banner */}
                {errorMsg && (
                  <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
                    <svg className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-rose-300">Gagal Memproses Citra</p>
                      <p className="text-slate-400 mt-0.5">{errorMsg}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: QC Report Panel (5 cols on Desktop) */}
              <div className="lg:col-span-5">
                {result ? (
                  <QCReportPanel
                    result={result}
                    previewUrl={previewUrl}
                    onReset={handleReset}
                  />
                ) : (
                  <div className="bg-slate-900/40 rounded-xl p-8 border border-slate-800/80 text-center space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-500">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300">
                      Menunggu Input Citra Kain
                    </h3>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                      Pilih salah satu preset kain di atas atau unggah foto kain Anda sendiri, lalu klik tombol <strong className="text-slate-300">Mulai Analisis</strong> untuk melihat laporan inspeksi mutu.
                    </p>
                    <div className="pt-2">
                      <span className="inline-block text-[11px] text-slate-400 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700">
                        Inference 100% Client-Side WebGL
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BATCH HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-800">
              <h1 className="text-xl font-bold text-white">Log Riwayat Batch QC</h1>
              <p className="text-xs text-slate-400 mt-1">
                Catatan riwayat hasil uji inspeksi mutu yang tersimpan pada sesi peramban ini.
              </p>
            </div>
            <BatchHistory
              records={historyRecords}
              onClearHistory={handleClearHistory}
            />
          </div>
        )}

        {/* TAB 3: DEFECT CATALOG */}
        {activeTab === 'catalog' && <DefectCatalog />}

        {/* TAB 4: MODEL SPECS */}
        {activeTab === 'specs' && <ModelSpecs />}
      </main>

      {/* Live Camera Modal */}
      {isCameraOpen && (
        <CameraCapture
          onCapture={handleImageSelected}
          onClose={() => setIsCameraOpen(false)}
        />
      )}

      {/* Industrial Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-slate-950 py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">TEKSCAN</span>
            <span>—</span>
            <span>Sistem Deteksi Cacat Kain Tekstil (MobileNetV2)</span>
          </div>
          <div className="text-slate-400 flex items-center gap-4">
            <span>Akurasi: 90.75%</span>
            <span>·</span>
            <span>F1-Macro: 82.94%</span>
            <span>·</span>
            <span>6 Kelas Cacat</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

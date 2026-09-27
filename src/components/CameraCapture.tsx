'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface CameraCaptureProps {
  onCapture: (file: File, objectUrl: string) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasCameraError, setHasCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setHasCameraError(null);

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setHasCameraError(
        'Tidak dapat mengakses kamera perangkat. Pastikan Anda mengizinkan akses kamera pada peramban web.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode]);

  // Capture frame
  const handleSnap = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply digital zoom if > 1
    if (zoomLevel > 1) {
      const cropW = canvas.width / zoomLevel;
      const cropH = canvas.height / zoomLevel;
      const cropX = (canvas.width - cropW) / 2;
      const cropY = (canvas.height - cropH) / 2;
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `kain_kamera_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      const url = URL.createObjectURL(blob);
      onCapture(file, url);
      onClose();
    }, 'image/jpeg', 0.95);
  }, [onCapture, onClose, zoomLevel]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl p-5 shadow-2xl border border-slate-200 flex flex-col items-center space-y-4">
        {/* Top Header */}
        <div className="w-full flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">
              Sensor Kamera Inspeksi
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFacingMode}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 border border-slate-300 flex items-center gap-1.5 transition-colors"
              title="Ganti kamera belakang/depan"
            >
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Video Viewport */}
        <div className="relative w-full aspect-square bg-slate-950 rounded-2xl overflow-hidden border border-slate-300 shadow-inner flex items-center justify-center">
          {isLoading && (
            <div className="text-center text-slate-400">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Mengaktifkan sensor kamera...</p>
            </div>
          )}

          {hasCameraError && (
            <div className="p-6 text-center text-rose-400 text-xs max-w-sm">
              <p>{hasCameraError}</p>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${hasCameraError ? 'hidden' : ''}`}
          />

          {/* Textile Alignment Crosshairs Overlay */}
          <div className="absolute inset-0 pointer-events-none border border-white/30 m-6 rounded-xl flex items-center justify-center">
            {/* Center target square */}
            <div className="w-36 h-36 border-2 border-blue-400/80 rounded-xl flex items-center justify-center bg-blue-500/10">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            </div>
            {/* Instructions */}
            <div className="absolute bottom-3 inset-x-0 text-center">
              <span className="text-[10px] font-semibold bg-black/60 text-white px-3 py-1 rounded-full backdrop-blur">
                Sejajarkan tekstur kain dalam bingkai biru
              </span>
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Digital Zoom Controls */}
        <div className="w-full flex items-center justify-center gap-2 pt-1">
          <span className="text-[11px] font-semibold text-slate-500">Zoom:</span>
          {[1, 1.5, 2].map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoomLevel(z)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                zoomLevel === z
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {z}x
            </button>
          ))}
        </div>

        {/* Shutter Button */}
        <div className="flex flex-col items-center pt-1">
          <button
            onClick={handleSnap}
            disabled={!!hasCameraError || isLoading}
            className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-blue-500/30 disabled:opacity-50"
            aria-label="Ambil foto kain"
          >
            <div className="w-8 h-8 rounded-full border-2 border-white bg-white/20" />
          </button>
          <span className="text-[11px] font-medium text-slate-500 mt-2">
            Klik untuk jepret sampel kain
          </span>
        </div>
      </div>
    </div>
  );
}

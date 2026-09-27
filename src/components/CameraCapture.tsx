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

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setHasCameraError(null);

    // Stop previous stream if active
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
        'Tidak dapat mengakses kamera. Pastikan Anda telah memberikan izin kamera pada browser.'
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

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `kamera_kain_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      const url = URL.createObjectURL(blob);
      onCapture(file, url);
      onClose();
    }, 'image/jpeg', 0.95);
  }, [onCapture, onClose]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      {/* Top action bar */}
      <div className="w-full max-w-lg flex items-center justify-between text-white pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
          <span className="text-sm font-semibold tracking-wide">Live Inspeksi Kamera</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFacingMode}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 flex items-center gap-1.5 border border-slate-700"
            title="Ganti kamera belakang/depan"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">Ganti Kamera</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video Viewport */}
      <div className="relative w-full max-w-lg aspect-square bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
        {isLoading && (
          <div className="text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Mengaktifkan sensor kamera...</p>
          </div>
        )}

        {hasCameraError && (
          <div className="p-6 text-center text-red-400 text-sm max-w-sm">
            <svg className="w-10 h-10 mx-auto mb-2 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
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

        {/* Optical alignment crosshairs for textile inspection */}
        <div className="absolute inset-0 pointer-events-none border border-blue-400/20 m-6 rounded-lg">
          {/* Center focus bracket */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 border border-dashed border-blue-400/40 rounded-lg flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-blue-400/50" />
          </div>
          {/* Guide text */}
          <div className="absolute bottom-3 inset-x-0 text-center">
            <span className="text-[11px] bg-slate-950/70 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
              Posisikan tekstur kain sejajar dalam kotak
            </span>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Capture Control Button */}
      <div className="pt-6 flex flex-col items-center">
        <button
          onClick={handleSnap}
          disabled={!!hasCameraError || isLoading}
          className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-50"
          aria-label="Ambil foto kain"
        >
          <div className="w-13 h-13 rounded-full border-4 border-slate-900 bg-white" />
        </button>
        <span className="text-xs text-slate-400 mt-2">Tekan untuk ambil sampel</span>
      </div>
    </div>
  );
}

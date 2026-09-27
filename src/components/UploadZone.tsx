'use client';

import React, { useCallback, useRef, useState } from 'react';

interface UploadZoneProps {
  onImageSelected: (file: File, objectUrl: string) => void;
  previewUrl: string | null;
  disabled?: boolean;
  onOpenCamera?: () => void;
}

export default function UploadZone({
  onImageSelected,
  previewUrl,
  disabled = false,
  onOpenCamera,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('Format file tidak didukung. Mohon gunakan format citra (JPG, PNG, WEBP).');
        return;
      }
      const url = URL.createObjectURL(file);
      onImageSelected(file, url);
    },
    [onImageSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [disabled, handleFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  return (
    <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 space-y-3">
      {/* Hidden File Input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      {/* Main Viewport / Drop Area */}
      {previewUrl ? (
        <div className="relative aspect-video sm:aspect-[4/3] rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center group">
          <img
            src={previewUrl}
            alt="Citra kain yang diinspeksi"
            className="w-full h-full object-contain"
          />

          {/* Optional Inspection Optical Grid Overlay */}
          {showGrid && (
            <div
              className="absolute inset-0 pointer-events-none grid grid-cols-6 grid-rows-6 opacity-30"
              style={{
                backgroundImage:
                  'linear-gradient(to right, #3b82f6 1px, transparent 1px), linear-gradient(to bottom, #3b82f6 1px, transparent 1px)',
                backgroundSize: '16.666% 16.666%',
              }}
            />
          )}

          {/* Quick Overlay Toolbar */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded text-xs border ${
                showGrid
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
              title="Toggle Grid Inspeksi"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16M9 3v18M15 3v18" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleClick}
              disabled={disabled}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-slate-900/80 text-slate-200 border border-slate-700 hover:bg-slate-800 flex items-center gap-1"
              title="Ganti citra"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Ganti</span>
            </button>
          </div>
        </div>
      ) : (
        /* Empty State Dropzone */
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          className={`aspect-video sm:aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-950/20'
              : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/70'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-blue-400 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-200">
            Tarik & Jatuhkan Citra Kain di Sini
          </p>
          <p className="text-xs text-slate-400 mt-1">
            atau klik untuk menjelajah file dari perangkat Anda (JPG, PNG, WEBP)
          </p>
        </div>
      )}

      {/* Input Action Controls (Upload File + Kamera) */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          disabled={disabled}
          onClick={handleClick}
          className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>Pilih File Citra</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onOpenCamera}
          className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Buka Kamera</span>
        </button>
      </div>
    </div>
  );
}

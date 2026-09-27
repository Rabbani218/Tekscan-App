'use client';

import React, { useCallback, useRef, useState } from 'react';

interface UploadZoneProps {
  onImageSelected: (file: File, objectUrl: string) => void;
  previewUrl: string | null;
  disabled?: boolean;
  onOpenCamera?: () => void;
  fileName?: string;
}

export default function UploadZone({
  onImageSelected,
  previewUrl,
  disabled = false,
  onOpenCamera,
  fileName,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('Format file tidak didukung. Mohon gunakan format gambar seperti JPG, PNG, atau WEBP.');
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
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
      {/* Hidden File Input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-4 rounded-full bg-blue-600" />
          <h2 className="text-sm font-bold text-slate-800 tracking-tight">
            Viewport Inspeksi Citra Kain
          </h2>
        </div>
        {fileName && previewUrl && (
          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 truncate max-w-[180px]">
            {fileName}
          </span>
        )}
      </div>

      {/* Main Viewport / Drop Area */}
      {previewUrl ? (
        <div className="relative aspect-video sm:aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center group shadow-inner">
          <img
            src={previewUrl}
            alt="Citra kain yang diinspeksi"
            className="w-full h-full object-contain"
          />

          {/* Optical Grid Overlay */}
          {showGrid && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(37, 99, 235, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(37, 99, 235, 0.25) 1px, transparent 1px)',
                backgroundSize: '16.666% 16.666%',
              }}
            />
          )}

          {/* Quick Floating Toolbar */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur p-1 rounded-lg border border-slate-200 shadow-md">
            <button
              type="button"
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
                showGrid
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Aktifkan Grid Garis Bantu Inspeksi"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16M9 3v18M15 3v18" />
              </svg>
              <span className="text-[11px] hidden sm:inline">Grid 8×8</span>
            </button>

            <button
              type="button"
              onClick={handleClick}
              disabled={disabled}
              className="px-2.5 py-1.5 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              title="Ganti citra"
            >
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          className={`aspect-video sm:aspect-[4/3] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-600 bg-blue-50'
              : 'border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/40'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-blue-600 mb-3 shadow-sm">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-slate-800">
            Tarik & Jatuhkan Citra Kain di Sini
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Mendukung file JPG, PNG, WEBP dari kamera smartphone, mikroskop tekstil, atau scanner roll kain.
          </p>
          <span className="mt-3 px-3 py-1 rounded-full text-[11px] font-semibold bg-white border border-slate-200 text-blue-700 shadow-sm">
            Jelajahi File
          </span>
        </div>
      )}

      {/* Input Action Controls (Upload File + Kamera HP/Tablet/Laptop) */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          disabled={disabled}
          onClick={handleClick}
          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>Pilih Citra File</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onOpenCamera}
          className="px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Buka Kamera (HP / Web)</span>
        </button>
      </div>
    </div>
  );
}

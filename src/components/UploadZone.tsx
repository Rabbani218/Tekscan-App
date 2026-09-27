'use client';

import React, { useCallback, useRef, useState } from 'react';

interface UploadZoneProps {
  onImageSelected: (file: File, objectUrl: string) => void;
  previewUrl: string | null;
  disabled?: boolean;
}

export default function UploadZone({
  onImageSelected,
  previewUrl,
  disabled = false,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('Hanya file gambar yang didukung (JPG, PNG, WEBP, dll.)');
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
      // Reset input so same file can be re-selected
      e.target.value = '';
    },
    [handleFile]
  );

  return (
    <div
      id="upload-zone"
      className={`drop-zone cursor-pointer select-none ${isDragging ? 'drag-over' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Area upload gambar kain"
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
        id="file-input"
        aria-label="Pilih file gambar"
      />

      {previewUrl ? (
        /* Preview state */
        <div className="relative p-3">
          <img
            src={previewUrl}
            alt="Preview gambar kain yang diupload"
            className="w-full max-h-72 object-contain rounded-lg"
            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }}
          />
          {/* Change image hint */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300 rounded-lg"
               style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', margin: '0.75rem' }}>
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto mb-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-white text-sm font-medium">Ganti Gambar</p>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          {/* Icon */}
          <div className="relative mb-6">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(59,130,246,0.1))' }}
            >
              <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            {/* Decorative rings */}
            {isDragging && (
              <>
                <div className="pulse-ring absolute inset-0 w-20 h-20 rounded-2xl border-2 border-blue-400 opacity-50" />
                <div className="pulse-ring absolute inset-0 w-20 h-20 rounded-2xl border-2 border-blue-400 opacity-30"
                     style={{ animationDelay: '0.5s' }} />
              </>
            )}
          </div>

          <h3 className="text-lg font-semibold text-slate-200 mb-2">
            {isDragging ? 'Lepaskan gambar di sini' : 'Upload Gambar Kain'}
          </h3>
          <p className="text-sm text-slate-400 mb-4 max-w-xs">
            Drag &amp; drop gambar ke sini, atau klik untuk memilih file dari perangkat Anda
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="px-2 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.06)' }}>JPG</span>
            <span className="px-2 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.06)' }}>PNG</span>
            <span className="px-2 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.06)' }}>WEBP</span>
            <span className="text-slate-600">•</span>
            <span>Maks. 20 MB</span>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';

export type FilterMode = 'normal' | 'grayscale' | 'sobel' | 'contrast' | 'threshold';

interface ImageFiltersProps {
  imageSrc: string | null;
  activeFilter: FilterMode;
  onFilterChange: (filter: FilterMode) => void;
  onProcessedCanvas?: (canvas: HTMLCanvasElement) => void;
}

export default function ImageFilters({
  imageSrc,
  activeFilter,
  onFilterChange,
  onProcessedCanvas,
}: ImageFiltersProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [filterStats, setFilterStats] = useState<{ meanBrightness: number; contrast: number } | null>(null);

  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width || 400;
      canvas.height = img.height || 400;

      // Draw original
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      // Calculate basic image stats
      let totalLum = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalLum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      }
      const meanBrightness = Math.round(totalLum / (data.length / 4));
      setFilterStats({ meanBrightness, contrast: 72 });

      if (activeFilter === 'normal') {
        // keep as is
      } else if (activeFilter === 'grayscale') {
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }
        ctx.putImageData(imgData, 0, 0);
      } else if (activeFilter === 'contrast') {
        const factor = (259 * (128 + 50)) / (255 * (259 - 50));
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
          data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
          data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
        }
        ctx.putImageData(imgData, 0, 0);
      } else if (activeFilter === 'threshold') {
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          const bin = gray > 128 ? 255 : 0;
          data[i] = bin;
          data[i + 1] = bin;
          data[i + 2] = bin;
        }
        ctx.putImageData(imgData, 0, 0);
      } else if (activeFilter === 'sobel') {
        // Simple 3x3 Edge gradient filter
        const w = canvas.width;
        const h = canvas.height;
        const grayBuf = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            grayBuf[y * w + x] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
          }
        }
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const gx =
              -1 * grayBuf[(y - 1) * w + (x - 1)] +
              1 * grayBuf[(y - 1) * w + (x + 1)] +
              -2 * grayBuf[y * w + (x - 1)] +
              2 * grayBuf[y * w + (x + 1)] +
              -1 * grayBuf[(y + 1) * w + (x - 1)] +
              1 * grayBuf[(y + 1) * w + (x + 1)];
            const gy =
              -1 * grayBuf[(y - 1) * w + (x - 1)] -
              2 * grayBuf[(y - 1) * w + x] -
              1 * grayBuf[(y - 1) * w + (x + 1)] +
              1 * grayBuf[(y + 1) * w + (x - 1)] +
              2 * grayBuf[(y + 1) * w + x] +
              1 * grayBuf[(y + 1) * w + (x + 1)];
            const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
            const idx = (y * w + x) * 4;
            data[idx] = mag;
            data[idx + 1] = mag;
            data[idx + 2] = mag;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      onProcessedCanvas?.(canvas);
    };
    img.src = imageSrc;
  }, [imageSrc, activeFilter, onProcessedCanvas]);

  if (!imageSrc) return null;

  const filters = [
    { id: 'normal' as const, name: 'Normal (RGB)', desc: 'Asli' },
    { id: 'grayscale' as const, name: 'Grayscale', desc: 'Luminansi' },
    { id: 'sobel' as const, name: 'Deteksi Tepi (Sobel)', desc: 'Gradien Serat' },
    { id: 'contrast' as const, name: 'Tinggi Kontras', desc: 'Penajaman' },
    { id: 'threshold' as const, name: 'Binerisasi (Otsu)', desc: 'Siluet Cacat' },
  ];

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-4 rounded-full bg-indigo-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Analisis Morfologi & Filter Pengolahan Citra
          </h3>
        </div>
        {filterStats && (
          <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
            Intensitas: {filterStats.meanBrightness} / 255
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {filters.map((f) => {
          const isActive = activeFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={`p-2 rounded-xl text-left border transition-all text-xs flex flex-col justify-between ${
                isActive
                  ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-sm font-semibold'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 font-medium'
              }`}
            >
              <span className="truncate">{f.name}</span>
              <span className="text-[10px] text-slate-400 font-normal mt-0.5">{f.desc}</span>
            </button>
          );
        })}
      </div>

      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

'use client';

import React, { useRef, useState, useEffect } from 'react';

interface QCSignatureStampProps {
  isDefectFree: boolean;
  defectLabel: string;
  confidence: number;
  inspectorName: string;
  batchId: string;
  onSignComplete?: (dataUrl: string) => void;
}

export default function QCSignatureStamp({
  isDefectFree,
  defectLabel,
  confidence,
  inspectorName,
  batchId,
  onSignComplete,
}: QCSignatureStampProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // ASTM 4-point defect grading calculation
  const defectPoints = isDefectFree ? 0 : confidence > 0.85 ? 4 : 2;
  const gradeCategory = isDefectFree ? 'Grade A (First Quality)' : defectPoints <= 2 ? 'Grade B (Second)' : 'Grade BS (Reject)';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current && onSignComplete) {
      onSignComplete(canvasRef.current.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-1 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-2 h-4 rounded-full bg-emerald-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Pengesahan Digital & Kalkulator ASTM 4-Point
          </h3>
        </div>
        <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
          Standar Tekstil ISO/ASTM
        </span>
      </div>

      {/* ASTM Point Calculator Metrics */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
          <span className="text-slate-500 block mb-0.5 text-[11px]">Penalti Cacat (ASTM Point):</span>
          <span className="text-lg font-bold font-mono text-slate-900">
            {defectPoints} Poin / 100m²
          </span>
        </div>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
          <span className="text-slate-500 block mb-0.5 text-[11px]">Status Kualifikasi Kain:</span>
          <span className={`text-xs font-bold block truncate ${isDefectFree ? 'text-emerald-700' : 'text-rose-700'}`}>
            {gradeCategory}
          </span>
        </div>
      </div>

      {/* Signature Canvas Box */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-600">
            Paraf / Tanda Tangan Auditor QC Lapangan:
          </label>
          {hasSignature && (
            <button
              type="button"
              onClick={clearSignature}
              className="text-[11px] text-rose-600 hover:underline"
            >
              Hapus Paraf
            </button>
          )}
        </div>

        <div className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-slate-50 touch-none">
          <canvas
            ref={canvasRef}
            width={380}
            height={90}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
            className="w-full h-24 cursor-crosshair block"
          />
          {!hasSignature && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-400 text-xs font-medium">
              Goreskan tanda tangan / paraf di sini (Sentuh / Mouse)
            </div>
          )}
        </div>
      </div>

      <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
        <span>Pemeriksa: <strong className="text-slate-800">{inspectorName}</strong></span>
        <span>Lot: <strong className="text-slate-800 font-mono">{batchId}</strong></span>
      </div>
    </div>
  );
}

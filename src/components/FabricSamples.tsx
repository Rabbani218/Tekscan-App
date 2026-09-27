'use client';

import React, { useState, useEffect } from 'react';
import { generateSampleFabrics, type SampleFabric } from '@/lib/fabricSamples';

interface FabricSamplesProps {
  onSelectSample: (sample: SampleFabric) => void;
  disabled?: boolean;
}

export default function FabricSamples({ onSelectSample, disabled }: FabricSamplesProps) {
  const [samples, setSamples] = useState<SampleFabric[]>([]);

  useEffect(() => {
    setSamples(generateSampleFabrics());
  }, []);

  if (samples.length === 0) return null;

  return (
    <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800/80">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-3.5 rounded-full bg-blue-500" />
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Preset Uji Cepat (1-Click Test)
          </h3>
        </div>
        <span className="text-[11px] text-slate-500">Pilih sampel uji otomatis</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {samples.map((sample) => (
          <button
            key={sample.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelectSample(sample)}
            className="group relative text-left bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/50 rounded-lg p-2 transition-all flex flex-col items-center disabled:opacity-50"
          >
            <div className="w-full aspect-square rounded-md overflow-hidden bg-slate-900 mb-2 relative">
              <img
                src={sample.dataUrl}
                alt={sample.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <span className="absolute top-1 left-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/75 text-slate-300">
                {sample.category}
              </span>
            </div>
            <span className="text-xs font-medium text-slate-200 text-center line-clamp-1 w-full">
              {sample.name}
            </span>
            <span className="text-[10px] text-slate-400 text-center line-clamp-1 w-full mt-0.5">
              {sample.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

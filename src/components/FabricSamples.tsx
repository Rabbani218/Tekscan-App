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
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-4 rounded-full bg-blue-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Preset Uji Cepat (1-Click Test)
          </h3>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">
          Sampel sintetis realistis
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {samples.map((sample) => (
          <button
            key={sample.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelectSample(sample)}
            className="group relative text-left bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-400 rounded-xl p-2.5 transition-all flex flex-col items-center disabled:opacity-50 shadow-sm hover:shadow"
          >
            <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-200 mb-2 relative border border-slate-200">
              <img
                src={sample.dataUrl}
                alt={sample.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <span className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/95 text-slate-800 shadow-sm border border-slate-200">
                {sample.category}
              </span>
            </div>
            <span className="text-xs font-bold text-slate-800 text-center line-clamp-1 w-full group-hover:text-blue-600">
              {sample.name}
            </span>
            <span className="text-[10px] text-slate-500 text-center line-clamp-1 w-full mt-0.5">
              {sample.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

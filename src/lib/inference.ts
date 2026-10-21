/**
 * TEKSCAN — in-browser inference engine (TensorFlow.js), model-agnostic.
 *
 * The active model is selected via /models/active.json → /models/<id>/manifest.json.
 * Swapping to a new model = drop a new TF.js model folder + manifest, change active.json.
 */

'use client';

import { preprocess, INPUT_SIZE, type PreprocessKind } from './preprocess';
import { decide, type Decision } from './decision';

export interface ModelManifest {
  id: string;
  name: string;
  version: string;
  format: 'layers' | 'graph';
  modelUrl: string;
  inputSize: number;
  preprocess: PreprocessKind;
  outputType: 'softmax' | 'logits';
  classNames: string[];
  labelsID: Record<string, string>;
  decision: { temperature: number; theta: number; delta: number; tta: string[] };
  metrics: {
    testAccuracy: number;
    macroF1: number;
    fprDefectFree: number;
    fprAutoAfterVerification: number;
    manualZonePct: number;
    ece: number;
  };
  quality: { minSide: number; lumaMin: number; lumaMax: number };
}

export interface InferenceResult {
  decision: Decision;
  manifest: ModelManifest;
  imageSize: { width: number; height: number };
  warnings: string[];
  elapsedMs: number;
}

type TF = typeof import('@tensorflow/tfjs');

let tfPromise: Promise<TF> | null = null;
let modelPromise: Promise<{ model: any; manifest: ModelManifest }> | null = null;

async function getTf(): Promise<TF> {
  if (!tfPromise) {
    tfPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      try {
        await tf.setBackend('webgl');
        await tf.ready();
      } catch {
        await tf.setBackend('cpu');
        await tf.ready();
      }
      return tf;
    })();
  }
  return tfPromise;
}

export async function loadManifest(): Promise<ModelManifest> {
  const active = await (await fetch('/models/active.json', { cache: 'no-cache' })).json();
  const res = await fetch(`/models/${active.active}/manifest.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Manifest model "${active.active}" tidak ditemukan.`);
  return res.json();
}

export function loadModel(onProgress?: (pct: number) => void) {
  if (!modelPromise) {
    modelPromise = (async () => {
      onProgress?.(3);
      const tf = await getTf();
      const manifest = await loadManifest();
      onProgress?.(8);
      const onFrac = (f: number) => onProgress?.(Math.round(8 + f * 90));
      const model =
        manifest.format === 'graph'
          ? await tf.loadGraphModel(manifest.modelUrl, { onProgress: onFrac })
          : await tf.loadLayersModel(manifest.modelUrl, { onProgress: onFrac });
      // Warm-up: compile WebGL shaders so the first real prediction is fast.
      tf.tidy(() => {
        const z = tf.zeros([1, manifest.inputSize, manifest.inputSize, 3]);
        (model.predict(z) as any).dataSync();
      });
      onProgress?.(100);
      return { model, manifest };
    })().catch((e) => {
      modelPromise = null;
      throw e;
    });
  }
  return modelPromise;
}

const MAX_SIDE = 4096;

function readPixels(img: HTMLImageElement) {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (!w || !h) throw new Error('Gambar tidak valid.');
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.round(w * k);
  h = Math.round(h * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas tidak tersedia.');
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function qualityNotes(px: ImageData, orig: { w: number; h: number }, m: ModelManifest): string[] {
  const notes: string[] = [];
  if (Math.min(orig.w, orig.h) < m.quality.minSide) {
    notes.push(`!Resolusi gambar terlalu kecil (${orig.w}×${orig.h}px, minimal ${m.quality.minSide}px).`);
  }
  let sum = 0;
  let n = 0;
  const d = px.data;
  const step = Math.max(1, Math.floor(d.length / 4 / 20000));
  for (let i = 0; i < d.length; i += 4 * step) {
    sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    n++;
  }
  const mean = sum / n;
  if (mean < m.quality.lumaMin) notes.push('!Gambar terlalu gelap.');
  if (mean > m.quality.lumaMax) notes.push('!Gambar terlalu terang / overexposed.');
  return notes;
}

export async function runInference(img: HTMLImageElement): Promise<InferenceResult> {
  const t0 = performance.now();
  const tf = await getTf();
  const { model, manifest } = await loadModel();

  const px = readPixels(img);
  const notes = qualityNotes(px, { w: img.naturalWidth, h: img.naturalHeight }, manifest);
  const size = manifest.inputSize || INPUT_SIZE;
  const input = preprocess({ data: px.data, width: px.width, height: px.height }, manifest.preprocess, size);

  const toProbs = (t: any): number[] => {
    const arr = Array.from(t.dataSync() as Float32Array);
    if (manifest.outputType === 'logits') {
      const m = Math.max(...arr);
      const ex = arr.map((v) => Math.exp(v - m));
      const s = ex.reduce((a, b) => a + b, 0);
      return ex.map((v) => v / s);
    }
    return arr;
  };

  const { base, aug } = tf.tidy(() => {
    const x = tf.tensor4d(input, [1, size, size, 3]);
    const base = toProbs(model.predict(x));
    const aug: number[][] = [];
    for (const kind of manifest.decision.tta) {
      if (kind === 'flipH') aug.push(toProbs(model.predict(tf.reverse(x, [2]))));
      else if (kind === 'flipV') aug.push(toProbs(model.predict(tf.reverse(x, [1]))));
    }
    return { base, aug };
  });

  const decision = decide(base, aug, manifest.classNames, manifest.decision, notes);
  const warnings = notes.filter((n) => !n.startsWith('!'));
  return {
    decision,
    manifest,
    imageSize: { width: img.naturalWidth, height: img.naturalHeight },
    warnings,
    elapsedMs: Math.round(performance.now() - t0),
  };
}

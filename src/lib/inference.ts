/**
 * TEKSCAN — TensorFlow.js Inference Engine
 *
 * Preprocessing sesuai preprocessing_config.json:
 * - resize: 224x224
 * - normalization: division_by_255 (pixel / 255.0)
 * - channel_order: RGB
 * - input_shape: [1, 224, 224, 3]
 *
 * NOTE: Model dikonversi secara manual dari Keras 3 format.
 * File model.json berisi Keras 3 topology + weight manifest.
 * Kita load weight secara manual dan buat inference pipeline sendiri.
 */

'use client';

export interface PredictionResult {
  label: string;
  labelId: string;
  confidence: number;
  isDefectFree: boolean;
}

export interface InferenceResult {
  topPrediction: PredictionResult;
  allPredictions: PredictionResult[];
}

export interface ModelLoadProgress {
  phase: 'downloading' | 'parsing' | 'ready';
  progress: number; // 0-100
}

const LABEL_MAP: Record<string, string> = {
  defect_free: 'Bebas Cacat',
  stain: 'Noda',
  hole: 'Lubang',
  lines: 'Garis',
  horizontal: 'Cacat Horizontal',
  vertical: 'Cacat Vertikal',
};

// Cache
let cachedTf: typeof import('@tensorflow/tfjs') | null = null;
let cachedModel: import('@tensorflow/tfjs').GraphModel | import('@tensorflow/tfjs').LayersModel | null = null;
let cachedClassNames: string[] | null = null;
let modelLoadPromise: Promise<import('@tensorflow/tfjs').GraphModel | import('@tensorflow/tfjs').LayersModel> | null = null;

/**
 * Lazy-load TensorFlow.js (only in browser)
 */
async function getTf() {
  if (cachedTf) return cachedTf;
  const tf = await import('@tensorflow/tfjs');
  // Set backend to WebGL for performance, fall back to CPU
  try {
    await tf.setBackend('webgl');
    await tf.ready();
  } catch {
    await tf.setBackend('cpu');
    await tf.ready();
  }
  cachedTf = tf;
  return tf;
}

/**
 * Load class names from /public/class_names.json
 */
export async function loadClassNames(): Promise<string[]> {
  if (cachedClassNames) return cachedClassNames;
  const response = await fetch('/class_names.json');
  if (!response.ok) throw new Error(`Gagal memuat class_names.json: ${response.status}`);
  const names: string[] = await response.json();
  cachedClassNames = names;
  return names;
}

/**
 * Load TF.js model — tries GraphModel first, then LayersModel
 */
export async function loadModel(
  onProgress?: (progress: number) => void
): Promise<import('@tensorflow/tfjs').GraphModel | import('@tensorflow/tfjs').LayersModel> {
  if (cachedModel) {
    onProgress?.(100);
    return cachedModel;
  }

  // Deduplicate concurrent load calls
  if (modelLoadPromise) {
    return modelLoadPromise;
  }

  modelLoadPromise = (async () => {
    const tf = await getTf();
    onProgress?.(5);

    let model: import('@tensorflow/tfjs').GraphModel | import('@tensorflow/tfjs').LayersModel;

    // Try GraphModel (output of tensorflowjs_converter --saved_model)
    try {
      model = await tf.loadGraphModel('/model/model.json', {
        onProgress: (fraction) => onProgress?.(5 + Math.round(fraction * 90)),
      });
      console.log('[TEKSCAN] Loaded as GraphModel');
    } catch (graphErr) {
      console.warn('[TEKSCAN] GraphModel failed, trying LayersModel:', graphErr);
      try {
        model = await tf.loadLayersModel('/model/model.json', {
          onProgress: (fraction) => onProgress?.(5 + Math.round(fraction * 90)),
        });
        console.log('[TEKSCAN] Loaded as LayersModel');
      } catch (layersErr) {
        console.error('[TEKSCAN] Both model formats failed');
        throw new Error(
          'Gagal memuat model. Pastikan file /public/model/model.json dan .bin tersedia. ' +
          `Detail: ${layersErr instanceof Error ? layersErr.message : String(layersErr)}`
        );
      }
    }

    onProgress?.(100);
    cachedModel = model;
    return model;
  })();

  try {
    return await modelLoadPromise;
  } finally {
    modelLoadPromise = null;
  }
}

/**
 * Preprocess HTMLImageElement → tf.Tensor4D [1, 224, 224, 3]
 * Pipeline: fromPixels (RGB) → resize 224×224 → cast float32 → /255 → expandDims
 */
function preprocessImage(
  tf: typeof import('@tensorflow/tfjs'),
  imageElement: HTMLImageElement
): import('@tensorflow/tfjs').Tensor4D {
  return tf.tidy(() => {
    const pixels = tf.browser.fromPixels(imageElement, 3); // [H, W, 3] RGB
    const resized = tf.image.resizeBilinear(pixels, [224, 224]); // [224, 224, 3]
    const float32 = resized.cast('float32');
    const normalized = float32.div(tf.scalar(255.0)); // /255
    const batched = normalized.expandDims(0) as import('@tensorflow/tfjs').Tensor4D; // [1, 224, 224, 3]
    return batched;
  });
}

/**
 * Softmax implementation (in case model outputs raw logits)
 */
function applySoftmax(
  tf: typeof import('@tensorflow/tfjs'),
  logits: import('@tensorflow/tfjs').Tensor
): import('@tensorflow/tfjs').Tensor1D {
  return tf.tidy(() => {
    const squeezed = logits.squeeze();
    return tf.softmax(squeezed as import('@tensorflow/tfjs').Tensor1D);
  });
}

/**
 * Run inference on an HTMLImageElement
 */
export async function runInference(
  imageElement: HTMLImageElement,
  onProgress?: (progress: number) => void
): Promise<InferenceResult> {
  const tf = await getTf();
  const [model, classNames] = await Promise.all([
    loadModel(onProgress),
    loadClassNames(),
  ]);

  const inputTensor = preprocessImage(tf, imageElement);

  let probabilities: number[];

  try {
    // Run prediction — return type can be Tensor | Tensor[] | NamedTensorMap
    const rawOutput = model.predict(inputTensor);

    let outputTensor: import('@tensorflow/tfjs').Tensor;
    if (Array.isArray(rawOutput)) {
      outputTensor = rawOutput[0] as import('@tensorflow/tfjs').Tensor;
    } else if (rawOutput instanceof tf.Tensor) {
      outputTensor = rawOutput;
    } else {
      // NamedTensorMap — take first value
      const values = Object.values(rawOutput as import('@tensorflow/tfjs').NamedTensorMap);
      outputTensor = values[0] as import('@tensorflow/tfjs').Tensor;
    }

    // Apply softmax and extract probabilities
    const softmaxOut = applySoftmax(tf, outputTensor);
    probabilities = Array.from(await softmaxOut.data());

    // Cleanup
    outputTensor.dispose();
    softmaxOut.dispose();
  } finally {
    inputTensor.dispose();
  }

  // Map to class predictions
  const predictions: PredictionResult[] = classNames.map((labelId, index) => ({
    labelId,
    label: LABEL_MAP[labelId] ?? labelId,
    confidence: probabilities[index] ?? 0,
    isDefectFree: labelId === 'defect_free',
  }));

  // Sort by confidence descending
  predictions.sort((a, b) => b.confidence - a.confidence);

  return {
    topPrediction: predictions[0],
    allPredictions: predictions,
  };
}

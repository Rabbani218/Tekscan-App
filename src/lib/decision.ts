/**
 * Decision logic (pure functions): temperature scaling + verification zone (theta/delta)
 * + test-time-augmentation consistency. Mirrors Model/flask_app/app.py and adds anti
 * false-positive guards so a doubtful image never ends up as a confident "defect".
 */

export type Verdict = 'normal' | 'defect' | 'uncertain';

export interface DecisionConfig {
  temperature: number;
  theta: number;
  delta: number;
}

export interface ClassProb {
  labelId: string;
  prob: number;
}

export interface Decision {
  verdict: Verdict;
  topLabelId: string;
  confidence: number;
  margin: number;
  /** Calibrated probabilities (T-scaled), sorted desc. */
  ranked: ClassProb[];
  reasons: string[];
}

const EPS = 1e-12;

/** Model outputs softmax probs → log → /T → softmax (exactly like app.py). */
export function calibrate(probsRaw: ArrayLike<number>, T: number): number[] {
  const logits = Array.from(probsRaw, (p) => Math.log(Math.min(Math.max(p, EPS), 1 - EPS)) / T);
  const m = Math.max(...logits);
  const ex = logits.map((l) => Math.exp(l - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / s);
}

export function argmax(a: ArrayLike<number>): number {
  let bi = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i;
  return bi;
}

export function decide(
  probsRaw: ArrayLike<number>,
  augmentedRaw: ArrayLike<number>[],
  classNames: string[],
  cfg: DecisionConfig,
  qualityNotes: string[] = []
): Decision {
  const probs = calibrate(probsRaw, cfg.temperature);
  const order = probs.map((p, i) => i).sort((a, b) => probs[b] - probs[a]);
  const top = order[0];
  const confidence = probs[top];
  const margin = confidence - probs[order[1]];
  const ranked = order.map((i) => ({ labelId: classNames[i], prob: probs[i] }));

  const reasons: string[] = [...qualityNotes.filter((n) => n.startsWith('!')).map((n) => n.slice(1))];
  if (confidence < cfg.theta) reasons.push(`Keyakinan model rendah (${(confidence * 100).toFixed(1)}% < ${(cfg.theta * 100).toFixed(0)}%).`);
  if (margin < cfg.delta) reasons.push(`Selisih dua kelas teratas tipis (${(margin * 100).toFixed(1)}% < ${(cfg.delta * 100).toFixed(0)}%).`);

  // TTA consistency: a flipped fabric is still the same fabric; the class must not change.
  const disagree = augmentedRaw.filter((p) => argmax(calibrate(p, cfg.temperature)) !== top).length;
  if (disagree > 0) reasons.push('Hasil berubah saat gambar dibalik (tidak konsisten).');

  let verdict: Verdict;
  if (reasons.length > 0) verdict = 'uncertain';
  else verdict = classNames[top] === 'defect_free' ? 'normal' : 'defect';

  return { verdict, topLabelId: classNames[top], confidence, margin, ranked, reasons };
}

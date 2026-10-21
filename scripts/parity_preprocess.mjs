// Compares src/lib/preprocess.ts against the OpenCV reference tensors from make_parity_refs.py
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preprocess } from '../src/lib/preprocess.ts';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'parity');
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
let bad = 0;
for (const m of meta) {
  const rgba = new Uint8Array(fs.readFileSync(path.join(dir, m.name + '.rgba')));
  const refBuf = fs.readFileSync(path.join(dir, m.name + '.ref.f32'));
  const ref = new Float32Array(refBuf.buffer, refBuf.byteOffset, refBuf.byteLength / 4);
  const t0 = performance.now();
  const got = preprocess({ data: rgba, width: m.w, height: m.h }, 'tekscan_variant_c_resnet50');
  const ms = (performance.now() - t0).toFixed(0);
  let max = 0, sum = 0, big = 0;
  for (let i = 0; i < ref.length; i++) {
    const d = Math.abs(ref[i] - got[i]);
    if (d > max) max = d;
    sum += d;
    if (d > 8) big++;
  }
  const mean = sum / ref.length;
  const ok = mean < 1.0 && big / ref.length < 0.01;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${m.name.padEnd(18)} mean|Δ|=${mean.toFixed(3)} max|Δ|=${max.toFixed(1)} px>8: ${(100 * big / ref.length).toFixed(3)}%  (${ms} ms)`);
}
process.exit(bad ? 1 : 0);

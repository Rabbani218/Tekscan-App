// End-to-end parity: JS preprocessing + TF.js model  vs  OpenCV + Keras reference probabilities.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tf from '@tensorflow/tfjs';
import { preprocess } from '../src/lib/preprocess.ts';
import { calibrate, decide } from '../src/lib/decision.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'scripts', 'parity');
const mdir = path.join(root, 'public', 'models', 'resnet50-c');
const manifest = JSON.parse(fs.readFileSync(path.join(mdir, 'manifest.json'), 'utf8'));
const refs = JSON.parse(fs.readFileSync(path.join(dir, 'model_refs.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));

await tf.setBackend('cpu');
const mj = JSON.parse(fs.readFileSync(path.join(mdir, 'model.json'), 'utf8'));
const buffers = mj.weightsManifest.flatMap((g) => g.paths.map((p) => fs.readFileSync(path.join(mdir, p))));
const total = Buffer.concat(buffers);
const handler = {
  load: async () => ({
    modelTopology: mj.modelTopology,
    weightSpecs: mj.weightsManifest.flatMap((g) => g.weights),
    weightData: total.buffer.slice(total.byteOffset, total.byteOffset + total.byteLength),
    format: mj.format, generatedBy: mj.generatedBy, convertedBy: mj.convertedBy,
  }),
};
const model = await tf.loadLayersModel(handler);
console.log('model loaded, params:', model.countParams());

let bad = 0;
for (const m of meta.slice(0, 3)) {
  const rgba = new Uint8Array(fs.readFileSync(path.join(dir, m.name + '.rgba')));
  const x = tf.tensor4d(preprocess({ data: rgba, width: m.w, height: m.h }, manifest.preprocess), [1, 224, 224, 3]);
  const probs = Array.from(model.predict(x).dataSync());
  const ref = refs[m.name];
  const maxd = Math.max(...probs.map((p, i) => Math.abs(p - ref[i])));
  const same = probs.indexOf(Math.max(...probs)) === ref.indexOf(Math.max(...ref));
  const d = decide(probs, [], manifest.classNames, manifest.decision);
  const ok = maxd < 0.03 && same;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${m.name.padEnd(18)} max|Δp|=${maxd.toFixed(4)} top=${manifest.classNames[ref.indexOf(Math.max(...ref))]} → verdict=${d.verdict} conf=${d.confidence.toFixed(3)}`);
}
process.exit(bad ? 1 : 0);

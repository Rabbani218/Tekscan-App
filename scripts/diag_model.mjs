// Diagnostic: feed Python-preprocessed tensors straight into the TF.js model.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tf from '@tensorflow/tfjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'scripts', 'parity');
const mdir = path.resolve(root, process.argv[2] || 'public/models/resnet50-c');
const refs = JSON.parse(fs.readFileSync(path.join(dir, 'model_refs.json'), 'utf8'));
await tf.setBackend('cpu');
const mj = JSON.parse(fs.readFileSync(path.join(mdir, 'model.json'), 'utf8'));
const total = Buffer.concat(mj.weightsManifest.flatMap((g) => g.paths.map((p) => fs.readFileSync(path.join(mdir, p)))));
const model = await tf.loadLayersModel({
  load: async () => ({
    modelTopology: mj.modelTopology,
    weightSpecs: mj.weightsManifest.flatMap((g) => g.weights),
    weightData: total.buffer.slice(total.byteOffset, total.byteOffset + total.byteLength),
  }),
});
for (const name of ['wide_2446x1000', 'small_300x200']) {
  const b = fs.readFileSync(path.join(dir, name + '.ref.f32'));
  const x = tf.tensor4d(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), [1, 224, 224, 3]);
  const p = Array.from(model.predict(x).dataSync());
  console.log(name, 'tfjs', p.map((v) => v.toFixed(3)).join(' '), '\n   keras', refs[name].map((v) => v.toFixed(3)).join(' '));
}

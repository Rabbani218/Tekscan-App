/**
 * TEKSCAN preprocessing — exact TypeScript port of the training pipeline
 * (Model/flask_app/app.py: "Varian C"), so the browser sees the same tensor
 * that the ResNet50 saw during training/calibration.
 *
 *  1. crop 5 % border  →  resize 224×224 (cv2.INTER_AREA)
 *  2. gray (cv2 fixed-point)  →  1–99 percentile stretch
 *  3. CLAHE (clip 3.0, 8×8 tiles, OpenCV algorithm)
 *  4. Sobel magnitude (ksize 3, BORDER_REFLECT_101)
 *  5. merge [stretch, clahe, sobel] as "RGB"  →  ResNet50 preprocess_input (caffe: BGR − mean)
 *
 * Pure functions, no DOM / TF.js dependency → unit-testable in Node.
 */

export interface RGBAImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export const INPUT_SIZE = 224;

/** cv2.resize(..., INTER_AREA) for 3-channel uint8 (RGBA source). Returns RGB uint8. */
export function resizeAreaRGB(src: RGBAImage, x0: number, y0: number, cw: number, ch: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh * 3);
  const sx = cw / dw;
  const sy = ch / dh;
  const S = src.data;
  const W = src.width;

  if (sx >= 1 && sy >= 1) {
    // Area averaging with fractional pixel coverage (what OpenCV does for non-integer downscale).
    const xs = buildAreaTable(dw, sx, cw);
    const ys = buildAreaTable(dh, sy, ch);
    for (let oy = 0; oy < dh; oy++) {
      const yt = ys[oy];
      for (let ox = 0; ox < dw; ox++) {
        const xt = xs[ox];
        let r = 0, g = 0, b = 0;
        for (let yi = 0; yi < yt.idx.length; yi++) {
          const wy = yt.w[yi];
          const rowBase = (y0 + yt.idx[yi]) * W;
          for (let xi = 0; xi < xt.idx.length; xi++) {
            const wgt = wy * xt.w[xi];
            const p = (rowBase + x0 + xt.idx[xi]) * 4;
            r += S[p] * wgt;
            g += S[p + 1] * wgt;
            b += S[p + 2] * wgt;
          }
        }
        const o = (oy * dw + ox) * 3;
        out[o] = clamp8(Math.round(r));
        out[o + 1] = clamp8(Math.round(g));
        out[o + 2] = clamp8(Math.round(b));
      }
    }
    return out;
  }

  // Upscaling (image smaller than ~224): OpenCV runs INTER_AREA through its bilinear path with a
  // special weight formula and 11-bit fixed point arithmetic. Replicated here.
  const lin = (n: number, dn: number, scale: number) => {
    const inv = 1 / scale;
    const off = new Int32Array(dn);
    const a0 = new Int32Array(dn);
    const a1 = new Int32Array(dn);
    for (let d = 0; d < dn; d++) {
      let s = Math.floor(d * scale);
      let f = Math.fround((d + 1) - (s + 1) * inv);
      f = f <= 0 ? 0 : Math.fround(f - Math.floor(f));
      if (s < 0) { f = 0; s = 0; }
      if (s >= n - 1) { f = 0; s = n - 1; }
      off[d] = s;
      a0[d] = Math.round((1 - f) * 2048);
      a1[d] = Math.round(f * 2048);
    }
    return { off, a0, a1 };
  };
  const hx = lin(cw, dw, sx);
  const hy = lin(ch, dh, sy);
  const tmp = new Int32Array(2 * 3 * dw);
  for (let oy = 0; oy < dh; oy++) {
    for (let r = 0; r < 2; r++) {
      const row = y0 + Math.min(hy.off[oy] + r, ch - 1);
      for (let ox = 0; ox < dw; ox++) {
        const xa = hx.off[ox];
        const xb = Math.min(xa + 1, cw - 1);
        for (let c = 0; c < 3; c++) {
          tmp[(r * dw + ox) * 3 + c] =
            S[(row * W + x0 + xa) * 4 + c] * hx.a0[ox] + S[(row * W + x0 + xb) * 4 + c] * hx.a1[ox];
        }
      }
    }
    const b0 = hy.a0[oy];
    const b1 = hy.a1[oy];
    for (let ox = 0; ox < dw; ox++) {
      for (let c = 0; c < 3; c++) {
        const v = (b0 * tmp[ox * 3 + c] + b1 * tmp[(dw + ox) * 3 + c] + (1 << 21)) >> 22;
        out[(oy * dw + ox) * 3 + c] = clamp8(v);
      }
    }
  }
  return out;
}

function buildAreaTable(dn: number, scale: number, srcN: number) {
  const tab: { idx: number[]; w: number[] }[] = [];
  for (let d = 0; d < dn; d++) {
    const fs = d * scale;
    const fe = Math.min((d + 1) * scale, srcN);
    const i0 = Math.floor(fs);
    const i1 = Math.min(Math.ceil(fe), srcN);
    const idx: number[] = [];
    const w: number[] = [];
    let sum = 0;
    for (let i = i0; i < i1; i++) {
      const wt = Math.min(i + 1, fe) - Math.max(i, fs);
      if (wt > 0) {
        idx.push(i);
        w.push(wt);
        sum += wt;
      }
    }
    for (let k = 0; k < w.length; k++) w[k] /= sum;
    tab.push({ idx, w });
  }
  return tab;
}

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** cv2.cvtColor(RGB2GRAY) — OpenCV fixed-point coefficients. */
export function toGray(rgb: Uint8Array, n: number): Uint8Array {
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    g[i] = (rgb[i * 3] * 4899 + rgb[i * 3 + 1] * 9617 + rgb[i * 3 + 2] * 1868 + 8192) >> 14;
  }
  return g;
}

/** np.percentile (linear interpolation) on uint8 data via histogram. */
export function percentileU8(a: Uint8Array, q: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < a.length; i++) hist[a[i]]++;
  const pos = (q / 100) * (a.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, a.length - 1);
  const frac = pos - lo;
  const at = (k: number) => {
    let cum = 0;
    for (let v = 0; v < 256; v++) {
      cum += hist[v];
      if (k < cum) return v;
    }
    return 255;
  };
  const vlo = at(lo);
  const vhi = at(hi);
  return vlo + (vhi - vlo) * frac;
}

export function enhanceDarkGray(gray: Uint8Array): Uint8Array {
  const p1 = percentileU8(gray, 1);
  const p99 = percentileU8(gray, 99);
  const denom = Math.max(p99 - p1, 10);
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const v = ((gray[i] - p1) * 255) / denom;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.trunc(v); // astype(np.uint8) truncates
  }
  return out;
}

/** cv2.createCLAHE(clipLimit, (tiles, tiles)).apply — port of OpenCV's CLAHE for sizes divisible by tiles. */
export function clahe(src: Uint8Array, w: number, h: number, clipLimitIn = 3.0, tiles = 8): Uint8Array {
  const tw = w / tiles;
  const th = h / tiles;
  if (!Number.isInteger(tw) || !Number.isInteger(th)) throw new Error('CLAHE: size must be divisible by tiles');
  const tileArea = tw * th;
  const clipLimit = Math.max(Math.trunc((clipLimitIn * tileArea) / 256), 1);
  const lutScale = Math.fround(255 / tileArea);
  const luts = new Uint8Array(tiles * tiles * 256);
  const hist = new Int32Array(256);

  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      hist.fill(0);
      for (let y = ty * th; y < (ty + 1) * th; y++) {
        const row = y * w;
        for (let x = tx * tw; x < (tx + 1) * tw; x++) hist[src[row + x]]++;
      }
      let clipped = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipLimit) {
          clipped += hist[i] - clipLimit;
          hist[i] = clipLimit;
        }
      }
      const batch = Math.trunc(clipped / 256);
      let residual = clipped - batch * 256;
      for (let i = 0; i < 256; i++) hist[i] += batch;
      if (residual > 0) {
        const step = Math.max(Math.trunc(256 / residual), 1);
        for (let i = 0; i < 256 && residual > 0; i += step, residual--) hist[i]++;
      }
      let sum = 0;
      const base = (ty * tiles + tx) * 256;
      for (let i = 0; i < 256; i++) {
        sum += hist[i];
        luts[base + i] = clamp8(roundHalfEven(Math.fround(sum * lutScale)));
      }
    }
  }

  const out = new Uint8Array(w * h);
  const invTw = Math.fround(1 / tw);
  const invTh = Math.fround(1 / th);
  for (let y = 0; y < h; y++) {
    const tyf = Math.fround(y * invTh - 0.5);
    const ty1i = Math.floor(tyf);
    const ya = tyf - ty1i;
    const ya1 = 1 - ya;
    const ty1 = Math.max(ty1i, 0);
    const ty2 = Math.min(ty1i + 1, tiles - 1);
    for (let x = 0; x < w; x++) {
      const txf = Math.fround(x * invTw - 0.5);
      const tx1i = Math.floor(txf);
      const xa = txf - tx1i;
      const xa1 = 1 - xa;
      const tx1 = Math.max(tx1i, 0);
      const tx2 = Math.min(tx1i + 1, tiles - 1);
      const v = src[y * w + x];
      const r =
        (luts[(ty1 * tiles + tx1) * 256 + v] * xa1 + luts[(ty1 * tiles + tx2) * 256 + v] * xa) * ya1 +
        (luts[(ty2 * tiles + tx1) * 256 + v] * xa1 + luts[(ty2 * tiles + tx2) * 256 + v] * xa) * ya;
      out[y * w + x] = clamp8(roundHalfEven(r));
    }
  }
  return out;
}

function roundHalfEven(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Sobel (ksize=3, dx=1,dy=0 / dx=0,dy=1) magnitude, normalised by max → uint8. */
export function sobelMagnitude(src: Uint8Array, w: number, h: number): Uint8Array {
  const mag = new Float64Array(w * h);
  let max = 0;
  const refl = (i: number, n: number) => (i < 0 ? -i : i >= n ? 2 * n - i - 2 : i); // BORDER_REFLECT_101
  for (let y = 0; y < h; y++) {
    const ym = refl(y - 1, h) * w, y0 = y * w, yp = refl(y + 1, h) * w;
    for (let x = 0; x < w; x++) {
      const xm = refl(x - 1, w), xp = refl(x + 1, w);
      const a = src[ym + xm], b = src[ym + x], c = src[ym + xp];
      const d = src[y0 + xm], f = src[y0 + xp];
      const g = src[yp + xm], hh = src[yp + x], i = src[yp + xp];
      const gx = c + 2 * f + i - (a + 2 * d + g);
      const gy = g + 2 * hh + i - (a + 2 * b + c);
      const m = Math.hypot(gx, gy);
      mag[y0 + x] = m;
      if (m > max) max = m;
    }
  }
  const denom = Math.max(max, 1);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const v = (mag[i] * 255) / denom;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.trunc(v);
  }
  return out;
}

export type PreprocessKind =
  | 'tekscan_variant_c_resnet50'
  | 'imagenet_caffe'
  | 'imagenet_torch'
  | 'mobilenet_pm1'
  | 'div255';

/** Returns Float32Array(224*224*3), NHWC, ready for the model (batch dim added by caller). */
export function preprocess(img: RGBAImage, kind: PreprocessKind, size = INPUT_SIZE): Float32Array {
  const n = size * size;
  const out = new Float32Array(n * 3);

  if (kind === 'tekscan_variant_c_resnet50') {
    const ch = Math.trunc(img.height * 0.05);
    const cw = Math.trunc(img.width * 0.05);
    const rgb = resizeAreaRGB(img, cw, ch, img.width - 2 * cw, img.height - 2 * ch, size, size);
    const gray = toGray(rgb, n);
    const stretched = enhanceDarkGray(gray);
    const cl = clahe(stretched, size, size, 3.0, 8);
    const sob = sobelMagnitude(cl, size, size);
    // merged = [stretched, clahe, sobel] (treated as RGB) → caffe preprocess: BGR minus ImageNet mean
    for (let i = 0; i < n; i++) {
      out[i * 3] = sob[i] - 103.939;
      out[i * 3 + 1] = cl[i] - 116.779;
      out[i * 3 + 2] = stretched[i] - 123.68;
    }
    return out;
  }

  // Generic RGB pipelines for future models (plain resize, no crop).
  const rgb = resizeAreaRGB(img, 0, 0, img.width, img.height, size, size);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    switch (kind) {
      case 'imagenet_caffe':
        out[i * 3] = b - 103.939; out[i * 3 + 1] = g - 116.779; out[i * 3 + 2] = r - 123.68;
        break;
      case 'imagenet_torch':
        out[i * 3] = (r / 255 - 0.485) / 0.229; out[i * 3 + 1] = (g / 255 - 0.456) / 0.224; out[i * 3 + 2] = (b / 255 - 0.406) / 0.225;
        break;
      case 'mobilenet_pm1':
        out[i * 3] = r / 127.5 - 1; out[i * 3 + 1] = g / 127.5 - 1; out[i * 3 + 2] = b / 127.5 - 1;
        break;
      default:
        out[i * 3] = r / 255; out[i * 3 + 1] = g / 255; out[i * 3 + 2] = b / 255;
    }
  }
  return out;
}

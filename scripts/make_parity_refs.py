"""Generate test images + reference tensors (OpenCV/Keras pipeline from Model/flask_app/app.py).
Run:  python scripts/make_parity_refs.py   then   node scripts/parity_preprocess.mjs
"""
import os, json, types, sys
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import numpy as np, cv2
import tensorflow as tf

OUT = os.path.join(os.path.dirname(__file__), "parity")
os.makedirs(OUT, exist_ok=True)


def clean_and_crop_border(img_rgb):
    h, w = img_rgb.shape[:2]
    ch, cw = int(h * 0.05), int(w * 0.05)
    cropped = img_rgb[ch:h - ch, cw:w - cw]
    return cv2.resize(cropped, (224, 224), interpolation=cv2.INTER_AREA)


def enhance_dark_gray(g):
    p1 = np.percentile(g, 1); p99 = np.percentile(g, 99)
    return np.clip((g - p1) * 255.0 / max(p99 - p1, 10.0), 0, 255).astype(np.uint8)


def preprocess_image(img_rgb):  # identical to app.py
    img_res = clean_and_crop_border(img_rgb)
    gray = cv2.cvtColor(img_res, cv2.COLOR_RGB2GRAY)
    stretched = enhance_dark_gray(gray)
    cl = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(stretched)
    sx = cv2.Sobel(cl, cv2.CV_64F, 1, 0, ksize=3); sy = cv2.Sobel(cl, cv2.CV_64F, 0, 1, ksize=3)
    sob = np.hypot(sx, sy)
    sob8 = np.clip(sob * 255.0 / max(sob.max(), 1.0), 0, 255).astype(np.uint8)
    merged = cv2.merge([stretched, cl, sob8])
    return tf.keras.applications.resnet50.preprocess_input(merged.astype(np.float32))


def fake_fabric(w, h, seed):
    rng = np.random.default_rng(seed)
    base = rng.normal(170, 18, (h, w, 3)).clip(0, 255).astype(np.uint8)
    base = cv2.GaussianBlur(base, (0, 0), 1.2)
    yy, xx = np.mgrid[0:h, 0:w]
    base = (base * (0.85 + 0.15 * np.sin(xx / 3.0)[..., None] * np.cos(yy / 4.0)[..., None])).clip(0, 255).astype(np.uint8)
    cv2.circle(base, (w // 3, h // 2), max(h // 8, 5), (40, 30, 25), -1)
    cv2.line(base, (int(w * .7), 0), (int(w * .7), h), (90, 80, 70), max(w // 150, 2))
    return base


def main():
    cases = [("wide_2446x1000", 2446, 1000), ("phone_4000x3000", 4000, 3000), ("small_300x200", 300, 200),
             ("square_224", 224, 224), ("tiny_180x150", 180, 150)]
    meta = []
    for i, (name, w, h) in enumerate(cases):
        img = fake_fabric(w, h, i)
        rgba = np.dstack([img, np.full((h, w), 255, np.uint8)])
        rgba.tofile(os.path.join(OUT, name + ".rgba"))
        ref = preprocess_image(img)
        ref.astype(np.float32).tofile(os.path.join(OUT, name + ".ref.f32"))
        meta.append({"name": name, "w": w, "h": h})
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"))
    print("ok", [m["name"] for m in meta])

if __name__ == "__main__":
    main()

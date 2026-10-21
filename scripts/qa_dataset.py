"""
QA false-positive dengan GAMBAR KAIN ASLI.

Susunan folder (nama folder = label asli, sama dengan class_names.json):
    <folder>/defect_free/*.jpg   <folder>/stain/*.jpg   <folder>/hole/*.jpg
    <folder>/lines/*.jpg         <folder>/horizontal/*.jpg  <folder>/vertical/*.jpg
Gunakan HANYA gambar test/validasi yang tidak dipakai training.

Jalankan:  python scripts/qa_dataset.py "D:/dataset_test"
Keluaran: confusion matrix, FPR sistem otomatis, % zona manual, daftar gambar bermasalah (qa_report.csv).
Pipeline identik dengan web (preprocess Varian C + T + theta + delta + konsistensi flip H/V).
"""
import os, sys, csv, json, types
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
sys.modules.setdefault("tensorflow_decision_forests", types.ModuleType("tensorflow_decision_forests"))
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
from convert_model import build_model, load_weights
from make_parity_refs import preprocess_image  # same code as flask_app/app.py

ROOT = os.path.join(os.path.dirname(__file__), "..")
man = json.load(open(os.path.join(ROOT, "public", "models", "resnet50-c", "manifest.json")))
CL, D = man["classNames"], man["decision"]


def calib(p):
    l = np.log(np.clip(p, 1e-12, 1 - 1e-12)) / D["temperature"]
    e = np.exp(l - l.max()); return e / e.sum()


def main(folder):
    model = build_model(); load_weights(model)
    rows = []
    for ci, cname in enumerate(CL):
        d = os.path.join(folder, cname)
        if not os.path.isdir(d): continue
        for f in sorted(os.listdir(d)):
            img = cv2.imread(os.path.join(d, f))
            if img is None: continue
            x = preprocess_image(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))[None]
            batch = np.concatenate([x, x[:, :, ::-1], x[:, ::-1]])  # id, flipH, flipV
            probs = model.predict(batch, verbose=0)
            p = calib(probs[0]); o = np.argsort(p)[::-1]
            top, conf, margin = o[0], p[o[0]], p[o[0]] - p[o[1]]
            consistent = all(np.argmax(calib(q)) == top for q in probs[1:])
            uncertain = conf < D["theta"] or margin < D["delta"] or not consistent
            verdict = "uncertain" if uncertain else ("normal" if CL[top] == "defect_free" else "defect")
            rows.append((cname, f, CL[top], round(float(conf), 3), round(float(margin), 3), consistent, verdict))
    with open(os.path.join(ROOT, "qa_report.csv"), "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["true", "file", "pred", "conf", "margin", "tta_consistent", "verdict"]); w.writerows(rows)

    n = len(rows); auto = [r for r in rows if r[6] != "uncertain"]
    clean = [r for r in rows if r[0] == "defect_free"]
    defects = [r for r in rows if r[0] != "defect_free"]
    fp_auto = [r for r in clean if r[6] == "defect"]          # kain normal diputuskan cacat otomatis
    fp_raw = [r for r in clean if r[2] != "defect_free"]       # tanpa zona verifikasi
    miss_auto = [r for r in defects if r[6] == "normal"]       # cacat lolos sebagai normal
    wrong_auto = [r for r in auto if r[6] == "defect" and r[0] != "defect_free" and r[0] != r[2]]
    print(f"Total {n} gambar | otomatis {len(auto)} | zona manual {100*(n-len(auto))/max(n,1):.1f}%")
    print(f"FPR mentah (tanpa verifikasi)        : {len(fp_raw)}/{len(clean)}")
    print(f"FPR sistem otomatis (YANG PENTING)   : {len(fp_auto)}/{len(clean)}")
    print(f"Cacat lolos jadi 'normal' (FN)       : {len(miss_auto)}/{len(defects)}")
    print(f"Cacat terdeteksi tapi salah jenis    : {len(wrong_auto)}")
    print("Detail masalah ada di qa_report.csv")


if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1])

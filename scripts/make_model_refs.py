"""Reference probabilities from the ORIGINAL pipeline (OpenCV preprocessing + Keras ResNet50)
for the parity images created by make_parity_refs.py.
Run:  python scripts/make_parity_refs.py && python scripts/make_model_refs.py && node scripts/parity_model.mjs
"""
import os, sys, json, types
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
sys.modules.setdefault("tensorflow_decision_forests", types.ModuleType("tensorflow_decision_forests"))
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from convert_model import build_model, load_weights

D = os.path.join(os.path.dirname(__file__), "parity")
model = build_model()
load_weights(model)
meta = json.load(open(os.path.join(D, "meta.json")))
out = {}
for m in meta:
    x = np.fromfile(os.path.join(D, m["name"] + ".ref.f32"), dtype=np.float32).reshape(1, 224, 224, 3)
    out[m["name"]] = model.predict(x, verbose=0)[0].tolist()
json.dump(out, open(os.path.join(D, "model_refs.json"), "w"))
print(json.dumps({k: [round(v, 3) for v in p] for k, p in out.items()}))

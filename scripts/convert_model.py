"""
Rebuild the Keras-3 trained ResNet50 (Model/model_final.keras) inside tf.keras 2.15,
verify it against the shipped TFLite model, and export it to TensorFlow.js (float32).

Usage:  python scripts/convert_model.py
Output: public/models/resnet50-c/{model.json, group*.bin}
"""
import os, sys, io, json, zipfile, types, shutil
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import numpy as np
import h5py
import tensorflow as tf

# tensorflowjs imports tensorflow_decision_forests which is broken on this machine; we don't need it.
sys.modules.setdefault("tensorflow_decision_forests", types.ModuleType("tensorflow_decision_forests"))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "Model", "model_final.keras")
TFLITE = os.path.join(ROOT, "Model", "model_final.tflite")
OUT = os.path.join(ROOT, "public", "models", "resnet50-c")


def build_model():
    base = tf.keras.applications.ResNet50(include_top=False, weights=None, input_shape=(224, 224, 3))
    x = tf.keras.layers.GlobalAveragePooling2D(name="global_average_pooling2d_6")(base.output)
    x = tf.keras.layers.Dropout(0.2)(x)
    out = tf.keras.layers.Dense(6, activation="softmax", name="dense_6")(x)
    return tf.keras.Model(base.input, out, name="resnet50_c")


def load_weights(model):
    with zipfile.ZipFile(SRC) as z:
        buf = io.BytesIO(z.read("model.weights.h5"))
        cfg = json.loads(z.read("config.json"))
    f = h5py.File(buf, "r")

    # Keras 3 stores weights under auto names (conv2d, conv2d_1, ...) in creation order,
    # while the config keeps the ResNet names (conv1_conv, ...). Map them by order.
    auto = {"Conv2D": "conv2d", "BatchNormalization": "batch_normalization", "Dense": "dense"}
    counters, h5_name = {}, {}
    for l in cfg["config"]["layers"]:
        cls = l["class_name"]
        if cls in auto:
            n = counters.get(cls, 0)
            counters[cls] = n + 1
            h5_name[l["config"]["name"]] = auto[cls] + ("" if n == 0 else f"_{n}")

    loaded = 0
    for layer in model.layers:
        if not layer.weights:
            continue
        g = f["layers"][h5_name[layer.name]]["vars"]
        arrs = [g[str(i)][()] for i in range(len(g.keys()))]
        assert len(arrs) == len(layer.weights), (layer.name, len(arrs), len(layer.weights))
        for w, a in zip(layer.weights, arrs):
            assert tuple(w.shape) == a.shape, (layer.name, w.shape, a.shape)
        layer.set_weights(arrs)
        loaded += 1
    print("layers with weights loaded:", loaded)


def check_against_tflite(model):
    interp = tf.lite.Interpreter(model_path=TFLITE)
    interp.allocate_tensors()
    i = interp.get_input_details()[0]
    o = interp.get_output_details()[0]
    print("tflite input", i["shape"], i["dtype"])
    rng = np.random.default_rng(0)
    worst = 0.0
    for _ in range(5):
        x = (rng.normal(0, 40, size=(1, 224, 224, 3))).astype(np.float32)
        interp.set_tensor(i["index"], x)
        interp.invoke()
        ref = interp.get_tensor(o["index"])[0]
        got = model.predict(x, verbose=0)[0]
        worst = max(worst, float(np.abs(ref - got).max()))
    print("max |keras2-rebuild - tflite| prob diff:", worst)
    assert worst < 1e-3, "rebuilt model does not match shipped TFLite"


def main():
    model = build_model()
    load_weights(model)
    check_against_tflite(model)

    import tensorflowjs as tfjs
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)
    tfjs.converters.save_keras_model(model, OUT)  # float32 on purpose: float16 quantisation shifted probabilities by up to 0.1-0.5
    print("saved to", OUT, [f for f in os.listdir(OUT)])

    # Reference vectors for the browser-side parity test.
    rng = np.random.default_rng(1)
    xs = rng.normal(0, 40, size=(3, 224, 224, 3)).astype(np.float32)
    ys = model.predict(xs, verbose=0)
    np.save(os.path.join(ROOT, "scripts", "ref_inputs.npy"), xs)
    np.save(os.path.join(ROOT, "scripts", "ref_outputs.npy"), ys)


if __name__ == "__main__":
    main()

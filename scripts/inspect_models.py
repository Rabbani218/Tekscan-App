"""Inspect Keras models in Model/ (input shape, params, output activation)."""
import os, sys
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import tensorflow as tf

ROOT = os.path.join(os.path.dirname(__file__), "..", "Model")
for name in sys.argv[1:] or ["model_final.keras", "ResNet50_best.keras", "MobileNetV2_best.keras"]:
    p = os.path.join(ROOT, name)
    try:
        m = tf.keras.models.load_model(p, compile=False)
        print(name, "in", m.input_shape, "out", m.output_shape, "params", m.count_params(),
              "last_act", getattr(m.layers[-1], "activation", None).__name__,
              "layers", len(m.layers), "first", [l.name for l in m.layers[:3]])
    except Exception as e:
        print(name, "ERROR", type(e).__name__, str(e)[:300])

import os
import json
import numpy as np
import cv2
import tensorflow as tf
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Muat seluruh konfigurasi riil
with open('class_names.json', 'r') as f:
    CLASS_NAMES = json.load(f)
with open('preprocessing_config.json', 'r') as f:
    PRE_CONF = json.load(f)
with open('decision_config.json', 'r') as f:
    DEC_CONF = json.load(f)

# Muat model Keras
model = tf.keras.models.load_model('model_final.keras')

def clean_and_crop_border(img_rgb):
    h, w = img_rgb.shape[:2]
    ch, cw = int(h * 0.05), int(w * 0.05)
    cropped = img_rgb[ch:h-ch, cw:w-cw]
    return cv2.resize(cropped, (224, 224), interpolation=cv2.INTER_AREA)

def enhance_dark_gray(gray_uint8):
    p1 = np.percentile(gray_uint8, 1)
    p99 = np.percentile(gray_uint8, 99)
    return np.clip((gray_uint8 - p1) * 255.0 / max(p99 - p1, 10.0), 0, 255).astype(np.uint8)

def preprocess_image(img_rgb):
    img_res = clean_and_crop_border(img_rgb)
    gray = cv2.cvtColor(img_res, cv2.COLOR_RGB2GRAY)
    stretched = enhance_dark_gray(gray)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8)).apply(stretched)
    sobel_x = cv2.Sobel(clahe, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(clahe, cv2.CV_64F, 0, 1, ksize=3)
    sobel = np.hypot(sobel_x, sobel_y)
    sobel_uint8 = np.clip(sobel * 255.0 / max(sobel.max(), 1.0), 0, 255).astype(np.uint8)
    merged = cv2.merge([stretched, clahe, sobel_uint8])

    # Scale untuk model terkalibrasi ResNet50
    return tf.keras.applications.resnet50.preprocess_input(merged.astype(np.float32))

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        if 'file' not in request.files:
            return render_template('index.html', error="Berkas tidak ditemukan")
        file = request.files['file']
        if file.filename == '':
            return render_template('index.html', error="Berkas kosong")

        if file:
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)

            # Load & Preprocess
            img_bgr = cv2.imread(filepath)
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            processed = preprocess_image(img_rgb)

            # Predict Logits
            batch_x = np.expand_dims(processed, axis=0)
            probs_raw = model.predict(batch_x)[0]
            probs_raw = np.clip(probs_raw, 1e-12, 1.0 - 1e-12)
            logits = np.log(probs_raw)

            # Temperature Scaling
            T = DEC_CONF['T']
            scaled_logits = logits / T
            exp_logits = np.exp(scaled_logits)
            probs = exp_logits / np.sum(exp_logits)

            # Evaluasi Zona Verifikasi
            pred_idx = np.argmax(probs)
            confidence = float(probs[pred_idx])

            sorted_probs = np.sort(probs)
            margin = float(sorted_probs[-1] - sorted_probs[-2])

            theta = DEC_CONF['theta']
            delta = DEC_CONF['delta']

            is_manual = (confidence < theta) or (margin < delta)

            result = {
                'filename': filename,
                'raw_probs': [float(p) for p in probs_raw],
                'calibrated_probs': [float(p) for p in probs],
                'class_name': CLASS_NAMES[pred_idx],
                'confidence': confidence,
                'margin': margin,
                'decision_mode': "MANUAL VERIFICATION" if is_manual else "AUTOMATIC SYSTEM",
                'T': T,
                'theta': theta,
                'delta': delta
            }
            return render_template('index.html', result=result, filepath=filepath)

    return render_template('index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

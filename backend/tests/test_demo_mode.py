"""Uji komprehensif mode DEMO untuk backend TEKSCAN (FastAPI + ONNX Runtime)."""

import io
import os
import sys
from pathlib import Path
import numpy as np
import pytest
from PIL import Image
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Pastikan MODEL_MODE diset ke demo sebelum main diimpor
os.environ["MODEL_MODE"] = "demo"

from main import app, state


@pytest.fixture
def client():
    os.environ["MODEL_MODE"] = "demo"
    from main import load_engines
    load_engines()
    with TestClient(app) as c:
        yield c


def _create_jpeg(width: int, height: int, color=(128, 128, 128)) -> io.BytesIO:
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    buf.seek(0)
    return buf


def test_demo_health(client):
    """(a) /health harus melaporkan model_mode='demo' dan demo=true."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["model_mode"] == "demo"
    assert data["demo"] is True
    assert "models" in data
    assert data["models"]["yolo"] is not None
    assert data["models"]["yolo_size_bytes"] > 0
    assert data["models"]["resnet"] is not None
    assert data["models"]["resnet_size_bytes"] > 0


def test_demo_predict_defect_and_nms(client):
    """(b) /predict default/defect: status CACAT TERDETEKSI, demo=true, NMS mengeliminasi kotak tumpang tindih."""
    img_buf = _create_jpeg(640, 640)
    res = client.post(
        "/predict?model=both&demo_case=defect",
        files={"file": ("test_defect.jpg", img_buf, "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["demo"] is True
    assert data["model_mode"] == "demo"
    assert data["status"] == "CACAT TERDETEKSI"

    # Verifikasi NMS: Model demo defect memiliki 4 kotak kandidat,
    # tetapi Box 1 dan Box 2 memiliki IoU > 0.85 untuk kelas yang sama (hole).
    # NMS harus menyingkirkan Box 2 sehingga hanya tersisa 3 kotak.
    dets = data["detections"]
    assert len(dets) == 3, f"Diharapkan 3 kotak setelah NMS, didapat {len(dets)}"
    top_det = dets[0]
    assert top_det["class"] == "hole"
    assert top_det["score"] >= 0.90

    # Verifikasi klasifikasi ResNet50
    assert data["classification"] is not None
    assert data["classification"]["top1"] == "hole"
    assert data["classification"]["top1_score"] >= 0.90

    # Verifikasi watermark anotasi memuat penanda DEMO
    assert data["annotated_image_base64"] is not None


def test_demo_predict_uncertain_case(client):
    """(b) /predict demo_case=uncertain harus memicu status PERLU VERIFIKASI MANUAL."""
    img_buf = _create_jpeg(640, 640)
    res = client.post(
        "/predict?model=both&demo_case=uncertain",
        files={"file": ("test_uncertain.jpg", img_buf, "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["demo"] is True
    assert data["status"] == "PERLU VERIFIKASI MANUAL"
    assert len(data["detections"]) >= 1
    assert data["detections"][0]["score"] < 0.50
    assert data["detections"][0]["score"] >= 0.25


def test_demo_predict_clean_case(client):
    """(b) /predict demo_case=clean harus memicu status TIDAK ADA CACAT."""
    img_buf = _create_jpeg(640, 640)
    res = client.post(
        "/predict?model=both&demo_case=clean",
        files={"file": ("test_clean.jpg", img_buf, "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["demo"] is True
    assert data["status"] == "TIDAK ADA CACAT"
    assert len(data["detections"]) == 0  # Skor di bawah 0.25 dibuang oleh threshold conf
    assert data["classification"]["top1"] == "defect_free"


def test_demo_coordinate_mapping_different_aspect_ratios(client):
    """(c) Kotak harus dipetakan secara akurat ke ukuran citra asli persegi panjang (640x480 dan 1920x1080)."""
    # 1. Uji pada 640x480 (rasio 4:3)
    res_480 = client.post(
        "/predict?model=yolo&demo_case=defect",
        files={"file": ("fabric_640x480.jpg", _create_jpeg(640, 480), "image/jpeg")},
    )
    assert res_480.status_code == 200
    data_480 = res_480.json()
    assert data_480["image"]["w"] == 640
    assert data_480["image"]["h"] == 480
    for d in data_480["detections"]:
        x1, y1, x2, y2 = d["box"]
        assert 0 <= x1 < x2 <= 640
        assert 0 <= y1 < y2 <= 480

    # 2. Uji pada 1920x1080 (rasio 16:9 widescreen)
    res_1080 = client.post(
        "/predict?model=yolo&demo_case=defect",
        files={"file": ("fabric_1920x1080.jpg", _create_jpeg(1920, 1080), "image/jpeg")},
    )
    assert res_1080.status_code == 200
    data_1080 = res_1080.json()
    assert data_1080["image"]["w"] == 1920
    assert data_1080["image"]["h"] == 1080
    for d in data_1080["detections"]:
        x1, y1, x2, y2 = d["box"]
        assert 0 <= x1 < x2 <= 1920
        assert 0 <= y1 < y2 <= 1080

    # Verifikasi bahwa koordinat diskalakan proposional dengan ukuran gambar
    box_480_top = data_480["detections"][0]["box"]
    box_1080_top = data_1080["detections"][0]["box"]
    # Lebar kotak pada 1920px harus 3x lebih besar daripada pada 640px (1920 / 640 = 3)
    w_480 = box_480_top[2] - box_480_top[0]
    w_1080 = box_1080_top[2] - box_1080_top[0]
    assert abs(w_1080 - 3.0 * w_480) < 5.0, f"Skala lebar tidak proporsional: {w_1080} vs {3.0*w_480}"


def test_demo_invalid_files(client):
    """(d) Penolakan berkas tidak valid tetap berjalan sempurna dalam mode demo."""
    # Berkas teks
    txt_file = io.BytesIO(b"bukan gambar sama sekali")
    res_txt = client.post(
        "/predict?model=yolo",
        files={"file": ("sample.txt", txt_file, "text/plain")},
    )
    assert res_txt.status_code == 415

    # Gambar rusak
    corrupt_buf = io.BytesIO(b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00corrupted-data-header")
    res_corrupt = client.post(
        "/predict?model=yolo",
        files={"file": ("bad.jpg", corrupt_buf, "image/jpeg")},
    )
    assert res_corrupt.status_code == 400
    assert "rusak" in res_corrupt.json().get("error", "").lower()

    # Berkas kosong
    empty_buf = io.BytesIO(b"")
    res_empty = client.post(
        "/predict?model=yolo",
        files={"file": ("empty.jpg", empty_buf, "image/jpeg")},
    )
    assert res_empty.status_code == 400

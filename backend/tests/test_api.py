"""Pengujian otomatis backend TEKSCAN menggunakan FastAPI TestClient dan pytest."""

import io
from pathlib import Path
import numpy as np
import pytest
from PIL import Image
from fastapi.testclient import TestClient

# Impor app
import sys
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from main import app, state
from engine import Engine


@pytest.fixture(scope="session")
def client():
    # Pastikan startup lifespan terpanggil
    with TestClient(app) as c:
        yield c


def test_health(client):
    """GET /health harus mengembalikan 200 (jika model siap) atau 503 dengan detail error jika model belum ditaruh."""
    res = client.get("/health")
    assert res.status_code in (200, 503)
    data = res.json()
    if res.status_code == 200:
        assert data["status"] == "ok"
        assert "models" in data
        assert "load_time_ms" in data
    else:
        assert data["status"] == "error"
        assert "error" in data


def test_predict_invalid_file_type(client):
    """Unggah berkas teks/bukan gambar harus ditolak dengan status 415."""
    fake_file = io.BytesIO(b"Hello world, not an image")
    res = client.post(
        "/predict?model=yolo",
        files={"file": ("test.txt", fake_file, "text/plain")}
    )
    assert res.status_code == 415
    assert "tidak didukung" in res.json().get("error", "").lower()


def test_predict_corrupted_image(client):
    """Unggah berkas berlabel image/jpeg tetapi isinya rusak harus mengembalikan status 400."""
    corrupted_data = io.BytesIO(b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00corrupted-payload-data")
    res = client.post(
        "/predict?model=yolo",
        files={"file": ("corrupt.jpg", corrupted_data, "image/jpeg")}
    )
    assert res.status_code == 400
    assert "rusak" in res.json().get("error", "").lower()


def test_predict_valid_synthetic_image(client):
    """Jika model tersedia di backend, uji inferensi citra sintetis menghasilkan status valid dan anotasi base64."""
    if state.get("engine") is None:
        pytest.skip("Model ONNX belum dimuat di server, lewati uji inferensi.")

    # Buat gambar RGB 300x300 valid
    img = Image.new("RGB", (300, 300), color=(128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    res = client.post(
        "/predict?model=yolo",
        files={"file": ("fabric.jpg", buf, "image/jpeg")}
    )
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert data["status"] in ("TIDAK ADA CACAT", "PERLU VERIFIKASI MANUAL", "CACAT TERDETEKSI")
    assert "detections" in data
    assert "latency_ms" in data
    assert "annotated_image_base64" in data
    assert data["image"]["w"] == 300
    assert data["image"]["h"] == 300

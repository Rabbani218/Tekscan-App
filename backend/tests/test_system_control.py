"""Pengujian endpoint Kontrol Panel & Self-Healing backend."""

import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

os.environ["MODEL_MODE"] = "demo"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from main import app


@pytest.fixture
def client():
    os.environ["MODEL_MODE"] = "demo"
    from main import load_engines
    load_engines()
    with TestClient(app) as c:
        yield c


def test_system_status(client):
    res = client.get("/system/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "diagnostics" in data
    assert "os" in data["diagnostics"]
    assert "resources" in data["diagnostics"]
    assert "ports" in data["diagnostics"]


def test_web_status(client):
    res = client.get("/system/web-status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "web_status" in data


def test_system_heal(client):
    res = client.post("/system/heal")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "self_healing" in data
    assert data["self_healing"]["success"] is True


def test_system_config_update(client):
    payload = {
        "conf_threshold": 0.40,
        "iou_threshold": 0.60,
        "verify_threshold": 0.30
    }
    res = client.post("/system/config", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["thresholds"]["conf_threshold"] == 0.40
    assert data["thresholds"]["iou_threshold"] == 0.60
    assert data["thresholds"]["verify_threshold"] == 0.30


def test_local_sqlite_scan_history(client):
    sample_scan = {
        "source": "upload",
        "model": "yolo",
        "status": "CACAT TERDETEKSI",
        "detections": [{"class": "hole", "score": 0.95, "box": [10, 10, 50, 50]}],
        "latency_ms": 14.5,
        "image": {"w": 640, "h": 640},
        "file_name": "test_kain.jpg",
        "is_demo": True
    }
    # Save scan
    save_res = client.post("/api/scans/local", json=sample_scan)
    assert save_res.status_code == 200
    assert save_res.json()["saved"] is True

    # Retrieve scans
    get_res = client.get("/api/scans/local?limit=5")
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["status"] == "ok"
    assert data["count"] > 0
    assert data["scans"][0]["file_name"] == "test_kain.jpg"

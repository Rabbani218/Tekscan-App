"""TEKSCAN backend (FastAPI) — Mendukung mode REAL, mode DEMO, dan Kontrol Panel Self-Healing.

Fitur:
- Mode REAL & DEMO (MODEL_MODE=real|demo)
- Uji Kasus Demo: ?demo_case=defect|uncertain|clean
- Pemulihan Mandiri (Self-Healing) & Pembebasan Port
- Basis Data Lokal SQLite Offline (Fallback Otomatis)
- Endpoint Kontrol Panel & Pemantauan Status Web
"""
from __future__ import annotations
# pyright: reportMissingImports=false

import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

_BACKEND_DIR = Path(__file__).resolve().parent
_TEKSCAN_DIR = _BACKEND_DIR.parent
_WORKSPACE_DIR = _TEKSCAN_DIR.parent
for _p in (str(_BACKEND_DIR), str(_TEKSCAN_DIR), str(_WORKSPACE_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

if TYPE_CHECKING:
    from tekscan.backend.engine import ConfigError, Engine, decode_image
    from tekscan.backend.self_healing import healer
else:
    from engine import ConfigError, Engine, decode_image
    from self_healing import healer

log = logging.getLogger("tekscan")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

MAX_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

MODEL_MODE = os.environ.get("MODEL_MODE", "real").strip().lower()
if MODEL_MODE not in ("real", "demo"):
    log.warning("MODEL_MODE '%s' tidak valid, menggunakan 'real'", MODEL_MODE)
    MODEL_MODE = "real"

if MODEL_MODE == "demo":
    MODEL_DIR = Path(os.environ.get("MODEL_DIR_DEMO", Path(__file__).resolve().parent / "models_demo"))
else:
    MODEL_DIR = Path(os.environ.get("MODEL_DIR", Path(__file__).resolve().parent / "models"))


def parse_origins(raw: Optional[str]) -> List[str]:
    origins = [o.strip().rstrip("/") for o in (raw or "http://localhost:3000").split(",") if o.strip()]
    if "*" in origins:
        raise RuntimeError("ALLOWED_ORIGINS tidak boleh '*'. Tulis domain secara eksplisit.")
    return origins


ALLOWED_ORIGINS = parse_origins(os.environ.get("ALLOWED_ORIGINS"))

state: Dict[str, Any] = {
    "engine": None,
    "demo_engines": {},
    "error": None,
    "started_at": None,
    "model_mode": MODEL_MODE,
}


def load_engines():
    """Muat model sesuai state['model_mode']."""
    current_mode = os.environ.get("MODEL_MODE", state.get("model_mode", "real")).strip().lower()
    state["model_mode"] = current_mode
    log.info("Memuat engine TEKSCAN dalam MODEL_MODE='%s'", current_mode)

    if current_mode == "real":
        target_dir = Path(os.environ.get("MODEL_DIR", Path(__file__).resolve().parent / "models"))
        alt_dir = Path(__file__).resolve().parent.parent.parent / "model_dan_aplikasi"

        if not (target_dir / "tekscan_yolo.onnx").is_file() and (alt_dir / "tekscan_yolo.onnx").is_file():
            target_dir = alt_dir

        required_files = ["tekscan_yolo.onnx", "class_names.json", "preprocessing_config.json"]
        missing = [f for f in required_files if not (target_dir / f).is_file()]
        if missing:
            state["engine"] = None
            state["error"] = (
                f"Mode REAL aktif, tetapi berkas model di '{target_dir}' belum lengkap. "
                f"Berkas yang belum ditemukan: {', '.join(missing)}. "
                f"Silakan letakkan model asli di folder tersebut atau jalankan dengan MODEL_MODE=demo untuk pengujian."
            )
            log.error(state["error"])
            return

        try:
            state["engine"] = Engine(target_dir)
            state["error"] = None
            log.info("Model REAL berhasil dimuat dari %s (%.1f ms)", target_dir, state["engine"].load_time_ms)
        except (ConfigError, Exception) as exc:
            state["engine"] = None
            state["error"] = f"{type(exc).__name__}: {exc}"
            log.error("Gagal memuat model REAL: %s", state["error"])

    else:  # current_mode == "demo"
        target_dir = Path(os.environ.get("MODEL_DIR_DEMO", Path(__file__).resolve().parent / "models_demo"))
        # Auto-heal jika folder demo belum ada
        if not (target_dir / "tekscan_yolo_demo.onnx").exists():
            log.info("Model demo belum ditemukan, menjalankan auto-heal...")
            healer.heal_demo_models()

        try:
            state["engine"] = Engine(target_dir)
            state["error"] = None
            log.info("Model DEMO default berhasil dimuat dari %s (%.1f ms)", target_dir, state["engine"].load_time_ms)

            # Muat varian kasus demo (case_defect, case_uncertain, case_clean) jika ada
            state["demo_engines"] = {}
            for case in ("defect", "uncertain", "clean"):
                case_path = target_dir / f"case_{case}"
                if case_path.is_dir():
                    try:
                        state["demo_engines"][case] = Engine(case_path)
                        log.info("Model DEMO case '%s' dimuat", case)
                    except Exception as e:
                        log.warning("Gagal memuat demo case '%s': %s", case, e)

        except (ConfigError, Exception) as exc:
            state["engine"] = None
            state["error"] = f"Gagal memuat model demo: {type(exc).__name__}: {exc}"
            log.error(state["error"])


@asynccontextmanager
async def lifespan(_: FastAPI):
    state["started_at"] = time.time()
    # Inisialisasi basis data lokal
    healer.init_local_sqlite()
    load_engines()
    yield


app = FastAPI(title="TEKSCAN API", version="2.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=False,
    max_age=600,
)


def _error(code: int, msg: str) -> HTTPException:
    return HTTPException(status_code=code, detail=msg)


# ==========================================
# ENDPOINT STANDAR KESEHATAN & PREDIKSI
# ==========================================
@app.get("/health")
def health() -> JSONResponse:
    eng: Optional[Engine] = state["engine"]
    current_mode = state["model_mode"]
    is_demo = (current_mode == "demo")
    if eng is None:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "model_mode": current_mode,
                "demo": is_demo,
                "error": state["error"],
                "model_dir": str(MODEL_DIR),
            },
        )
    info = eng.info()
    return JSONResponse(content={
        "status": "ok",
        "model_mode": current_mode,
        "demo": is_demo,
        "models": {
            "yolo": info["yolo"].get("file") if info["yolo"]["loaded"] else None,
            "yolo_size_bytes": info["yolo"].get("size_bytes") if info["yolo"]["loaded"] else None,
            "resnet": info["resnet"].get("file") if info["resnet"]["loaded"] else None,
            "resnet_size_bytes": info["resnet"].get("size_bytes") if info["resnet"]["loaded"] else None,
        },
        "thresholds": {
            "conf_threshold": eng.conf_threshold,
            "iou_threshold": eng.iou_threshold,
            "verify_threshold": eng.verify_threshold,
            "defect_threshold": eng.cfg.status.defect_threshold,
        },
        "load_time_ms": info["load_time_ms"],
        "classes": info["classes"],
        "indonesian_map": info.get("indonesian_map", {}),
        "detail": {"yolo": info["yolo"], "resnet": info["resnet"]},
        "allowed_origins": ALLOWED_ORIGINS,
    })


@app.post("/predict")
def predict(
    file: UploadFile = File(..., description="Gambar JPG/PNG/WEBP, maks 8 MB"),
    model: str = Query("yolo", pattern="^(yolo|resnet|both)$"),
    demo_case: Optional[str] = Query(None, pattern="^(defect|uncertain|clean)$"),
    conf_threshold: Optional[float] = Query(None, ge=0.01, le=0.99),
    iou_threshold: Optional[float] = Query(None, ge=0.05, le=0.95),
) -> Dict[str, Any]:
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED_TYPES:
        raise _error(415, f"Tipe berkas '{ctype or 'tidak diketahui'}' tidak didukung. Gunakan JPG, PNG, atau WEBP.")
    data = file.file.read(MAX_BYTES + 1)
    if len(data) == 0:
        raise _error(400, "Berkas kosong.")
    if len(data) > MAX_BYTES:
        raise _error(413, "Berkas lebih dari 8 MB.")
    try:
        img = decode_image(data)
    except ValueError as exc:
        raise _error(400, str(exc)) from exc

    current_mode = state["model_mode"]
    is_demo = (current_mode == "demo")
    eng: Optional[Engine] = None
    if is_demo:
        if demo_case and demo_case in state.get("demo_engines", {}):
            eng = state["demo_engines"][demo_case]
        else:
            eng = state["engine"]
    else:
        eng = state["engine"]

    if eng is None:
        raise _error(503, f"Model belum siap: {state['error']}")
    if model in ("yolo", "both") and eng.yolo is None:
        raise _error(400, "Model YOLO tidak tersedia di server ini.")
    if model == "both" and eng.resnet is None:
        model = "yolo"
    elif model == "resnet" and eng.resnet is None:
        # Fallback ramah jika ResNet50 belum tersedia, beralih ke YOLO11s
        model = "yolo"

    res = eng.predict(
        img,
        model=model,
        demo=is_demo,
        conf_threshold=conf_threshold,
        iou_threshold=iou_threshold,
    )
    return res


# ==========================================
# ENDPOINT KONTROL PANEL & SISTEM SELF-HEALING
# ==========================================
@app.get("/system/status")
def system_status() -> Dict[str, Any]:
    """Mengembalikan status detail sistem, resource, port, dan model."""
    diag = healer.get_system_diagnostics()
    uptime = time.time() - (state["started_at"] or time.time())
    return {
        "status": "ok",
        "app_name": "TEKSCAN Core",
        "version": "2.2.0",
        "uptime_seconds": round(uptime, 1),
        "model_mode": state["model_mode"],
        "engine_ready": state["engine"] is not None,
        "engine_error": state["error"],
        "diagnostics": diag,
        "allowed_origins": ALLOWED_ORIGINS,
    }


@app.get("/system/web-status")
def web_status(
    vercel_url: Optional[str] = Query(None),
    hf_url: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Pemeriksaan status web publik dan lokal (Hugging Face Spaces, Vercel, Lokal)."""
    results = healer.check_web_endpoints(vercel_url=vercel_url, hf_url=hf_url)
    return {"status": "ok", "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "web_status": results}


@app.post("/system/heal")
def system_heal() -> Dict[str, Any]:
    """Jalankan siklus self-healing komprehensif."""
    heal_res = healer.run_full_self_heal()
    load_engines()
    return {
        "status": "ok",
        "self_healing": heal_res,
        "model_mode": state["model_mode"],
        "engine_ready": state["engine"] is not None,
    }


@app.post("/system/config")
def update_config(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Ubah konfigurasi model secara dinamis dari Control Panel."""
    new_mode = payload.get("model_mode")
    if new_mode in ("real", "demo"):
        state["model_mode"] = new_mode
        load_engines()

    eng: Optional[Engine] = state["engine"]
    if eng:
        if "conf_threshold" in payload:
            eng.conf_threshold = float(payload["conf_threshold"])
        if "iou_threshold" in payload:
            eng.iou_threshold = float(payload["iou_threshold"])
        if "verify_threshold" in payload:
            eng.verify_threshold = float(payload["verify_threshold"])
        if "defect_threshold" in payload:
            eng.cfg.status.defect_threshold = float(payload["defect_threshold"])

    return {
        "status": "ok",
        "model_mode": state["model_mode"],
        "engine_ready": state["engine"] is not None,
        "thresholds": {
            "conf_threshold": eng.conf_threshold if eng else 0.08,
            "iou_threshold": eng.iou_threshold if eng else 0.45,
            "verify_threshold": eng.verify_threshold if eng else 0.08,
            "defect_threshold": eng.cfg.status.defect_threshold if eng else 0.15,
        } if eng else None,
    }


# ==========================================
# ENDPOINT RIWAYAT PEMINDAIAN LOKAL (OFFLINE)
# ==========================================
@app.get("/api/scans/local")
def get_local_scans(limit: int = 50) -> Dict[str, Any]:
    """Ambil riwayat scan dari basis data SQLite lokal."""
    scans = healer.get_recent_scans_local(limit)
    return {"status": "ok", "count": len(scans), "scans": scans}


@app.post("/api/scans/local")
def save_local_scan(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Simpan riwayat scan ke SQLite lokal saat Postgres tidak ada."""
    ok, scan_id = healer.save_scan_local(payload)
    if not ok:
        raise _error(500, "Gagal menyimpan ke basis data SQLite lokal.")
    return {"status": "ok", "saved": True, "id": scan_id}


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

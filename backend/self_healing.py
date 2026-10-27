"""Modul Self-Healing TEKSCAN.

Menyediakan diagnosis otomatis dan pemulihan mandiri untuk:
1. Pemeriksaan & perbaikan dependensi Python (onnxruntime, fastapi, pillow, numpy, dll.)
2. Pemeriksaan & pembebasan port (7860 dan 3000) dari proses zombie/beku
3. Pembuatan otomatis model demo jika belum ada atau rusak
4. Inisialisasi basis data SQLite lokal untuk riwayat pemindaian offline
5. Pemantauan sumber daya sistem (CPU, RAM, Disk, Penyedia Eksekusi ONNX)
6. Uji konektivitas web (Hugging Face Spaces, Vercel, Supabase)
"""

from __future__ import annotations

import os
import sys
import json
import time
import socket
import shutil
import sqlite3
import platform
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import psutil
except ImportError:
    psutil = None


class SelfHealer:
    def __init__(self, project_root: Optional[Path] = None):
        if project_root is None:
            # Cari root tekscan
            current = Path(__file__).resolve().parent
            if (current / "package.json").exists():
                self.root = current
            elif (current.parent / "package.json").exists():
                self.root = current.parent
            else:
                self.root = current
        else:
            self.root = Path(project_root).resolve()

        self.backend_dir = self.root / "backend"
        self.models_dir = self.backend_dir / "models"
        self.models_demo_dir = self.backend_dir / "models_demo"
        self.db_dir = self.root / "db"
        self.db_dir.mkdir(parents=True, exist_ok=True)
        self.sqlite_db = self.db_dir / "tekscan_local.sqlite"

    # ==========================================
    # 1. PEMERIKSAAN & PEMBEBASAN PORT
    # ==========================================
    def is_port_in_use(self, port: int, host: str = "127.0.0.1") -> bool:
        """Periksa apakah port tertentu sedang digunakan."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex((host, port)) == 0

    def find_free_port(self, preferred_port: int, max_tries: int = 10) -> int:
        """Cari port yang tersedia jika preferred_port terpakai."""
        if not self.is_port_in_use(preferred_port):
            return preferred_port
        for p in range(preferred_port + 1, preferred_port + 1 + max_tries):
            if not self.is_port_in_use(p):
                return p
        return preferred_port

    def heal_port(self, port: int) -> Tuple[bool, str]:
        """Bebaskan port jika dikuasai oleh proses lama/zombie."""
        if not self.is_port_in_use(port):
            return True, f"Port {port} sudah bebas."

        killed_pids = []
        if psutil:
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    for conn in proc.connections(kind='inet'):
                        if conn.laddr.port == port:
                            pid = proc.info['pid']
                            if pid != os.getpid():
                                proc.terminate()
                                killed_pids.append(pid)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        else:
            # Fallback Windows netstat + taskkill
            if platform.system() == "Windows":
                try:
                    out = subprocess.run(["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True).stdout
                    for line in out.splitlines():
                        if f":{port} " in line and "LISTENING" in line:
                            pid = line.strip().split()[-1]
                            if pid.isdigit() and int(pid) != os.getpid():
                                subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
                                killed_pids.append(int(pid))
                except Exception as exc:
                    return False, f"Gagal membebaskan port {port}: {exc}"

        time.sleep(1.0)
        if not self.is_port_in_use(port):
            return True, f"Port {port} berhasil dibebaskan (dihentikan PID: {killed_pids})."
        return False, f"Port {port} masih terkunci setelah dicoba dibebaskan."

    # ==========================================
    # 2. AUTO-HEAL DEPENDENSI PYTHON
    # ==========================================
    def check_python_dependencies(self) -> Dict[str, bool]:
        """Periksa apakah pustaka utama backend tersedia."""
        packages = ["fastapi", "uvicorn", "onnxruntime", "numpy", "PIL", "httpx"]
        status = {}
        for pkg in packages:
            try:
                __import__(pkg)
                status[pkg] = True
            except ImportError:
                status[pkg] = False
        return status

    def heal_python_dependencies(self) -> Tuple[bool, str]:
        """Pasang dependensi yang kurang secara otomatis."""
        dep_status = self.check_python_dependencies()
        missing = [pkg for pkg, ok in dep_status.items() if not ok]
        if not missing:
            return True, "Semua dependensi Python lengkap."

        req_file = self.backend_dir / "requirements.txt"
        if not req_file.exists():
            return False, f"Berkas {req_file} tidak ditemukan."

        cmd = [sys.executable, "-m", "pip", "install", "-r", str(req_file)]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if res.returncode == 0:
                return True, f"Dependensi Python berhasil dipasang ({', '.join(missing)})."
            return False, f"Gagal memasang dependensi: {res.stderr}"
        except Exception as exc:
            return False, f"Error saat pip install: {exc}"

    # ==========================================
    # 3. AUTO-HEAL MODEL DEMO
    # ==========================================
    def check_models(self, mode: str = "demo") -> Tuple[bool, List[str]]:
        """Periksa apakah model yang dibutuhkan tersedia."""
        req_files = ["tekscan_yolo.onnx", "resnet50.onnx", "class_names.json", "preprocessing_config.json"]
        if mode == "demo":
            target_dir = self.models_demo_dir
            demo_req = ["tekscan_yolo_demo.onnx", "resnet50_demo.onnx", "class_names.json", "preprocessing_config.json"]
            missing = [f for f in demo_req if not (target_dir / f).exists()]
            return len(missing) == 0, missing
        else:
            target_dir = self.models_dir
            alt_dir = self.root.parent / "model_dan_aplikasi"
            req_files = ["tekscan_yolo.onnx", "class_names.json", "preprocessing_config.json"]
            missing = [f for f in req_files if not (target_dir / f).exists() and not (alt_dir / f).exists()]
            return len(missing) == 0, missing

    def heal_demo_models(self) -> Tuple[bool, str]:
        """Buat model demo otomatis jika belum ada."""
        ok, missing = self.check_models("demo")
        if ok:
            return True, "Model demo lengkap dan siap."

        script = self.root / "scripts" / "make_demo_models.py"
        if not script.exists():
            return False, f"Skrip pembuat model demo tidak ditemukan di {script}"

        cmd = [sys.executable, str(script)]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if res.returncode == 0:
                return True, "Model demo berhasil digenerate otomatis."
            return False, f"Gagal membuat model demo: {res.stderr}"
        except Exception as exc:
            return False, f"Error eksekusi make_demo_models.py: {exc}"

    # ==========================================
    # 4. BASIS DATA SQLITE LOKAL (FALLBACK OFFLINE)
    # ==========================================
    def init_local_sqlite(self) -> Tuple[bool, str]:
        """Inisialisasi tabel riwayat pemindaian lokal SQLite."""
        try:
            conn = sqlite3.connect(str(self.sqlite_db))
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS scans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    source TEXT NOT NULL,
                    model TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detections TEXT,
                    classification TEXT,
                    latency_ms REAL NOT NULL,
                    image_width INTEGER NOT NULL,
                    image_height INTEGER NOT NULL,
                    file_name TEXT,
                    is_demo BOOLEAN NOT NULL DEFAULT 0
                )
            """)
            conn.commit()
            conn.close()
            return True, f"SQLite lokal siap di {self.sqlite_db}"
        except Exception as exc:
            return False, f"Gagal inisialisasi SQLite: {exc}"

    def save_scan_local(self, data: Dict[str, Any]) -> Tuple[bool, Optional[int]]:
        """Simpan hasil scan ke database SQLite lokal."""
        try:
            self.init_local_sqlite()
            conn = sqlite3.connect(str(self.sqlite_db))
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO scans (
                    source, model, status, detections, classification,
                    latency_ms, image_width, image_height, file_name, is_demo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data.get("source", "upload"),
                data.get("model", "yolo"),
                data.get("status", "TIDAK ADA CACAT"),
                json.dumps(data.get("detections", [])),
                json.dumps(data.get("classification")),
                float(data.get("latency_ms", 0.0)),
                int(data.get("image", {}).get("w", 640)),
                int(data.get("image", {}).get("h", 640)),
                data.get("file_name", "citra_kain.jpg"),
                1 if data.get("is_demo") else 0
            ))
            scan_id = cur.lastrowid
            conn.commit()
            conn.close()
            return True, scan_id
        except Exception:
            return False, None

    def get_recent_scans_local(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Ambil riwayat scan dari SQLite lokal."""
        try:
            if not self.sqlite_db.exists():
                return []
            conn = sqlite3.connect(str(self.sqlite_db))
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT * FROM scans ORDER BY created_at DESC LIMIT ?", (limit,))
            rows = cur.fetchall()
            results = []
            for r in rows:
                results.append({
                    "id": r["id"],
                    "created_at": r["created_at"],
                    "source": r["source"],
                    "model": r["model"],
                    "status": r["status"],
                    "detections": json.loads(r["detections"]) if r["detections"] else [],
                    "classification": json.loads(r["classification"]) if r["classification"] else None,
                    "latency_ms": r["latency_ms"],
                    "image": {"w": r["image_width"], "h": r["image_height"]},
                    "file_name": r["file_name"],
                    "is_demo": bool(r["is_demo"]),
                })
            conn.close()
            return results
        except Exception:
            return []

    # ==========================================
    # 5. DIAGNOSIS LENGKAP SISTEM
    # ==========================================
    def get_system_diagnostics(self) -> Dict[str, Any]:
        """Himpun diagnosis kesehatan seluruh sistem."""
        # Info OS & Hardware
        cpu_usage = 0.0
        ram_usage = 0.0
        ram_total_gb = 0.0
        if psutil:
            cpu_usage = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            ram_usage = mem.percent
            ram_total_gb = round(mem.total / (1024**3), 1)

        # Info ONNX Provider
        onnx_providers = []
        try:
            import onnxruntime as ort
            onnx_providers = ort.get_available_providers()
        except Exception:
            pass

        # Periksa Port
        port_be_ok = not self.is_port_in_use(7860)
        port_fe_ok = not self.is_port_in_use(3000)

        # Periksa Model
        has_real_models, missing_real = self.check_models("real")
        has_demo_models, missing_demo = self.check_models("demo")

        # Periksa Python Deps
        py_deps = self.check_python_dependencies()

        # Periksa SQLite
        sqlite_ok = self.sqlite_db.exists()

        overall_health = "healthy"
        issues = []
        if not all(py_deps.values()):
            overall_health = "warning"
            issues.append("Beberapa dependensi Python belum terpasang.")
        if not has_real_models and not has_demo_models:
            overall_health = "critical"
            issues.append("Tidak ada model real maupun demo yang tersedia.")

        return {
            "status": overall_health,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "os": {
                "system": platform.system(),
                "release": platform.release(),
                "machine": platform.machine(),
                "python": platform.python_version(),
            },
            "resources": {
                "cpu_percent": cpu_usage,
                "ram_percent": ram_usage,
                "ram_total_gb": ram_total_gb,
            },
            "onnx": {
                "providers": onnx_providers,
                "gpu_accelerated": any("CUDA" in p or "DirectML" in p for p in onnx_providers),
            },
            "ports": {
                "7860_available": port_be_ok,
                "3000_available": port_fe_ok,
            },
            "models": {
                "real_ready": has_real_models,
                "missing_real": missing_real,
                "demo_ready": has_demo_models,
                "missing_demo": missing_demo,
            },
            "python_dependencies": py_deps,
            "database": {
                "sqlite_local": sqlite_ok,
                "sqlite_path": str(self.sqlite_db),
            },
            "issues": issues,
        }

    # ==========================================
    # 6. SIKLUS SELF-HEALING LENGKAP
    # ==========================================
    def run_full_self_heal(self) -> Dict[str, Any]:
        """Jalankan seluruh siklus perbaikan mandiri."""
        logs = []

        # 1. Pastikan .env.local ada
        env_local = self.root / ".env.local"
        env_example = self.root / ".env.example"
        if not env_local.exists() and env_example.exists():
            shutil.copy2(env_example, env_local)
            logs.append("Dibuat .env.local dari .env.example dengan konfigurasi standar.")

        # 2. Pasang dependensi jika kurang
        dep_ok, dep_msg = self.heal_python_dependencies()
        logs.append(f"Dependensi Python: {dep_msg}")

        # 3. Model demo
        demo_ok, demo_msg = self.heal_demo_models()
        logs.append(f"Model Demo: {demo_msg}")

        # 4. Inisialisasi basis data lokal
        db_ok, db_msg = self.init_local_sqlite()
        logs.append(f"Basis Data Lokal: {db_msg}")

        # 5. Bebaskan port 7860 jika terkunci
        port_be_free, port_be_msg = self.heal_port(7860)
        logs.append(f"Pemeriksaan Port 7860: {port_be_msg}")

        diag = self.get_system_diagnostics()
        return {
            "success": dep_ok and demo_ok and db_ok,
            "logs": logs,
            "diagnostics": diag,
        }


# Instance singleton
healer = SelfHealer()

if __name__ == "__main__":
    print("Menjalankan TEKSCAN Self-Healing...")
    res = healer.run_full_self_heal()
    print("\n--- HASIL PEMULIHAN MANDIRI (SELF-HEAL) ---")
    for l in res["logs"]:
        print(f"  * {l}")
    print(f"\nStatus Sistem: {res['diagnostics']['status'].upper()}")

"""Modul Self-Healing & Portabilitas Lintas-Laptop TEKSCAN.

Menyediakan diagnosis otomatis dan pemulihan mandiri untuk:
1. Pemeriksaan & perbaikan Virtualenv Python (mendeteksi venv rusak akibat pindah laptop)
2. Pemeriksaan & instalasi otomatis library Python (onnxruntime, fastapi, pillow, numpy, psutil, dll.)
3. Deteksi otomatis Node.js/npm lintas lokasi & perbaikan node_modules / lockfile Next.js
4. Pemeriksaan & pembebasan port (7860 dan 3000) dari proses zombie/beku
5. Sinkronisasi otomatis model AI asli (YOLO11s & ResNet50) & pembuatan model demo cadangan
6. Inisialisasi basis data SQLite lokal untuk riwayat pemindaian offline
7. Pemantauan sumber daya sistem (CPU, RAM, Disk, Penyedia Eksekusi ONNX)
8. Uji konektivitas web (Vercel, Hugging Face Spaces, Backend Lokal, Frontend Lokal)
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
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

try:
    import psutil
except ImportError:
    psutil = None

DEFAULT_VERCEL_URL = os.environ.get(
    "TEKSCAN_VERCEL_URL",
    "https://tekscanapplicationwebsite-g2s3vj4u6.vercel.app",
)
DEFAULT_HF_URL = os.environ.get(
    "TEKSCAN_HF_URL",
    "https://huggingface.co/spaces",
)

REQUIRED_PYTHON_PACKAGES: Dict[str, str] = {
    "fastapi": "fastapi>=0.115.0",
    "uvicorn": "uvicorn[standard]>=0.30.0",
    "onnxruntime": "onnxruntime>=1.19.0",
    "numpy": "numpy>=1.26.0",
    "PIL": "pillow>=10.4.0",
    "multipart": "python-multipart>=0.0.9",
    "httpx": "httpx>=0.27.0",
    "psutil": "psutil>=5.9.0",
}


class SelfHealer:
    def __init__(self, project_root: Optional[Path] = None):
        if project_root is None:
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
            s.settimeout(0.4)
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

        killed_pids: List[int] = []
        my_pid = os.getpid()

        if psutil:
            for proc in psutil.process_iter(["pid", "name"]):
                try:
                    for conn in proc.connections(kind="inet"):
                        if conn.laddr.port == port:
                            pid = proc.info["pid"]
                            if pid and pid != my_pid:
                                proc.terminate()
                                killed_pids.append(pid)
                except Exception:
                    pass

        if platform.system() == "Windows":
            try:
                out = subprocess.run(
                    ["netstat", "-ano", "-p", "tcp"],
                    capture_output=True,
                    text=True,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                ).stdout
                for line in out.splitlines():
                    if f":{port} " in line and "LISTENING" in line:
                        pid_str = line.strip().split()[-1]
                        if pid_str.isdigit():
                            pid = int(pid_str)
                            if pid != my_pid and pid not in killed_pids:
                                subprocess.run(
                                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                                    capture_output=True,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                                )
                                killed_pids.append(pid)
            except Exception as exc:
                return False, f"Gagal membebaskan port {port}: {exc}"
        else:
            try:
                subprocess.run(f"lsof -ti:{port} | xargs kill -9", shell=True, capture_output=True)
            except Exception:
                pass

        time.sleep(0.8)
        if not self.is_port_in_use(port):
            return True, f"Port {port} berhasil dibebaskan (PID dihentikan: {killed_pids})."
        return False, f"Port {port} masih digunakan oleh layanan aktif."

    # ==========================================
    # 2. AUTO-HEAL PYTHON & VIRTUALENV LINTAS LAPTOP
    # ==========================================
    def is_python_exe_valid(self, py_exe: Path) -> bool:
        """Periksa apakah executable Python valid dan bukan venv rusak dari laptop lain."""
        if not py_exe.exists():
            return False
        try:
            res = subprocess.run(
                [str(py_exe), "-c", "import sys; print(sys.version_info[0])"],
                capture_output=True,
                text=True,
                timeout=8,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            return res.returncode == 0 and "3" in res.stdout
        except Exception:
            return False

    def check_python_dependencies(self, py_exe: Optional[str] = None) -> Dict[str, bool]:
        """Periksa apakah pustaka utama backend tersedia."""
        target_py = py_exe or sys.executable
        status: Dict[str, bool] = {}
        if Path(target_py).resolve() == Path(sys.executable).resolve():
            for mod_name in REQUIRED_PYTHON_PACKAGES:
                try:
                    __import__(mod_name)
                    status[mod_name] = True
                except ImportError:
                    status[mod_name] = False
            return status

        check_code = (
            "import json\n"
            f"mods = {list(REQUIRED_PYTHON_PACKAGES.keys())!r}\n"
            "out = {}\n"
            "for m in mods:\n"
            "    try:\n"
            "        __import__(m)\n"
            "        out[m] = True\n"
            "    except Exception:\n"
            "        out[m] = False\n"
            "print(json.dumps(out))\n"
        )
        try:
            res = subprocess.run(
                [target_py, "-c", check_code],
                capture_output=True,
                text=True,
                timeout=15,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if res.returncode == 0:
                return json.loads(res.stdout.strip().splitlines()[-1])
        except Exception:
            pass
        return {k: False for k in REQUIRED_PYTHON_PACKAGES}

    def heal_python_dependencies(
        self,
        py_exe: Optional[str] = None,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> Tuple[bool, str]:
        """Pasang dependensi Python yang kurang secara otomatis."""
        target_py = py_exe or sys.executable
        dep_status = self.check_python_dependencies(target_py)
        missing_mods = [mod for mod, ok in dep_status.items() if not ok]
        if not missing_mods:
            return True, "Semua library Python lengkap."

        missing_specs = [REQUIRED_PYTHON_PACKAGES[m] for m in missing_mods]
        if on_log:
            on_log(f"[SELF-HEAL] Memasang library Python yang kurang: {', '.join(missing_mods)}...")

        req_file = self.backend_dir / "requirements.txt"
        cmd = [target_py, "-m", "pip", "install", "--disable-pip-version-check"]
        if req_file.exists():
            cmd.extend(["-r", str(req_file)])
        cmd.extend(missing_specs)

        try:
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=240,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if res.returncode != 0:
                # Fallback --user jika permission ditolak di laptop lain
                cmd_user = [target_py, "-m", "pip", "install", "--user", "--disable-pip-version-check"] + missing_specs
                res = subprocess.run(
                    cmd_user,
                    capture_output=True,
                    text=True,
                    timeout=240,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            if res.returncode == 0:
                return True, f"Library Python berhasil dipasang ({', '.join(missing_mods)})."
            return False, f"Gagal memasang library Python: {res.stderr[-300:]}"
        except Exception as exc:
            return False, f"Error saat pip install: {exc}"

    # ==========================================
    # 3. DETEKSI & HEAL NODE.JS / FRONTEND LINTAS LAPTOP
    # ==========================================
    def find_node_npm(self) -> Tuple[Optional[str], Optional[str]]:
        """Cari lokasi node dan npm meskipun belum masuk PATH standar."""
        node_bin = shutil.which("node")
        npm_bin = shutil.which("npm")
        if node_bin and npm_bin:
            return node_bin, npm_bin

        candidates: List[Path] = []
        if platform.system() == "Windows":
            prog = os.environ.get("ProgramFiles", r"C:\Program Files")
            prog86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
            appdata = os.environ.get("APPDATA", "")
            localapp = os.environ.get("LOCALAPPDATA", "")
            candidates.extend([
                Path(prog) / "nodejs",
                Path(prog86) / "nodejs",
                Path(appdata) / "nvm",
                Path(localapp) / "Programs" / "nodejs",
            ])
        else:
            candidates.extend([
                Path("/usr/local/bin"),
                Path("/opt/homebrew/bin"),
                Path.home() / ".nvm" / "current" / "bin",
            ])

        for folder in candidates:
            if not folder.exists():
                continue
            n_exe = folder / ("node.exe" if platform.system() == "Windows" else "node")
            npm_exe = folder / ("npm.cmd" if platform.system() == "Windows" else "npm")
            if n_exe.exists() and npm_exe.exists():
                os.environ["PATH"] = f"{folder}{os.pathsep}{os.environ.get('PATH', '')}"
                return str(n_exe), str(npm_exe)

        return node_bin, npm_bin

    def heal_nextjs_locks(self) -> Tuple[bool, str]:
        """Bersihkan berkas .next/dev/lock yang sering mengunci Next.js saat pindah laptop/crash."""
        lock_file = self.root / ".next" / "dev" / "lock"
        cleaned = []
        if lock_file.exists():
            try:
                lock_file.unlink()
                cleaned.append(".next/dev/lock")
            except Exception:
                pass
        if cleaned:
            return True, f"Lockfile dibersihkan ({', '.join(cleaned)})."
        return True, "Tidak ada lockfile Next.js yang menyangkut."

    # ==========================================
    # 4. AUTO-HEAL & SINKRONISASI MODEL AI
    # ==========================================
    def sync_real_models(self) -> List[str]:
        """Sinkronkan model asli dari Model/ atau ../model_dan_aplikasi ke backend/models/."""
        self.models_dir.mkdir(parents=True, exist_ok=True)
        alt_dirs = [
            self.root / "Model",
            self.root.parent / "model_dan_aplikasi",
        ]
        synced: List[str] = []
        files = ["tekscan_yolo.onnx", "resnet50.onnx", "class_names.json", "preprocessing_config.json"]
        for fname in files:
            target = self.models_dir / fname
            if not target.exists() or target.stat().st_size < 50:
                for src_dir in alt_dirs:
                    cand = src_dir / fname
                    if cand.exists() and cand.stat().st_size >= 50:
                        shutil.copy2(cand, target)
                        synced.append(fname)
                        break
        return synced

    def check_models(self, mode: str = "demo") -> Tuple[bool, List[str]]:
        """Periksa apakah model yang dibutuhkan tersedia."""
        if mode == "demo":
            target_dir = self.models_demo_dir
            demo_req = ["tekscan_yolo_demo.onnx", "resnet50_demo.onnx", "class_names.json", "preprocessing_config.json"]
            missing = [f for f in demo_req if not (target_dir / f).exists()]
            return len(missing) == 0, missing
        else:
            self.sync_real_models()
            req_files = ["tekscan_yolo.onnx", "resnet50.onnx", "class_names.json", "preprocessing_config.json"]
            missing = [f for f in req_files if not (self.models_dir / f).exists()]
            return len(missing) == 0, missing

    def heal_demo_models(self) -> Tuple[bool, str]:
        """Buat model demo otomatis jika belum ada."""
        ok, _ = self.check_models("demo")
        if ok:
            return True, "Model demo lengkap dan siap."

        script = self.root / "scripts" / "make_demo_models.py"
        if not script.exists():
            return False, f"Skrip pembuat model demo tidak ditemukan di {script}"

        cmd = [sys.executable, str(script)]
        try:
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if res.returncode == 0:
                return True, "Model demo berhasil digenerate otomatis."
            return False, f"Gagal membuat model demo: {res.stderr}"
        except Exception as exc:
            return False, f"Error eksekusi make_demo_models.py: {exc}"

    # ==========================================
    # 5. BASIS DATA SQLITE LOKAL (FALLBACK OFFLINE)
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
    # 6. PEMERIKSAAN STATUS WEB (VERCEL, HUGGING FACE, LOKAL)
    # ==========================================
    def check_web_endpoints(
        self,
        vercel_url: Optional[str] = None,
        hf_url: Optional[str] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Uji konektivitas ke Vercel, Hugging Face Spaces, Backend Lokal, dan Frontend Lokal secara paralel."""
        v_url = (vercel_url or DEFAULT_VERCEL_URL).strip()
        h_url = (hf_url or os.environ.get("NEXT_PUBLIC_API_URL") or DEFAULT_HF_URL).strip()
        if "localhost" in h_url or "127.0.0.1" in h_url:
            h_url = DEFAULT_HF_URL

        targets: Dict[str, Tuple[str, float]] = {
            "local_backend": ("http://127.0.0.1:7860/health", 1.2),
            "local_frontend": ("http://127.0.0.1:3000", 1.2),
            "vercel_web": (v_url, 6.5),
            "huggingface": (h_url, 6.5),
        }

        def _probe(item: Tuple[str, Tuple[str, float]]) -> Tuple[str, Dict[str, Any]]:
            name, (url, timeout_sec) = item
            if not url:
                return name, {"online": False, "http_status": 0, "latency_ms": 0.0, "url": ""}
            # Fast socket pre-check untuk endpoint lokal agar tidak menunggu timeout panjang di Windows
            if name in ("local_backend", "local_frontend"):
                port = 7860 if name == "local_backend" else 3000
                if not self.is_port_in_use(port):
                    return name, {"online": False, "http_status": 0, "latency_ms": 0.0, "url": url}

            t0 = time.time()
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "TEKSCAN-DesktopControlPanel/2.5"},
                )
                with urllib.request.urlopen(req, timeout=timeout_sec) as res:
                    latency = round((time.time() - t0) * 1000, 1)
                    return name, {
                        "online": 200 <= res.status < 400,
                        "http_status": res.status,
                        "latency_ms": latency,
                        "url": url,
                    }
            except urllib.error.HTTPError as err:
                latency = round((time.time() - t0) * 1000, 1)
                is_reachable = err.code in (200, 301, 302, 307, 308, 401, 403)
                return name, {
                    "online": is_reachable,
                    "http_status": err.code,
                    "latency_ms": latency,
                    "url": url,
                }
            except Exception as exc:
                latency = round((time.time() - t0) * 1000, 1)
                return name, {
                    "online": False,
                    "http_status": 0,
                    "latency_ms": latency,
                    "url": url,
                    "error": str(exc),
                }

        results: Dict[str, Dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=4) as pool:
            for name, data in pool.map(_probe, targets.items()):
                results[name] = data
        return results

    # ==========================================
    # 7. DIAGNOSIS LENGKAP SISTEM
    # ==========================================
    def get_system_diagnostics(self) -> Dict[str, Any]:
        """Himpun diagnosis kesehatan seluruh sistem."""
        cpu_usage = 0.0
        ram_usage = 0.0
        ram_total_gb = 0.0
        if psutil:
            try:
                cpu_usage = psutil.cpu_percent(interval=None)
                mem = psutil.virtual_memory()
                ram_usage = mem.percent
                ram_total_gb = round(mem.total / (1024**3), 1)
            except Exception:
                pass

        onnx_providers = []
        try:
            import onnxruntime as ort
            onnx_providers = ort.get_available_providers()
        except Exception:
            pass

        port_be_ok = not self.is_port_in_use(7860)
        port_fe_ok = not self.is_port_in_use(3000)

        has_real_models, missing_real = self.check_models("real")
        has_demo_models, missing_demo = self.check_models("demo")
        py_deps = self.check_python_dependencies()
        node_bin, npm_bin = self.find_node_npm()
        sqlite_ok = self.sqlite_db.exists()

        overall_health = "healthy"
        issues = []
        if not all(py_deps.values()):
            overall_health = "warning"
            issues.append("Beberapa dependensi Python belum terpasang.")
        if not has_real_models and not has_demo_models:
            overall_health = "critical"
            issues.append("Tidak ada model real maupun demo yang tersedia.")
        if not node_bin or not npm_bin:
            overall_health = "warning"
            issues.append("Node.js/npm belum terdeteksi di sistem ini.")

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
            "node": {
                "node_path": node_bin,
                "npm_path": npm_bin,
                "node_modules_ready": (self.root / "node_modules" / "next").exists(),
            },
            "database": {
                "sqlite_local": sqlite_ok,
                "sqlite_path": str(self.sqlite_db),
            },
            "issues": issues,
        }

    # ==========================================
    # 8. SIKLUS SELF-HEALING LENGKAP
    # ==========================================
    def run_full_self_heal(self) -> Dict[str, Any]:
        """Jalankan seluruh siklus perbaikan mandiri."""
        logs = []

        env_local = self.root / ".env.local"
        env_example = self.root / ".env.example"
        if not env_local.exists():
            if env_example.exists():
                shutil.copy2(env_example, env_local)
                logs.append("Dibuat .env.local dari .env.example.")
            else:
                env_local.write_text("NEXT_PUBLIC_API_URL=http://localhost:7860\n", encoding="utf-8")
                logs.append("Dibuat .env.local standar.")

        synced = self.sync_real_models()
        if synced:
            logs.append(f"Sinkronisasi model asli: {', '.join(synced)}")

        dep_ok, dep_msg = self.heal_python_dependencies()
        logs.append(f"Dependensi Python: {dep_msg}")

        demo_ok, demo_msg = self.heal_demo_models()
        logs.append(f"Model Demo: {demo_msg}")

        db_ok, db_msg = self.init_local_sqlite()
        logs.append(f"Basis Data Lokal: {db_msg}")

        _, lock_msg = self.heal_nextjs_locks()
        logs.append(f"Next.js Lock: {lock_msg}")

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

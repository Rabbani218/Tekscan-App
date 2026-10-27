#!/usr/bin/env python3
# pyright: reportMissingImports=false, reportGeneralTypeIssues=false, reportArgumentType=false, reportOptionalMemberAccess=false, reportCallIssue=false
"""TEKSCAN — Desktop Control Panel, Live Terminal & Cross-Laptop Self-Healing App.

Jalankan cukup dengan:
    python app.py          (Membuka Aplikasi Desktop GUI Control Panel)
    python app.py --cli    (Mode Terminal CLI jika tanpa antarmuka grafis)
"""

from __future__ import annotations

import os
import sys
import json
import time
import queue
import shutil
import platform
import threading
import subprocess
import webbrowser
import urllib.request
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Tuple, Union

HAS_TK = True

ROOT_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = ROOT_DIR.parent
BACKEND_DIR = ROOT_DIR / "backend"
SCRIPTS_DIR = ROOT_DIR / "scripts"

for _p in (str(BACKEND_DIR), str(ROOT_DIR), str(WORKSPACE_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

if TYPE_CHECKING:
    from tekscan.backend.self_healing import (
        SelfHealer,
        DEFAULT_VERCEL_URL,
        DEFAULT_HF_URL,
        REQUIRED_PYTHON_PACKAGES,
    )
else:
    from self_healing import (
        SelfHealer,
        DEFAULT_VERCEL_URL,
        DEFAULT_HF_URL,
        REQUIRED_PYTHON_PACKAGES,
    )


# ============================================================================
# CROSS-LAPTOP SELF-HEALING & PROCESS ORCHESTRATOR
# ============================================================================
class TekscanController:
    """Pengendali utama proses Backend, Frontend, dan Self-Healing lintas laptop."""

    def __init__(self, log_callback: Optional[Callable[[str, str], None]] = None) -> None:
        self.healer = SelfHealer(ROOT_DIR)
        self.log_cb = log_callback
        self.os_type = platform.system()
        self.venv_dir = BACKEND_DIR / ".venv"
        self.backend_proc: Optional[subprocess.Popen] = None
        self.frontend_proc: Optional[subprocess.Popen] = None
        self.cmd_proc: Optional[subprocess.Popen] = None
        self.vercel_url = DEFAULT_VERCEL_URL
        self.hf_url = DEFAULT_HF_URL
        self.active_python: str = sys.executable

    def log(self, msg: str, tag: str = "INFO") -> None:
        timestamp = time.strftime("%H:%M:%S")
        line = f"[{timestamp}] [{tag}] {msg}"
        if self.log_cb is not None:
            self.log_cb(line, tag)
        else:
            print(line)

    def _venv_python_path(self) -> Path:
        if self.os_type == "Windows":
            return self.venv_dir / "Scripts" / "python.exe"
        return self.venv_dir / "bin" / "python"

    def resolve_working_python(self, auto_heal: bool = True) -> str:
        """Temukan atau perbaiki interpreter Python yang siap menjalankan backend di laptop mana pun."""
        venv_py = self._venv_python_path()

        if venv_py.exists():
            if self.healer.is_python_exe_valid(venv_py):
                deps = self.healer.check_python_dependencies(str(venv_py))
                if all(deps.values()):
                    self.active_python = str(venv_py)
                    return self.active_python
            else:
                self.log(
                    "Terdeteksi folder .venv dari laptop/path berbeda. Menghapus & memperbaiki otomatis...",
                    "HEAL",
                )
                shutil.rmtree(self.venv_dir, ignore_errors=True)

        sys_deps = self.healer.check_python_dependencies(sys.executable)
        if all(sys_deps.values()):
            self.active_python = sys.executable
            return self.active_python

        if not auto_heal:
            return sys.executable

        target_py = sys.executable
        if not venv_py.exists():
            try:
                self.log("Membuat virtual environment Python lokal di backend/.venv...", "HEAL")
                subprocess.run(
                    [sys.executable, "-m", "venv", str(self.venv_dir)],
                    check=True,
                    capture_output=True,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                if self.healer.is_python_exe_valid(venv_py):
                    target_py = str(venv_py)
            except Exception as exc:
                self.log(f"Info: Menggunakan Python utama sistem ({exc})", "WARN")
                target_py = sys.executable

        self.install_python_libraries(target_py)
        self.active_python = target_py
        return self.active_python

    def install_python_libraries(self, py_exe: Optional[str] = None) -> bool:
        """Pasang seluruh library Python yang diperlukan dengan streaming log ke terminal GUI."""
        target = py_exe or self.active_python or sys.executable
        deps = self.healer.check_python_dependencies(target)
        missing = [k for k, ok in deps.items() if not ok]
        if not missing:
            self.log(f"Seluruh library Python sudah terpasang lengkap ({target}).", "OK")
            return True

        specs = [REQUIRED_PYTHON_PACKAGES[m] for m in missing]
        self.log(f"Memasang library Python yang belum ada: {', '.join(missing)}...", "HEAL")

        req_file = BACKEND_DIR / "requirements.txt"
        cmd = [target, "-m", "pip", "install", "--disable-pip-version-check"]
        if req_file.exists():
            cmd.extend(["-r", str(req_file)])
        cmd.extend(specs)

        rc = self._stream_command(cmd, cwd=BACKEND_DIR, tag="HEAL")
        if rc != 0:
            self.log("Mencoba mode instalasi --user untuk kompatibilitas izin laptop...", "HEAL")
            cmd_user = [target, "-m", "pip", "install", "--user", "--disable-pip-version-check"] + specs
            rc = self._stream_command(cmd_user, cwd=BACKEND_DIR, tag="HEAL")

        if rc == 0:
            self.log("Instalasi library Python selesai dengan sukses!", "OK")
            return True
        self.log("Beberapa library Python gagal dipasang. Periksa koneksi internet.", "ERROR")
        return False

    def install_node_modules(self, force: bool = False) -> bool:
        """Periksa dan pasang node_modules secara otomatis jika belum lengkap."""
        node_bin, npm_bin = self.healer.find_node_npm()
        if not node_bin or not npm_bin:
            self.log(
                "Node.js / npm tidak ditemukan di laptop ini. Unduh Node.js LTS dari https://nodejs.org",
                "WARN",
            )
            return False

        next_pkg = ROOT_DIR / "node_modules" / "next"
        if not force and next_pkg.exists():
            self.log(f"Node.js ({node_bin}) & node_modules sudah siap.", "OK")
            return True

        self.log("Menjalankan 'npm install' untuk menyiapkan dependensi frontend...", "HEAL")
        cmd = [npm_bin, "install", "--no-audit", "--no-fund"]
        rc = self._stream_command(cmd, cwd=ROOT_DIR, tag="HEAL")
        if rc == 0:
            self.log("Dependensi frontend (node_modules) berhasil dipasang!", "OK")
            return True
        self.log("Gagal menjalankan npm install.", "ERROR")
        return False

    def run_comprehensive_self_heal(self) -> bool:
        """Siklus Self-Healing penuh agar aplikasi langsung siap di laptop mana pun."""
        self.log("=== MEMULAI SIKLUS SELF-HEALING LINTAS LAPTOP ===", "HEAL")

        env_local = ROOT_DIR / ".env.local"
        env_example = ROOT_DIR / ".env.example"
        if not env_local.exists():
            if env_example.exists():
                shutil.copy2(env_example, env_local)
            else:
                env_local.write_text("NEXT_PUBLIC_API_URL=http://localhost:7860\n", encoding="utf-8")
            self.log("Berkas .env.local berhasil dibuat otomatis.", "HEAL")
        else:
            self.log("Konfigurasi .env.local ditemukan.", "OK")

        synced = self.healer.sync_real_models()
        if synced:
            self.log(f"Model AI disinkronkan otomatis: {', '.join(synced)}", "HEAL")
        real_ok, missing_real = self.healer.check_models("real")
        if real_ok:
            self.log("Model Produksi AI (YOLO11s & ResNet50) lengkap & terverifikasi.", "OK")
        else:
            self.log(f"Model real kurang ({missing_real}), memastikan model demo siap...", "WARN")
            ok_demo, msg_demo = self.healer.heal_demo_models()
            self.log(msg_demo, "OK" if ok_demo else "ERROR")

        py_exe = self.resolve_working_python(auto_heal=True)
        self.log(f"Interpreter Python aktif: {py_exe}", "OK")

        db_ok, db_msg = self.healer.init_local_sqlite()
        self.log(db_msg, "OK" if db_ok else "WARN")

        _, lock_msg = self.healer.heal_nextjs_locks()
        self.log(lock_msg, "OK")
        self.install_node_modules(force=False)

        self.log("=== SIKLUS SELF-HEALING SELESAI ===", "OK")
        return True

    def _stream_command(
        self,
        cmd: Union[List[str], str],
        cwd: Path = ROOT_DIR,
        tag: str = "CMD",
        shell: bool = False,
    ) -> int:
        """Jalankan subproses dan teruskan baris output secara real-time ke terminal log."""
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(cwd),
                shell=shell,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if self.os_type == "Windows" else 0,
            )
            self.cmd_proc = proc
            stdout = proc.stdout
            if stdout is not None:
                for raw_line in iter(stdout.readline, ""):
                    line = raw_line.rstrip()
                    if line:
                        self.log(line, tag)
            proc.wait()
            return proc.returncode or 0
        except Exception as exc:
            self.log(f"Gagal menjalankan perintah: {exc}", "ERROR")
            return 1
        finally:
            self.cmd_proc = None

    def start_backend(self, mode: Optional[str] = None, port: int = 7860) -> None:
        """Jalankan server Backend FastAPI (Port 7860) dengan live log streaming."""
        if self.healer.is_port_in_use(port):
            self.log(f"Backend sudah berjalan aktif di port {port}.", "OK")
            return

        py_exe = self.resolve_working_python(auto_heal=True)
        real_ready, _ = self.healer.check_models("real")
        chosen_mode = mode or ("real" if real_ready else "demo")

        env = os.environ.copy()
        env["MODEL_MODE"] = chosen_mode
        env["PORT"] = str(port)
        env["PYTHONUNBUFFERED"] = "1"

        cmd = [
            py_exe,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--app-dir",
            str(BACKEND_DIR),
        ]
        self.log(f"Meluncurkan Backend FastAPI (Mode={chosen_mode.upper()}) pada port {port}...", "BACKEND")
        try:
            self.backend_proc = subprocess.Popen(
                cmd,
                cwd=str(BACKEND_DIR),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if self.os_type == "Windows" else 0,
            )
            threading.Thread(
                target=self._read_process_stream,
                args=(self.backend_proc, "BACKEND"),
                daemon=True,
            ).start()
        except Exception as exc:
            self.log(f"Gagal menyalakan Backend: {exc}", "ERROR")

    def start_frontend(self, port: int = 3000) -> None:
        """Jalankan server Frontend Next.js (Port 3000) dengan live log streaming."""
        if self.healer.is_port_in_use(port):
            self.log(f"Frontend sudah berjalan aktif di port {port}.", "OK")
            return

        self.healer.heal_nextjs_locks()
        if not self.install_node_modules(force=False):
            return

        _, npm_bin = self.healer.find_node_npm()
        if not npm_bin:
            return

        build_id = ROOT_DIR / ".next" / "BUILD_ID"
        script_name = "start" if build_id.exists() else "dev"
        cmd = [npm_bin, "run", script_name]

        env = os.environ.copy()
        env["PORT"] = str(port)

        self.log(f"Meluncurkan Frontend Next.js (npm run {script_name}) pada port {port}...", "FRONTEND")
        try:
            self.frontend_proc = subprocess.Popen(
                cmd,
                cwd=str(ROOT_DIR),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if self.os_type == "Windows" else 0,
            )
            threading.Thread(
                target=self._read_process_stream,
                args=(self.frontend_proc, "FRONTEND"),
                daemon=True,
            ).start()
        except Exception as exc:
            self.log(f"Gagal menyalakan Frontend: {exc}", "ERROR")

    def _read_process_stream(self, proc: subprocess.Popen, tag: str) -> None:
        stdout = proc.stdout
        if stdout is None:
            return
        try:
            for raw_line in iter(stdout.readline, ""):
                line = raw_line.rstrip()
                if line:
                    self.log(line, tag)
        except Exception:
            pass

    def stop_backend(self) -> None:
        self.log("Menghentikan layanan Backend (Port 7860)...", "WARN")
        if self.backend_proc is not None:
            self._terminate_proc(self.backend_proc)
            self.backend_proc = None
        _, msg = self.healer.heal_port(7860)
        self.log(msg, "OK")

    def stop_frontend(self) -> None:
        self.log("Menghentikan layanan Frontend (Port 3000)...", "WARN")
        if self.frontend_proc is not None:
            self._terminate_proc(self.frontend_proc)
            self.frontend_proc = None
        _, msg = self.healer.heal_port(3000)
        self.healer.heal_nextjs_locks()
        self.log(msg, "OK")

    def stop_all(self) -> None:
        self.stop_backend()
        self.stop_frontend()
        self.log("Seluruh layanan lokal berhasil dihentikan.", "OK")

    def _terminate_proc(self, proc: subprocess.Popen) -> None:
        try:
            if self.os_type == "Windows":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    capture_output=True,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            else:
                proc.terminate()
                proc.wait(timeout=3)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    def toggle_model_mode(self) -> Optional[str]:
        """Ubah mode model antara REAL dan DEMO secara langsung di server aktif."""
        try:
            with urllib.request.urlopen("http://127.0.0.1:7860/health", timeout=2) as r:
                d = json.loads(r.read().decode("utf-8"))
                cur_mode = d.get("model_mode", "real")
        except Exception:
            self.log("Backend belum aktif. Nyalakan Backend terlebih dahulu.", "WARN")
            return None

        target = "demo" if cur_mode == "real" else "real"
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:7860/system/config",
                data=json.dumps({"model_mode": target}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                res = json.loads(r.read().decode("utf-8"))
                new_mode = res.get("model_mode", target)
                self.log(f"Mode model berhasil diubah ke: {new_mode.upper()}", "OK")
                return str(new_mode)
        except Exception as exc:
            self.log(f"Gagal mengubah mode model: {exc}", "ERROR")
            return None


# ============================================================================
# DESKTOP GUI APPLICATION (TKINTER MODERN DARK CONTROL PANEL)
# ============================================================================
class TekscanDesktopApp:
    """Antarmuka Desktop GUI TEKSCAN Control Panel."""

    def __init__(self, root: Any) -> None:
        self.root = root
        self.root.title("TEKSCAN — Desktop Control Panel & Self-Healing Orchestrator")
        self.root.geometry("1180x760")
        self.root.minsize(980, 640)
        self.root.configure(bg="#0b0f19")

        self.log_queue: queue.Queue = queue.Queue()
        self.all_logs: List[Tuple[str, str]] = []
        self.log_filter = tk.StringVar(value="ALL")
        self.vercel_url_var = tk.StringVar(value=DEFAULT_VERCEL_URL)
        self.hf_url_var = tk.StringVar(value=DEFAULT_HF_URL)
        self.cmd_input_var = tk.StringVar(value="")

        self.controller = TekscanController(log_callback=self.enqueue_log)
        self.status_cards: Dict[str, Dict[str, Any]] = {}
        self.is_closing = False

        self._setup_styles()
        self._build_ui()

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(80, self._process_log_queue)
        self.root.after(400, self._initial_boot)

    def _open_url(self, url: str) -> None:
        target = url.strip()
        if target:
            webbrowser.open(target)

    def _setup_styles(self) -> None:
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure("TFrame", background="#0b0f19")
        style.configure("Card.TFrame", background="#111827")
        style.configure("TLabel", background="#111827", foreground="#f3f4f6", font=("Segoe UI", 10))
        style.configure("Header.TLabel", background="#0b0f19", foreground="#f9fafb", font=("Segoe UI", 15, "bold"))
        style.configure("SubHeader.TLabel", background="#0b0f19", foreground="#9ca3af", font=("Segoe UI", 9))

    def _build_ui(self) -> None:
        # ---------------- HEADER ----------------
        header = tk.Frame(self.root, bg="#0b0f19", padx=18, pady=12)
        header.pack(fill=tk.X)

        title_box = tk.Frame(header, bg="#0b0f19")
        title_box.pack(side=tk.LEFT)

        logo = tk.Label(
            title_box,
            text=" T ",
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 14, "bold"),
            padx=6,
            pady=2,
        )
        logo.pack(side=tk.LEFT, padx=(0, 10))

        title_text = tk.Frame(title_box, bg="#0b0f19")
        title_text.pack(side=tk.LEFT)
        tk.Label(
            title_text,
            text="TEKSCAN CONTROL PANEL",
            bg="#0b0f19",
            fg="#f8fafc",
            font=("Segoe UI", 14, "bold"),
            anchor="w",
        ).pack(anchor="w")
        tk.Label(
            title_text,
            text="Aplikasi Desktop Manajer Server Lokal, Pemantau Cloud (Vercel & Hugging Face), Terminal & Self-Healing Lintas Laptop",
            bg="#0b0f19",
            fg="#94a3b8",
            font=("Segoe UI", 9),
            anchor="w",
        ).pack(anchor="w")

        self.sys_badge = tk.Label(
            header,
            text="Memuat info sistem...",
            bg="#1e293b",
            fg="#38bdf8",
            font=("Consolas", 9, "bold"),
            padx=12,
            pady=6,
        )
        self.sys_badge.pack(side=tk.RIGHT)

        # ---------------- TOP PANELS (STATUS + ACTIONS) ----------------
        top_container = tk.Frame(self.root, bg="#0b0f19", padx=18, pady=4)
        top_container.pack(fill=tk.X)
        top_container.grid_columnconfigure(0, weight=5)
        top_container.grid_columnconfigure(1, weight=6)

        # === PANEL KIRI: STATUS LAYANAN LOKAL & CLOUD (VERCEL & HUGGINGFACE) ===
        status_frame = tk.LabelFrame(
            top_container,
            text=" 🌐 Status Layanan Lokal & Cloud (Vercel / Hugging Face) ",
            bg="#111827",
            fg="#60a5fa",
            font=("Segoe UI", 10, "bold"),
            bd=1,
            relief=tk.SOLID,
            padx=12,
            pady=10,
        )
        status_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 8))

        self._create_status_row(
            status_frame,
            key="local_frontend",
            title="Web Lokal (Next.js :3000)",
            default_url="http://localhost:3000",
            open_cmd=lambda: self._open_url("http://localhost:3000"),
        )
        self._create_status_row(
            status_frame,
            key="local_backend",
            title="API Lokal (FastAPI :7860)",
            default_url="http://127.0.0.1:7860/docs",
            open_cmd=lambda: self._open_url("http://127.0.0.1:7860/docs"),
        )
        self._create_status_row(
            status_frame,
            key="vercel_web",
            title="Web Vercel (Cloud)",
            url_var=self.vercel_url_var,
            open_cmd=lambda: self._open_url(self.vercel_url_var.get()),
        )
        self._create_status_row(
            status_frame,
            key="huggingface",
            title="Hugging Face Spaces",
            url_var=self.hf_url_var,
            open_cmd=lambda: self._open_url(self.hf_url_var.get()),
        )

        status_footer = tk.Frame(status_frame, bg="#111827", pady=4)
        status_footer.pack(fill=tk.X)
        self.model_info_lbl = tk.Label(
            status_footer,
            text="Model Aktif: Memeriksa...",
            bg="#111827",
            fg="#a7f3d0",
            font=("Segoe UI", 9, "bold"),
        )
        self.model_info_lbl.pack(side=tk.LEFT)

        tk.Button(
            status_footer,
            text="🔄 Cek Status Sekarang",
            bg="#1d4ed8",
            fg="#ffffff",
            activebackground="#2563eb",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=3,
            cursor="hand2",
            command=self.trigger_status_refresh,
        ).pack(side=tk.RIGHT)

        # === PANEL KANAN: KONTROL SERVER LOKAL & SELF-HEALING ===
        ctrl_frame = tk.LabelFrame(
            top_container,
            text=" ⚡ Kontrol Server Lokal & Self-Healing Portabilitas Laptop ",
            bg="#111827",
            fg="#34d399",
            font=("Segoe UI", 10, "bold"),
            bd=1,
            relief=tk.SOLID,
            padx=12,
            pady=10,
        )
        ctrl_frame.grid(row=0, column=1, sticky="nsew", padx=(8, 0))

        # Baris 1: Tombol Utama Start / Stop / Buka Browser
        row1 = tk.Frame(ctrl_frame, bg="#111827")
        row1.pack(fill=tk.X, pady=(0, 8))

        self._make_btn(
            row1,
            "▶ Jalankan Lokal (Semua)",
            "#059669",
            "#10b981",
            self.action_start_all,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 6))

        self._make_btn(
            row1,
            "⏹ Stop Semua Server",
            "#dc2626",
            "#ef4444",
            self.action_stop_all,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=6)

        self._make_btn(
            row1,
            "🌐 Buka Aplikasi Web",
            "#2563eb",
            "#3b82f6",
            lambda: self._open_url("http://localhost:3000"),
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(6, 0))

        # Baris 2: Kontrol Individual Backend / Frontend / Mode Model
        row2 = tk.Frame(ctrl_frame, bg="#111827")
        row2.pack(fill=tk.X, pady=4)

        self._make_btn(
            row2,
            "▶ Start Backend (:7860)",
            "#1e293b",
            "#334155",
            self.action_start_backend,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 4))

        self._make_btn(
            row2,
            "⏹ Stop Backend",
            "#1e293b",
            "#334155",
            self.action_stop_backend,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)

        self._make_btn(
            row2,
            "▶ Start Frontend (:3000)",
            "#1e293b",
            "#334155",
            self.action_start_frontend,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)

        self._make_btn(
            row2,
            "⏹ Stop Frontend",
            "#1e293b",
            "#334155",
            self.action_stop_frontend,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(4, 0))

        # Baris 3: Self-Healing & Instalasi Otomatis untuk Laptop Lain
        tk.Label(
            ctrl_frame,
            text="Perbaikan Otomatis (Self-Healing) Saat Pindah Laptop / Lingkungan Baru:",
            bg="#111827",
            fg="#94a3b8",
            font=("Segoe UI", 9, "bold"),
            anchor="w",
        ).pack(fill=tk.X, pady=(8, 4))

        row3 = tk.Frame(ctrl_frame, bg="#111827")
        row3.pack(fill=tk.X, pady=2)

        self._make_btn(
            row3,
            "🛠️ Auto Self-Heal Lengkap",
            "#7c3aed",
            "#8b5cf6",
            self.action_full_self_heal,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 4))

        self._make_btn(
            row3,
            "📦 Install Library Python (pip)",
            "#0284c7",
            "#0ea5e9",
            self.action_install_python_deps,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)

        self._make_btn(
            row3,
            "📦 Install Node Modules (npm)",
            "#0284c7",
            "#0ea5e9",
            self.action_install_node_deps,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(4, 0))

        # Baris 4: Utilitas Port, Cache, dan Mode Model
        row4 = tk.Frame(ctrl_frame, bg="#111827")
        row4.pack(fill=tk.X, pady=(6, 0))

        self._make_btn(
            row4,
            "🔓 Bebaskan Port 3000 & 7860",
            "#374151",
            "#4b5563",
            self.action_free_ports,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 4))

        self._make_btn(
            row4,
            "🧹 Bersihkan Lock Next.js",
            "#374151",
            "#4b5563",
            self.action_clean_next_locks,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)

        self._make_btn(
            row4,
            "🔀 Ganti Mode (REAL / DEMO)",
            "#b45309",
            "#d97706",
            self.action_toggle_mode,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(4, 0))

        # ---------------- BOTTOM PANEL: LIVE TERMINAL ----------------
        term_frame = tk.LabelFrame(
            self.root,
            text=" 💻 Live Terminal & Log Sistem (Backend, Frontend, Self-Healing & Perintah Kustom) ",
            bg="#0d1117",
            fg="#38bdf8",
            font=("Segoe UI", 10, "bold"),
            bd=1,
            relief=tk.SOLID,
            padx=12,
            pady=8,
        )
        term_frame.pack(fill=tk.BOTH, expand=True, padx=18, pady=(8, 14))

        term_bar = tk.Frame(term_frame, bg="#0d1117")
        term_bar.pack(fill=tk.X, pady=(0, 6))

        tk.Label(
            term_bar,
            text="Filter Log:",
            bg="#0d1117",
            fg="#94a3b8",
            font=("Segoe UI", 9, "bold"),
        ).pack(side=tk.LEFT, padx=(0, 6))

        for label, val in [
            ("Semua", "ALL"),
            ("Backend", "BACKEND"),
            ("Frontend", "FRONTEND"),
            ("Self-Heal", "HEAL"),
            ("Perintah", "CMD"),
        ]:
            rb = tk.Radiobutton(
                term_bar,
                text=label,
                variable=self.log_filter,
                value=val,
                bg="#0d1117",
                fg="#e2e8f0",
                selectcolor="#1e293b",
                activebackground="#0d1117",
                activeforeground="#38bdf8",
                font=("Segoe UI", 9),
                command=self._rerender_logs,
            )
            rb.pack(side=tk.LEFT, padx=4)

        tk.Button(
            term_bar,
            text="🧹 Bersihkan Layar",
            bg="#1e293b",
            fg="#cbd5e1",
            relief=tk.FLAT,
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=2,
            cursor="hand2",
            command=self.clear_terminal,
        ).pack(side=tk.RIGHT, padx=(6, 0))

        tk.Button(
            term_bar,
            text="📋 Salin Log",
            bg="#1e293b",
            fg="#cbd5e1",
            relief=tk.FLAT,
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=2,
            cursor="hand2",
            command=self.copy_terminal,
        ).pack(side=tk.RIGHT)

        text_container = tk.Frame(term_frame, bg="#090d16")
        text_container.pack(fill=tk.BOTH, expand=True)

        scrollbar = tk.Scrollbar(text_container)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.term_text = tk.Text(
            text_container,
            bg="#090d16",
            fg="#e2e8f0",
            insertbackground="#38bdf8",
            font=("Consolas", 10),
            relief=tk.FLAT,
            wrap=tk.WORD,
            yscrollcommand=scrollbar.set,
            padx=10,
            pady=8,
            state=tk.DISABLED,
        )
        self.term_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.term_text.yview)

        self.term_text.tag_config("INFO", foreground="#cbd5e1")
        self.term_text.tag_config("OK", foreground="#34d399")
        self.term_text.tag_config("WARN", foreground="#fbbf24")
        self.term_text.tag_config("ERROR", foreground="#f87171")
        self.term_text.tag_config("HEAL", foreground="#c084fc")
        self.term_text.tag_config("BACKEND", foreground="#38bdf8")
        self.term_text.tag_config("FRONTEND", foreground="#60a5fa")
        self.term_text.tag_config("CMD", foreground="#a3e635")

        cmd_bar = tk.Frame(term_frame, bg="#0d1117", pady=6)
        cmd_bar.pack(fill=tk.X)

        tk.Label(
            cmd_bar,
            text="PS / Terminal >",
            bg="#0d1117",
            fg="#34d399",
            font=("Consolas", 10, "bold"),
        ).pack(side=tk.LEFT, padx=(0, 8))

        cmd_entry = tk.Entry(
            cmd_bar,
            textvariable=self.cmd_input_var,
            bg="#161f30",
            fg="#f8fafc",
            insertbackground="#38bdf8",
            font=("Consolas", 10),
            relief=tk.FLAT,
        )
        cmd_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=5, padx=(0, 8))
        cmd_entry.bind("<Return>", lambda _e: self.action_run_custom_cmd())

        tk.Button(
            cmd_bar,
            text="▶ Jalankan Perintah",
            bg="#059669",
            fg="#ffffff",
            activebackground="#10b981",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=4,
            cursor="hand2",
            command=self.action_run_custom_cmd,
        ).pack(side=tk.RIGHT)

    def _create_status_row(
        self,
        parent: Any,
        key: str,
        title: str,
        default_url: Optional[str] = None,
        url_var: Optional[Any] = None,
        open_cmd: Optional[Callable[[], Any]] = None,
    ) -> None:
        row = tk.Frame(parent, bg="#1e293b", padx=10, pady=6)
        row.pack(fill=tk.X, pady=3)

        badge = tk.Label(
            row,
            text="● CEK...",
            bg="#334155",
            fg="#cbd5e1",
            font=("Consolas", 9, "bold"),
            width=11,
            padx=4,
            pady=2,
        )
        badge.pack(side=tk.LEFT, padx=(0, 8))

        info_col = tk.Frame(row, bg="#1e293b")
        info_col.pack(side=tk.LEFT, fill=tk.X, expand=True)

        top_line = tk.Frame(info_col, bg="#1e293b")
        top_line.pack(fill=tk.X)

        tk.Label(
            top_line,
            text=title,
            bg="#1e293b",
            fg="#f8fafc",
            font=("Segoe UI", 9, "bold"),
        ).pack(side=tk.LEFT)

        meta_lbl = tk.Label(
            top_line,
            text="Menunggu pemeriksaan...",
            bg="#1e293b",
            fg="#94a3b8",
            font=("Consolas", 8),
        )
        meta_lbl.pack(side=tk.RIGHT, padx=6)

        if url_var is not None:
            entry = tk.Entry(
                info_col,
                textvariable=url_var,
                bg="#0f172a",
                fg="#93c5fd",
                insertbackground="#38bdf8",
                font=("Consolas", 8),
                relief=tk.FLAT,
            )
            entry.pack(fill=tk.X, pady=(2, 0), ipady=1)
        elif default_url:
            tk.Label(
                info_col,
                text=default_url,
                bg="#1e293b",
                fg="#64748b",
                font=("Consolas", 8),
                anchor="w",
            ).pack(fill=tk.X)

        if open_cmd is not None:
            tk.Button(
                row,
                text="Buka ↗",
                bg="#334155",
                fg="#f8fafc",
                activebackground="#475569",
                activeforeground="#ffffff",
                relief=tk.FLAT,
                font=("Segoe UI", 8, "bold"),
                padx=8,
                pady=3,
                cursor="hand2",
                command=open_cmd,
            ).pack(side=tk.RIGHT, padx=(6, 0))

        self.status_cards[key] = {
            "badge": badge,
            "meta": meta_lbl,
        }

    def _make_btn(
        self,
        parent: Any,
        text: str,
        bg: str,
        active_bg: str,
        cmd: Callable[[], Any],
    ) -> Any:
        return tk.Button(
            parent,
            text=text,
            bg=bg,
            fg="#ffffff",
            activebackground=active_bg,
            activeforeground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=8,
            pady=6,
            cursor="hand2",
            command=cmd,
        )

    def enqueue_log(self, line: str, tag: str = "INFO") -> None:
        self.log_queue.put((line, tag))

    def _process_log_queue(self) -> None:
        if self.is_closing:
            return
        updated = False
        while not self.log_queue.empty():
            try:
                line, tag = self.log_queue.get_nowait()
                self.all_logs.append((line, tag))
                if len(self.all_logs) > 1500:
                    self.all_logs = self.all_logs[-1500:]
                flt = self.log_filter.get()
                if flt == "ALL" or flt == tag:
                    self._append_text(line, tag)
                    updated = True
            except queue.Empty:
                break
        if updated:
            self.term_text.see(tk.END)
        self.root.after(80, self._process_log_queue)

    def _append_text(self, line: str, tag: str) -> None:
        valid_tags = ("INFO", "OK", "WARN", "ERROR", "HEAL", "BACKEND", "FRONTEND", "CMD")
        use_tag = tag if tag in valid_tags else "INFO"
        self.term_text.configure(state=tk.NORMAL)
        self.term_text.insert(tk.END, line + "\n", use_tag)
        self.term_text.configure(state=tk.DISABLED)

    def _rerender_logs(self) -> None:
        flt = self.log_filter.get()
        self.term_text.configure(state=tk.NORMAL)
        self.term_text.delete("1.0", tk.END)
        for line, tag in self.all_logs:
            if flt == "ALL" or flt == tag:
                self.term_text.insert(tk.END, line + "\n", tag)
        self.term_text.see(tk.END)
        self.term_text.configure(state=tk.DISABLED)

    def clear_terminal(self) -> None:
        self.all_logs.clear()
        self.term_text.configure(state=tk.NORMAL)
        self.term_text.delete("1.0", tk.END)
        self.term_text.configure(state=tk.DISABLED)

    def copy_terminal(self) -> None:
        content = "\n".join(line for line, _ in self.all_logs)
        self.root.clipboard_clear()
        self.root.clipboard_append(content)
        self.controller.log("Log terminal berhasil disalin ke clipboard.", "OK")

    def _initial_boot(self) -> None:
        self.controller.log(
            f"TEKSCAN Control Panel siap di {platform.system()} {platform.release()} (Python {platform.python_version()})",
            "OK",
        )
        self.controller.log(f"Direktori Proyek: {ROOT_DIR}", "INFO")

        def boot_worker() -> None:
            self.controller.run_comprehensive_self_heal()
            if not self.controller.healer.is_port_in_use(7860):
                self.controller.start_backend()
            else:
                self.controller.log("Backend FastAPI (:7860) terdeteksi sudah berjalan aktif.", "OK")

            if not self.controller.healer.is_port_in_use(3000):
                self.controller.start_frontend()
            else:
                self.controller.log("Frontend Next.js (:3000) terdeteksi sudah berjalan aktif.", "OK")

            self._poll_status_once()

        threading.Thread(target=boot_worker, daemon=True).start()
        self.root.after(4500, self._periodic_poll)

    def _periodic_poll(self) -> None:
        if self.is_closing:
            return
        threading.Thread(target=self._poll_status_once, daemon=True).start()
        self.root.after(5000, self._periodic_poll)

    def trigger_status_refresh(self) -> None:
        self.controller.log("Memeriksa status layanan Lokal, Vercel, dan Hugging Face...", "INFO")
        threading.Thread(target=self._poll_status_once, daemon=True).start()

    def _poll_status_once(self) -> None:
        v_url = self.vercel_url_var.get().strip()
        h_url = self.hf_url_var.get().strip()
        web_res = self.controller.healer.check_web_endpoints(vercel_url=v_url, hf_url=h_url)
        diag = self.controller.healer.get_system_diagnostics()

        model_summary = "Backend Offline"
        if web_res.get("local_backend", {}).get("online"):
            try:
                with urllib.request.urlopen("http://127.0.0.1:7860/health", timeout=2) as r:
                    hdata = json.loads(r.read().decode("utf-8"))
                    m_mode = hdata.get("model_mode", "real").upper()
                    yolo_f = hdata.get("models", {}).get("yolo") or "N/A"
                    resnet_f = hdata.get("models", {}).get("resnet") or "N/A"
                    model_summary = f"Mode: {m_mode}  |  YOLO11s ({yolo_f}) & ResNet50 ({resnet_f})"
            except Exception:
                pass

        if not self.is_closing:
            self.root.after(0, lambda: self._update_status_ui(web_res, diag, model_summary))

    def _update_status_ui(
        self,
        web_res: Dict[str, Dict[str, Any]],
        diag: Dict[str, Any],
        model_summary: str,
    ) -> None:
        if self.is_closing:
            return
        for key, card in self.status_cards.items():
            info = web_res.get(key, {})
            online = bool(info.get("online"))
            code = info.get("http_status", 0)
            lat = info.get("latency_ms", 0.0)
            if online:
                card["badge"].configure(text="● ONLINE", bg="#065f46", fg="#6ee7b7")
                card["meta"].configure(text=f"HTTP {code} · {lat} ms", fg="#34d399")
            else:
                card["badge"].configure(text="● OFFLINE", bg="#7f1d1d", fg="#fca5a5")
                code_txt = f"HTTP {code}" if code else "Tidak Terhubung"
                card["meta"].configure(text=f"{code_txt} · {lat} ms", fg="#f87171")

        self.model_info_lbl.configure(text=model_summary)

        res = diag.get("resources", {})
        os_info = diag.get("os", {})
        cpu = res.get("cpu_percent", 0.0)
        ram = res.get("ram_percent", 0.0)
        ram_gb = res.get("ram_total_gb", 0.0)
        self.sys_badge.configure(
            text=f"{os_info.get('system', 'OS')} | Py {os_info.get('python', '')} | CPU: {cpu}% | RAM: {ram}% ({ram_gb} GB)"
        )

    def action_start_all(self) -> None:
        def job() -> None:
            self.controller.start_backend()
            self.controller.start_frontend()
            time.sleep(1.5)
            self._poll_status_once()

        threading.Thread(target=job, daemon=True).start()

    def action_stop_all(self) -> None:
        def job() -> None:
            self.controller.stop_all()
            self._poll_status_once()

        threading.Thread(target=job, daemon=True).start()

    def action_start_backend(self) -> None:
        threading.Thread(target=self.controller.start_backend, daemon=True).start()

    def action_stop_backend(self) -> None:
        threading.Thread(target=self.controller.stop_backend, daemon=True).start()

    def action_start_frontend(self) -> None:
        threading.Thread(target=self.controller.start_frontend, daemon=True).start()

    def action_stop_frontend(self) -> None:
        threading.Thread(target=self.controller.stop_frontend, daemon=True).start()

    def action_full_self_heal(self) -> None:
        def job() -> None:
            self.controller.run_comprehensive_self_heal()
            self._poll_status_once()

        threading.Thread(target=job, daemon=True).start()

    def action_install_python_deps(self) -> None:
        threading.Thread(target=self.controller.install_python_libraries, daemon=True).start()

    def action_install_node_deps(self) -> None:
        threading.Thread(
            target=lambda: self.controller.install_node_modules(force=True),
            daemon=True,
        ).start()

    def action_free_ports(self) -> None:
        def job() -> None:
            _, m1 = self.controller.healer.heal_port(7860)
            _, m2 = self.controller.healer.heal_port(3000)
            self.controller.log(m1, "HEAL")
            self.controller.log(m2, "HEAL")
            self._poll_status_once()

        threading.Thread(target=job, daemon=True).start()

    def action_clean_next_locks(self) -> None:
        def job() -> None:
            _, msg = self.controller.healer.heal_nextjs_locks()
            self.controller.log(msg, "HEAL")

        threading.Thread(target=job, daemon=True).start()

    def action_toggle_mode(self) -> None:
        def job() -> None:
            self.controller.toggle_model_mode()
            self._poll_status_once()

        threading.Thread(target=job, daemon=True).start()

    def action_run_custom_cmd(self) -> None:
        cmd_str = self.cmd_input_var.get().strip()
        if not cmd_str:
            return
        self.cmd_input_var.set("")
        self.controller.log(f"$ {cmd_str}", "CMD")

        def job() -> None:
            self.controller._stream_command(cmd_str, cwd=ROOT_DIR, tag="CMD", shell=True)

        threading.Thread(target=job, daemon=True).start()

    def _on_close(self) -> None:
        ans = messagebox.askyesnocancel(
            "Tutup TEKSCAN Control Panel",
            "Apakah Anda juga ingin menghentikan server lokal (Backend & Frontend) sebelum keluar?\n\n"
            "• Pilih 'Yes' untuk mematikan semua server lokal & keluar.\n"
            "• Pilih 'No' untuk menutup panel saja (server tetap jalan di latar).\n"
            "• Pilih 'Cancel' untuk batal keluar.",
        )
        if ans is None:
            return
        self.is_closing = True
        if ans is True:
            self.controller.stop_all()
        self.root.destroy()


def run_gui_app() -> None:
    if not HAS_TK or tk is None:
        raise RuntimeError("Tkinter tidak tersedia di lingkungan Python ini.")
    root = tk.Tk()
    TekscanDesktopApp(root)
    root.mainloop()


# ============================================================================
# CLI FALLBACK MODE (--cli)
# ============================================================================
def run_cli_mode() -> None:
    ctrl = TekscanController()
    ctrl.run_comprehensive_self_heal()
    ctrl.start_backend()
    ctrl.start_frontend()
    print("\nTekan Ctrl+C untuk menghentikan semua layanan...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        ctrl.stop_all()


def main() -> None:
    if "--cli" in sys.argv or "--no-gui" in sys.argv:
        run_cli_mode()
        return

    try:
        run_gui_app()
    except Exception as exc:
        print(f"[WARN] Gagal membuka GUI ({exc}), beralih ke mode CLI...")
        run_cli_mode()


if __name__ == "__main__":
    main()

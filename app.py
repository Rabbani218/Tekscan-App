#!/usr/bin/env python3
"""TEKSCAN — Universal Runner & Self-Healing Control Panel.

Jalankan cukup dengan:
    python app.py

Fitur Utama:
1. Diagnosis & Pemulihan Mandiri Otomatis (Self-Healing) lintas platform (Windows/macOS/Linux).
2. Pemeriksaan & instalasi otomatis venv Python serta dependensi backend & node_modules.
3. Deteksi & pembebasan otomatis port yang terkunci (Port 7860 & Port 3000).
4. Penanganan otomatis model demo (dibuat otomatis jika model asli belum ada).
5. Inisialisasi basis data SQLite lokal offline untuk riwayat pemindaian.
6. Peluncuran bersamaan Backend (FastAPI) & Frontend (Next.js) dengan pemantauan kesehatan.
7. Pembukaan peramban web secara otomatis ke antarmuka aplikasi.
8. Menu kontrol interaktif di terminal dan penutupan bersih tanpa proses zombie.
"""

from __future__ import annotations

import os
import sys
import time
import socket
import shutil
import signal
import platform
import subprocess
import webbrowser
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
SCRIPTS_DIR = ROOT_DIR / "scripts"

# Warna Terminal ANSI
C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_GREEN = "\033[92m"
C_YELLOW = "\033[93m"
C_RED = "\033[91m"
C_CYAN = "\033[96m"
C_MAGENTA = "\033[95m"
C_GRAY = "\033[90m"


def print_banner():
    banner = f"""{C_CYAN}{C_BOLD}
 ========================================================================
   ████████╗███████╗██╗  ██╗███████╗ ██████╗ █████╗ ███╗   ██╗
   ╚══██╔══╝██╔════╝██║ ██╔╝██╔════╝██╔════╝██╔══██╗████╗  ██║
      ██║   █████╗  █████═╝ ███████╗██║     ███████║██╔██╗ ██║
      ██║   ██╔══╝  ██╔═██╗ ╚════██║██║     ██╔══██║██║╚██╗██║
      ██║   ███████╗██║ ╚██╗███████║╚██████╗██║  ██║██║ ╚████║
      ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝
             UNIVERSAL RUNNER & SELF-HEALING CONTROL PANEL
 ========================================================================{C_RESET}
    {C_GRAY}Sistem Operasi:{C_RESET} {platform.system()} {platform.release()} ({platform.machine()})
    {C_GRAY}Python Sistem :{C_RESET} {platform.python_version()}
    {C_GRAY}Lokasi Proyek :{C_RESET} {ROOT_DIR}
 ------------------------------------------------------------------------"""
    print(banner)


# ============================================================================
# SELF-HEALING ENGINE
# ============================================================================
class EnvironmentHealer:
    def __init__(self):
        self.os_type = platform.system()
        self.venv_dir = BACKEND_DIR / ".venv"
        if self.os_type == "Windows":
            self.venv_python = self.venv_dir / "Scripts" / "python.exe"
            self.venv_uvicorn = self.venv_dir / "Scripts" / "uvicorn.exe"
        else:
            self.venv_python = self.venv_dir / "bin" / "python"
            self.venv_uvicorn = self.venv_dir / "bin" / "uvicorn"

    def log(self, step: str, msg: str, status: str = "INFO"):
        tag = {
            "INFO": f"{C_CYAN}[INFO]{C_RESET}",
            "SUCCESS": f"{C_GREEN}[OK]{C_RESET}",
            "WARN": f"{C_YELLOW}[PERINGATAN]{C_RESET}",
            "ERROR": f"{C_RED}[GAGAL]{C_RESET}",
            "HEAL": f"{C_MAGENTA}[SELF-HEAL]{C_RESET}",
        }.get(status, f"[{status}]")
        print(f" {tag} {C_BOLD}{step}:{C_RESET} {msg}")

    def check_and_heal_env_files(self):
        """Pastikan .env.local ada."""
        env_local = ROOT_DIR / ".env.local"
        env_example = ROOT_DIR / ".env.example"
        if not env_local.exists():
            if env_example.exists():
                shutil.copy2(env_example, env_local)
                self.log("Konfigurasi", "Membuat berkas .env.local dari .env.example", "HEAL")
            else:
                env_local.write_text("NEXT_PUBLIC_API_URL=http://localhost:7860\n", encoding="utf-8")
                self.log("Konfigurasi", "Membuat berkas standar .env.local", "HEAL")
        else:
            self.log("Konfigurasi", ".env.local ditemukan.", "SUCCESS")

    def check_and_heal_python_venv(self) -> str:
        """Periksa virtual environment backend, buat dan pasang dependensi jika belum ada."""
        if not self.venv_python.exists():
            self.log("Virtualenv", "Virtualenv belum ditemukan di backend/.venv. Membuat venv baru...", "HEAL")
            subprocess.run([sys.executable, "-m", "venv", str(self.venv_dir)], check=True)
            self.log("Virtualenv", "Venv berhasil dibuat. Memasang paket dari requirements.txt...", "HEAL")
            req = BACKEND_DIR / "requirements.txt"
            subprocess.run([str(self.venv_python), "-m", "pip", "install", "--upgrade", "pip"], capture_output=True)
            subprocess.run([str(self.venv_python), "-m", "pip", "install", "-r", str(req)], check=True)
            self.log("Virtualenv", "Semua dependensi Python berhasil dipasang.", "SUCCESS")
        else:
            # Periksa apakah onnxruntime dan fastapi terpasang
            check_script = "import fastapi, uvicorn, onnxruntime, numpy, PIL"
            res = subprocess.run([str(self.venv_python), "-c", check_script], capture_output=True)
            if res.returncode != 0:
                self.log("Virtualenv", "Pustaka backend belum lengkap. Memasang ulang requirements.txt...", "HEAL")
                req = BACKEND_DIR / "requirements.txt"
                subprocess.run([str(self.venv_python), "-m", "pip", "install", "-r", str(req)], check=True)
                self.log("Virtualenv", "Pemasangan dependensi selesai.", "SUCCESS")
            else:
                self.log("Virtualenv", "Python virtual environment & pustaka lengkap.", "SUCCESS")

        return str(self.venv_python)

    def check_and_heal_demo_models(self):
        """Pastikan model tersedia (produksi asli YOLO11s atau demo)."""
        demo_yolo = BACKEND_DIR / "models_demo" / "tekscan_yolo_demo.onnx"
        real_yolo = BACKEND_DIR / "models" / "tekscan_yolo.onnx"
        alt_real = ROOT_DIR.parent / "model_dan_aplikasi" / "tekscan_yolo.onnx"

        if real_yolo.exists() or alt_real.exists():
            self.log("Model", "Model REAL produksi YOLO11s terdeteksi dan siap digunakan.", "SUCCESS")
        elif demo_yolo.exists():
            self.log("Model", "Model demo siap digunakan.", "SUCCESS")
        else:
            self.log("Model", "Model belum ditemukan. Menghasilkan model demo ONNX tiruan...", "HEAL")
            make_script = SCRIPTS_DIR / "make_demo_models.py"
            subprocess.run([str(self.venv_python), str(make_script)], check=True)
            self.log("Model", "Model demo berhasil digenerate di Model_demo/ dan backend/models_demo/.", "SUCCESS")

    def check_and_heal_node_environment(self) -> bool:
        """Periksa Node.js, npm, dan node_modules."""
        node_bin = shutil.which("node")
        npm_bin = shutil.which("npm")
        if not node_bin or not npm_bin:
            self.log("Frontend", "Node.js atau npm belum terpasang di PATH sistem laptop ini.", "WARN")
            return False

        node_modules = ROOT_DIR / "node_modules"
        if not node_modules.exists() or not (node_modules / "next").exists():
            self.log("Frontend", "node_modules belum lengkap. Menjalankan 'npm install'...", "HEAL")
            subprocess.run(["npm", "install"], cwd=str(ROOT_DIR), shell=True, check=True)
            self.log("Frontend", "Dependensi frontend (npm install) selesai.", "SUCCESS")
        else:
            self.log("Frontend", "Node.js & node_modules siap.", "SUCCESS")
        return True

    def is_port_busy(self, port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.3)
            return s.connect_ex(("127.0.0.1", port)) == 0

    def heal_port(self, port: int):
        """Bebaskan port jika dikuasai oleh proses tak terduga."""
        if not self.is_port_busy(port):
            return
        self.log("Port", f"Port {port} sedang terpakai. Menghentikan proses lama secara aman...", "HEAL")
        if self.os_type == "Windows":
            try:
                out = subprocess.run(["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True).stdout
                for line in out.splitlines():
                    if f":{port} " in line and "LISTENING" in line:
                        pid = line.strip().split()[-1]
                        if pid.isdigit() and int(pid) != os.getpid():
                            subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
            except Exception:
                pass
        else:
            try:
                subprocess.run(f"lsof -ti:{port} | xargs kill -9", shell=True, capture_output=True)
            except Exception:
                pass

        time.sleep(0.8)
        if not self.is_port_busy(port):
            self.log("Port", f"Port {port} berhasil dibebaskan.", "SUCCESS")
        else:
            self.log("Port", f"Port {port} masih terkunci. Sistem akan mencoba alternatif.", "WARN")


# ============================================================================
# MASTER PROCESS ORCHESTRATOR
# ============================================================================
class TekscanOrchestrator:
    def __init__(self):
        self.healer = EnvironmentHealer()
        self.backend_proc: Optional[subprocess.Popen] = None
        self.frontend_proc: Optional[subprocess.Popen] = None
        self.is_shutting_down = False

    def start_backend(self, py_exe: str, mode: str = "demo", port: int = 7860):
        self.healer.log("Layanan", f"Meluncurkan Backend FastAPI (MODEL_MODE={mode}) di port {port}...", "INFO")
        env = os.environ.copy()
        env["MODEL_MODE"] = mode
        env["PORT"] = str(port)

        cmd = [
            py_exe,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(port),
            "--app-dir",
            str(BACKEND_DIR),
        ]
        self.backend_proc = subprocess.Popen(cmd, cwd=str(BACKEND_DIR), env=env)

    def start_frontend(self, port: int = 3000):
        self.healer.log("Layanan", f"Meluncurkan Frontend Next.js di port {port}...", "INFO")
        cmd = ["npm", "run", "dev"]
        self.frontend_proc = subprocess.Popen(cmd, cwd=str(ROOT_DIR), shell=True)

    def wait_for_services(self, be_url: str = "http://127.0.0.1:7860/health", fe_url: str = "http://127.0.0.1:3000", max_wait: int = 25):
        print(f"\n {C_CYAN}Menunggu seluruh layanan siap...{C_RESET}")
        t0 = time.time()
        be_ready = False
        fe_ready = False

        while time.time() - t0 < max_wait:
            if not be_ready:
                try:
                    with urllib.request.urlopen(be_url, timeout=1) as res:
                        if res.status == 200:
                            be_ready = True
                            self.healer.log("Kesehatan", f"Backend online ({be_url})", "SUCCESS")
                except Exception:
                    pass

            if not fe_ready:
                try:
                    with urllib.request.urlopen(fe_url, timeout=1) as res:
                        if res.status == 200:
                            fe_ready = True
                            self.healer.log("Kesehatan", f"Frontend online ({fe_url})", "SUCCESS")
                except Exception:
                    pass

            if be_ready and fe_ready:
                break
            time.sleep(1.0)

    def stop_all(self):
        if self.is_shutting_down:
            return
        self.is_shutting_down = True
        print(f"\n\n {C_YELLOW}Mematikan seluruh layanan TEKSCAN secara bersih...{C_RESET}")

        if self.backend_proc:
            try:
                self.backend_proc.terminate()
                self.backend_proc.wait(timeout=3)
            except Exception:
                try:
                    self.backend_proc.kill()
                except Exception:
                    pass

        if self.frontend_proc:
            try:
                if platform.system() == "Windows":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.frontend_proc.pid)], capture_output=True)
                else:
                    self.frontend_proc.terminate()
            except Exception:
                pass

        # Pastikan port bersih
        self.healer.heal_port(7860)
        self.healer.heal_port(3000)
        print(f" {C_GREEN}Seluruh layanan berhasil dihentikan. Sampai jumpa!{C_RESET}\n")

    def run_interactive_dashboard(self):
        while not self.is_shutting_down:
            print(f"""
{C_BOLD}========================================================================{C_RESET}
{C_CYAN}{C_BOLD} [KONTROL PANEL PENGATURAN TEKSCAN]{C_RESET}
  Frontend App  : {C_GREEN}http://localhost:3000{C_RESET}
  Backend API   : {C_GREEN}http://localhost:7860{C_RESET}
  Swagger Docs  : {C_GREEN}http://localhost:7860/docs{C_RESET}
  System Status : {C_GREEN}http://localhost:7860/system/status{C_RESET}
------------------------------------------------------------------------
 {C_BOLD}[1]{C_RESET} Status Sistem & Diagnosa   {C_BOLD}[2]{C_RESET} Jalankan Self-Healing Lagi
 {C_BOLD}[3]{C_RESET} Buka Browser Web          {C_BOLD}[4]{C_RESET} Bebaskan Port Manual
 {C_BOLD}[5]{C_RESET} Ganti Mode (Demo/Real)     {C_BOLD}[q]{C_RESET} Berhenti & Matikan Semua
========================================================================""")
            try:
                choice = input(f" {C_BOLD}Pilih opsi (1-5/q): {C_RESET}").strip().lower()
            except (EOFError, KeyboardInterrupt):
                break

            if choice == "q":
                break
            elif choice == "1":
                self.show_system_diagnostics()
            elif choice == "2":
                self.run_manual_self_heal()
            elif choice == "3":
                webbrowser.open("http://localhost:3000")
            elif choice == "4":
                self.healer.heal_port(7860)
                self.healer.heal_port(3000)
            elif choice == "5":
                self.toggle_mode()
            else:
                print(f" {C_YELLOW}Pilihan tidak dikenali.{C_RESET}")

    def show_system_diagnostics(self):
        try:
            with urllib.request.urlopen("http://127.0.0.1:7860/system/status", timeout=2) as r:
                import json
                data = json.loads(r.read().decode("utf-8"))
                diag = data.get("diagnostics", {})
                res = diag.get("resources", {})
                print(f"\n{C_CYAN}--- STATUS DIAGNOSIS SISTEM REALTIME ---{C_RESET}")
                print(f"  Status Keseluruhan : {C_GREEN}{diag.get('status', 'OK').upper()}{C_RESET}")
                print(f"  Mode Model Aktif   : {data.get('model_mode')}")
                print(f"  Uptime Backend     : {data.get('uptime_seconds')} detik")
                print(f"  Penggunaan CPU     : {res.get('cpu_percent')}%")
                print(f"  Penggunaan RAM     : {res.get('ram_percent')}% (Total: {res.get('ram_total_gb')} GB)")
                print(f"  ONNX Providers     : {diag.get('onnx', {}).get('providers')}")
                print(f"  Database Lokal     : {diag.get('database', {}).get('sqlite_local')}")
        except Exception as exc:
            print(f" {C_RED}Gagal menghubungi endpoint status: {exc}{C_RESET}")

    def run_manual_self_heal(self):
        try:
            req = urllib.request.Request("http://127.0.0.1:7860/system/heal", method="POST", data=b"{}")
            with urllib.request.urlopen(req, timeout=10) as r:
                import json
                res = json.loads(r.read().decode("utf-8"))
                print(f"\n{C_GREEN}✓ Self-Healing berhasil dieksekusi.{C_RESET}")
                for log_msg in res.get("self_healing", {}).get("logs", []):
                    print(f"  * {log_msg}")
        except Exception as exc:
            print(f" {C_RED}Gagal menjalankan self-healing: {exc}{C_RESET}")

    def toggle_mode(self):
        cur_mode = "demo"
        try:
            with urllib.request.urlopen("http://127.0.0.1:7860/health", timeout=2) as r:
                import json
                d = json.loads(r.read().decode("utf-8"))
                cur_mode = d.get("model_mode", "demo")
        except Exception:
            pass

        target = "real" if cur_mode == "demo" else "demo"
        print(f" Mengubah mode dari {cur_mode} ke {target}...")
        try:
            import json
            req = urllib.request.Request(
                "http://127.0.0.1:7860/system/config",
                data=json.dumps({"model_mode": target}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                print(f" {C_GREEN}✓ Mode berhasil diubah ke: {target.upper()}{C_RESET}")
        except Exception as exc:
            print(f" {C_RED}Gagal mengubah mode: {exc}{C_RESET}")


def main():
    print_banner()
    orchestrator = TekscanOrchestrator()

    # Daftarkan penanganan sinyal terminasi
    def signal_handler(sig, frame):
        orchestrator.stop_all()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print(f"\n{C_BOLD}[FASE 1/3] DIAGNOSIS DAN PEMULIHAN MANDIRI (SELF-HEALING)...{C_RESET}")
    orchestrator.healer.check_and_heal_env_files()
    py_exe = orchestrator.healer.check_and_heal_python_venv()
    orchestrator.healer.check_and_heal_demo_models()
    has_node = orchestrator.healer.check_and_heal_node_environment()
    orchestrator.healer.heal_port(7860)
    orchestrator.healer.heal_port(3000)

    print(f"\n{C_BOLD}[FASE 2/3] MELUNCURKAN LAYANAN TEKSCAN...{C_RESET}")
    # Periksa mode model default
    real_models_ready = (BACKEND_DIR / "models" / "tekscan_yolo.onnx").exists()
    default_mode = "real" if real_models_ready else "demo"
    orchestrator.start_backend(py_exe, mode=default_mode, port=7860)

    if has_node:
        orchestrator.start_frontend(port=3000)
        orchestrator.wait_for_services()
    else:
        orchestrator.healer.log("Layanan", "Menjalankan mode backend saja karena Node.js tidak tersedia.", "WARN")
        orchestrator.wait_for_services(fe_url="http://127.0.0.1:7860/docs")

    print(f"\n{C_BOLD}[FASE 3/3] MEMBUKA PERAMBAN WEB...{C_RESET}")
    target_url = "http://localhost:3000" if has_node else "http://localhost:7860/docs"
    try:
        webbrowser.open(target_url)
    except Exception:
        pass

    try:
        orchestrator.run_interactive_dashboard()
    finally:
        orchestrator.stop_all()


if __name__ == "__main__":
    main()

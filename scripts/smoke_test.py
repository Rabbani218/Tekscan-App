"""Smoke test untuk memverifikasi ketersediaan dan fungsionalitas Backend dan Frontend TEKSCAN.

Aturan Pengaman Produksi:
- GAGAL jika backend yang diuji melaporkan demo=true / model_mode='demo'
  KECUALI dipanggil secara eksplisit dengan argumen --izinkan-demo.
"""

import argparse
import io
import sys
import urllib.request
import urllib.error
import json
from PIL import Image


def check_frontend(frontend_url: str) -> bool:
    print(f"\n[1/3] Menguji Frontend: {frontend_url} ...")
    try:
        req = urllib.request.Request(
            frontend_url,
            headers={"User-Agent": "TEKSCAN-SmokeTest/1.0"}
        )
        with urllib.request.urlopen(req, timeout=15) as res:
            status = res.status
            content = res.read().decode("utf-8", errors="ignore")
            if status == 200 and "TEKSCAN" in content:
                print(f"      -> HTTP {status}: Frontend berhasil diakses dan memuat judul TEKSCAN. [LULUS]")
                return True
            else:
                print(f"      -> HTTP {status}: Konten tidak memuat penanda TEKSCAN. [GAGAL]")
                return False
    except Exception as exc:
        print(f"      -> Gagal mengakses frontend: {exc} [GAGAL]")
        return False


def check_backend_health(backend_url: str, izinkan_demo: bool = False) -> bool:
    health_url = f"{backend_url.rstrip('/')}/health"
    print(f"\n[2/3] Menguji Backend Health: {health_url} ...")
    try:
        req = urllib.request.Request(
            health_url,
            headers={"User-Agent": "TEKSCAN-SmokeTest/1.0"}
        )
        with urllib.request.urlopen(req, timeout=20) as res:
            status = res.status
            data = json.loads(res.read().decode("utf-8"))
            if status == 200 and data.get("status") == "ok":
                is_demo = bool(data.get("demo")) or data.get("model_mode") == "demo"
                if is_demo:
                    if not izinkan_demo:
                        print("      -> [GAGAL] Backend berjalan dalam MODE DEMO! Mode produksi menolak demo tanpa flag --izinkan-demo.")
                        return False
                    else:
                        print("      -> [PERINGATAN] Backend berjalan dalam MODE DEMO (--izinkan-demo aktif). [LULUS BERSYARAT]")
                else:
                    print("      -> HTTP 200 OK: Mode REAL aktif. [LULUS]")

                models = data.get("models", {})
                print(f"         Models={models}, load_time={data.get('load_time_ms')}ms")
                return True
            else:
                print(f"      -> HTTP {status}: Respons {data} [GAGAL]")
                return False
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="ignore")
        print(f"      -> HTTP {err.code}: {body} [GAGAL]")
        return False
    except Exception as exc:
        print(f"      -> Gagal mengakses backend /health: {exc} [GAGAL]")
        return False


def check_backend_predict(backend_url: str, izinkan_demo: bool = False) -> bool:
    predict_url = f"{backend_url.rstrip('/')}/predict?model=yolo"
    print(f"\n[3/3] Menguji Backend Predict: {predict_url} ...")
    try:
        img = Image.new("RGB", (100, 100), color=(180, 180, 180))
        img_bytes = io.BytesIO()
        img.save(img_bytes, format="JPEG")
        raw_data = img_bytes.getvalue()

        boundary = "----TekscanBoundary7MA4YWxkTrZu0gW"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="sample.jpg"\r\n'
            f"Content-Type: image/jpeg\r\n\r\n"
        ).encode("utf-8") + raw_data + f"\r\n--{boundary}--\r\n".encode("utf-8")

        req = urllib.request.Request(
            predict_url,
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "User-Agent": "TEKSCAN-SmokeTest/1.0",
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as res:
            status = res.status
            data = json.loads(res.read().decode("utf-8"))
            if status == 200 and "status" in data:
                is_demo = bool(data.get("demo")) or data.get("model_mode") == "demo"
                if is_demo and not izinkan_demo:
                    print(f"      -> [GAGAL] Prediksi mengembalikan demo={is_demo} tanpa --izinkan-demo.")
                    return False
                print(f"      -> HTTP 200 OK: Prediksi sukses. Status='{data.get('status')}', Latency={data.get('latency_ms')}ms [LULUS]")
                return True
            else:
                print(f"      -> HTTP {status}: {data} [GAGAL]")
                return False
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="ignore")
        print(f"      -> HTTP {err.code}: {body} [GAGAL]")
        return False
    except Exception as exc:
        print(f"      -> Gagal melakukan inferensi POST /predict: {exc} [GAGAL]")
        return False


def main():
    parser = argparse.ArgumentParser(description="Smoke test TEKSCAN Backend & Frontend")
    parser.add_argument("--backend-url", default="http://localhost:7860", help="URL root Backend API")
    parser.add_argument("--frontend-url", default="http://localhost:3000", help="URL root Frontend Web")
    parser.add_argument("--izinkan-demo", action="store_true", help="Izinkan jika backend berjalan dalam mode demo")
    args = parser.parse_args()

    print("========================================")
    print("      TEKSCAN SMOKE TEST SUITE          ")
    print("========================================")

    fe_ok = check_frontend(args.frontend_url)
    be_health_ok = check_backend_health(args.backend_url, izinkan_demo=args.izinkan_demo)
    be_predict_ok = check_backend_predict(args.backend_url, izinkan_demo=args.izinkan_demo)

    print("\n----------------------------------------")
    print("RINGKASAN HASIL SMOKE TEST:")
    print(f"  Frontend ({args.frontend_url}): {'LULUS' if fe_ok else 'GAGAL'}")
    print(f"  Backend Health ({args.backend_url}/health): {'LULUS' if be_health_ok else 'GAGAL'}")
    print(f"  Backend Predict ({args.backend_url}/predict): {'LULUS' if be_predict_ok else 'GAGAL'}")
    print("----------------------------------------")

    if fe_ok and be_health_ok and be_predict_ok:
        print("STATUS KESELURUHAN: SEMUA PENGUJIAN LULUS")
        sys.exit(0)
    else:
        print("STATUS KESELURUHAN: ADA PENGUJIAN GAGAL")
        sys.exit(1)


if __name__ == "__main__":
    main()

/**
 * Klien backend TEKSCAN (FastAPI di Hugging Face Spaces / lokal).
 * Dipanggil LANGSUNG dari browser — bukan lewat fungsi Vercel.
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:7860").replace(/\/+$/, "");

export type ModelChoice = "yolo" | "resnet" | "both";

export const STATUS_CLEAN = "TIDAK ADA CACAT";
export const STATUS_VERIFY = "PERLU VERIFIKASI MANUAL";
export const STATUS_DEFECT = "CACAT TERDETEKSI";
export type ScanStatus = typeof STATUS_CLEAN | typeof STATUS_VERIFY | typeof STATUS_DEFECT;

export interface Detection {
  class: string;
  label_id?: string;
  class_id: number;
  score: number;
  /** [x1, y1, x2, y2] dalam piksel gambar yang dikirim */
  box: [number, number, number, number];
}

export interface Classification {
  top1: string;
  top1_id: number;
  top1_score: number;
  probs: Record<string, number>;
}

export type DemoCase = "defect" | "uncertain" | "clean";

export interface PredictResponse {
  demo?: boolean;
  model_mode?: "real" | "demo";
  status: ScanStatus;
  statuses: Partial<Record<"yolo" | "resnet", ScanStatus>>;
  model: ModelChoice;
  detections: Detection[];
  classification: Classification | null;
  latency_ms: number;
  image: { w: number; h: number };
  annotated_image_base64: string | null;
}

export interface HealthResponse {
  status: "ok";
  model_mode?: "real" | "demo";
  demo?: boolean;
  models: {
    yolo: string | null;
    yolo_size_bytes?: number | null;
    resnet: string | null;
    resnet_size_bytes?: number | null;
  };
  thresholds?: {
    conf_threshold: number;
    iou_threshold: number;
    verify_threshold: number;
    defect_threshold: number;
  };
  load_time_ms: number;
  classes: { yolo: string[]; resnet50: string[] };
  indonesian_map?: Record<string, string>;
}

export type ApiErrorKind = "cold_start" | "network" | "invalid_file" | "server";

export class ApiError extends Error {
  constructor(public kind: ApiErrorKind, message: string, public httpStatus?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.9;
const RETRIES = 3;
const RETRY_DELAY_MS = 5000;

/** Status HTTP yang menandakan Space sedang bangun/tidur (cold start). */
const COLD_START_CODES = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Kecilkan gambar: sisi panjang maks 1280 px, JPEG kualitas 0.9. */
export async function shrinkImage(source: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    throw new ApiError("invalid_file", "Berkas tidak dapat dibaca sebagai gambar.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiError("invalid_file", "Browser tidak mendukung canvas 2D.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new ApiError("invalid_file", "Gagal mengonversi gambar ke JPEG.");
  return blob;
}

export function validateFile(file: File): void {
  const type =
    file.type ||
    (/\.(jpe?g)$/i.test(file.name)
      ? "image/jpeg"
      : /\.png$/i.test(file.name)
        ? "image/png"
        : /\.webp$/i.test(file.name)
          ? "image/webp"
          : "");
  if (!ACCEPTED_TYPES.includes(type)) {
    throw new ApiError("invalid_file", `Tipe berkas "${file.type || "tidak diketahui"}" tidak didukung. Gunakan JPG, PNG, atau WEBP.`);
  }
  if (file.size > MAX_UPLOAD_BYTES * 4) {
    // dikecilkan di klien; batas longgar untuk berkas asli yang sangat besar
    throw new ApiError("invalid_file", "Berkas terlalu besar (maks 32 MB sebelum dikecilkan).");
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return typeof j?.error === "string" ? j.error : JSON.stringify(j);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

/**
 * fetch dengan penanganan cold start: 502/503/504 atau gagal jaringan -> ulang 3x tiap 5 detik.
 * onWaiting dipanggil sebelum tiap percobaan ulang (untuk pesan "Menyiapkan server").
 */
async function fetchWithWake(
  input: string,
  init: RequestInit,
  onWaiting?: (attempt: number, total: number) => void,
): Promise<Response> {
  let lastKind: ApiErrorKind = "network";
  let lastMsg = "";
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      onWaiting?.(attempt, RETRIES);
      await sleep(RETRY_DELAY_MS);
    }
    let res: Response;
    try {
      res = await fetch(input, init);
    } catch {
      lastKind = "network";
      lastMsg = `Tidak dapat terhubung ke server ${API_URL}. Periksa koneksi internet, NEXT_PUBLIC_API_URL, dan ALLOWED_ORIGINS (CORS) di backend.`;
      continue;
    }
    if (COLD_START_CODES.has(res.status)) {
      lastKind = "cold_start";
      lastMsg = `Server belum siap (HTTP ${res.status}): ${await readError(res)}`;
      continue;
    }
    return res;
  }
  throw new ApiError(lastKind, lastMsg);
}

export async function health(onWaiting?: (attempt: number, total: number) => void): Promise<HealthResponse> {
  const res = await fetchWithWake(`${API_URL}/health`, { method: "GET", cache: "no-store" }, onWaiting);
  if (!res.ok) throw new ApiError("server", await readError(res), res.status);
  return res.json();
}

export async function predict(
  file: Blob,
  model: ModelChoice = "yolo",
  opts: {
    onWaiting?: (attempt: number, total: number) => void;
    shrink?: boolean;
    signal?: AbortSignal;
    demoCase?: DemoCase;
    confThreshold?: number;
    iouThreshold?: number;
  } = {},
): Promise<PredictResponse> {
  const body = opts.shrink === false ? file : await shrinkImage(file);
  if (body.size > MAX_UPLOAD_BYTES) throw new ApiError("invalid_file", "Gambar lebih dari 8 MB setelah dikecilkan.");
  const form = new FormData();
  form.append("file", body, "upload.jpg");
  const params = new URLSearchParams({ model });
  if (opts.demoCase) params.set("demo_case", opts.demoCase);
  if (typeof opts.confThreshold === "number") params.set("conf_threshold", String(opts.confThreshold));
  if (typeof opts.iouThreshold === "number") params.set("iou_threshold", String(opts.iouThreshold));
  const res = await fetchWithWake(
    `${API_URL}/predict?${params.toString()}`,
    { method: "POST", body: form, signal: opts.signal },
    opts.onWaiting,
  );
  if (res.status === 400 || res.status === 413 || res.status === 415 || res.status === 422) {
    throw new ApiError("invalid_file", await readError(res), res.status);
  }
  if (!res.ok) throw new ApiError("server", await readError(res), res.status);
  return res.json();
}

/** Pemulusan kamera/video: status yang muncul >= 3 kali dari 5 bingkai terakhir; selain itu verifikasi manual. */
export function smoothStatus(history: ScanStatus[], window = 5, need = 3): ScanStatus | null {
  const last = history.slice(-window);
  if (last.length < need) return null;
  const counts = new Map<ScanStatus, number>();
  for (const s of last) counts.set(s, (counts.get(s) ?? 0) + 1);
  for (const s of [STATUS_DEFECT, STATUS_CLEAN, STATUS_VERIFY] as ScanStatus[]) {
    if ((counts.get(s) ?? 0) >= need) return s;
  }
  return STATUS_VERIFY;
}

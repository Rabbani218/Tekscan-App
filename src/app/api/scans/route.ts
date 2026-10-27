import { connection } from "next/server";
import { getPool, isDbConfigured, type ScanRow } from "@/lib/db";
import { API_URL } from "@/lib/api";

const STATUSES = new Set(["TIDAK ADA CACAT", "PERLU VERIFIKASI MANUAL", "CACAT TERDETEKSI"]);
const MODELS = new Set(["yolo", "resnet", "both"]);
const SOURCES = new Set(["upload", "camera"]);

function notConfigured() {
  return Response.json({ error: "Database tidak dikonfigurasi (DATABASE_URL belum diset dan local fallback tidak aktif)." }, { status: 503 });
}

/** GET /api/scans?limit=20 — riwayat pemindaian terbaru dengan self-healing local fallback. */
export async function GET(request: Request) {
  await connection();
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 20));

  if (!isDbConfigured()) {
    // Self-healing: Fallback otomatis ke SQLite lokal di backend
    try {
      const res = await fetch(`${API_URL}/api/scans/local?limit=${limit}`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        return Response.json({ scans: j.scans || [], storage: "sqlite_local" });
      }
    } catch {
      // Abaikan jika backend belum siap
    }
    return notConfigured();
  }

  try {
    const { rows } = await getPool().query<ScanRow>(
      `SELECT id, created_at, source, model, status, detections, classification, latency_ms, image_w, image_h, file_name, COALESCE(is_demo, false) AS is_demo
         FROM scans ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return Response.json({ scans: rows, storage: "postgres" });
  } catch (err) {
    console.error("GET /api/scans postgres error:", err);
    // Fallback ke local SQLite jika Postgres query gagal
    try {
      const res = await fetch(`${API_URL}/api/scans/local?limit=${limit}`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        return Response.json({ scans: j.scans || [], storage: "sqlite_local" });
      }
    } catch {}
    return Response.json({ error: "Gagal membaca database." }, { status: 500 });
  }
}

/** POST /api/scans — simpan ringkasan hasil /predict (dengan local fallback saat Postgres offline). */
export async function POST(request: Request) {
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400 });
  }
  const image = b.image as { w?: unknown; h?: unknown } | undefined;
  if (
    !STATUSES.has(String(b.status)) ||
    !MODELS.has(String(b.model)) ||
    !SOURCES.has(String(b.source)) ||
    !Array.isArray(b.detections) ||
    typeof b.latency_ms !== "number" ||
    !Number.isInteger(image?.w) ||
    !Number.isInteger(image?.h)
  ) {
    return Response.json({ error: "Data pemindaian tidak valid." }, { status: 400 });
  }
  const fileName = typeof b.file_name === "string" ? b.file_name.slice(0, 255) : null;
  const isDemo = Boolean(b.is_demo);

  if (!isDbConfigured()) {
    // Self-healing: Simpan ke basis data SQLite lokal di backend
    try {
      const res = await fetch(`${API_URL}/api/scans/local`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      if (res.ok) {
        const j = await res.json();
        return Response.json({ id: String(j.id), created_at: new Date().toISOString(), storage: "sqlite_local" }, { status: 201 });
      }
    } catch {}
    return notConfigured();
  }

  try {
    const { rows } = await getPool().query<{ id: string; created_at: string }>(
      `INSERT INTO scans (source, model, status, detections, classification, latency_ms, image_w, image_h, file_name, is_demo)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10) RETURNING id, created_at`,
      [
        b.source,
        b.model,
        b.status,
        JSON.stringify(b.detections),
        b.classification == null ? null : JSON.stringify(b.classification),
        b.latency_ms,
        image!.w,
        image!.h,
        fileName,
        isDemo,
      ],
    );
    return Response.json({ ...rows[0], storage: "postgres" }, { status: 201 });
  } catch (err) {
    console.error("POST /api/scans postgres error, trying local fallback:", err);
    try {
      const res = await fetch(`${API_URL}/api/scans/local`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      if (res.ok) {
        const j = await res.json();
        return Response.json({ id: String(j.id), created_at: new Date().toISOString(), storage: "sqlite_local" }, { status: 201 });
      }
    } catch {}
    return Response.json({ error: "Gagal menyimpan ke database." }, { status: 500 });
  }
}

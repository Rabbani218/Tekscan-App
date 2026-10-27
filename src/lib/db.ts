/**
 * Akses PostgreSQL — HANYA sisi server (Route Handler). Jangan impor dari komponen klien.
 * Kredensial hanya dari env DATABASE_URL.
 */
import { Pool } from "pg";

const globalForPg = globalThis as unknown as { __tekscanPool?: Pool };

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (typeof window !== "undefined") {
    throw new Error("db.ts tidak boleh dipakai di browser.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL tidak diset.");
  }
  if (!globalForPg.__tekscanPool) {
    globalForPg.__tekscanPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
    });
  }
  return globalForPg.__tekscanPool;
}

export interface ScanRow {
  id: string;
  created_at: string;
  source: "upload" | "camera";
  model: "yolo" | "resnet" | "both";
  status: string;
  detections: unknown;
  classification: unknown;
  latency_ms: number;
  image_w: number;
  image_h: number;
  file_name: string | null;
  is_demo?: boolean;
}

-- 001_create_scans.sql — riwayat pemindaian TEKSCAN (PostgreSQL)
-- Kelas cacat disimpan di JSONB, sehingga mengganti/menambah kelas model
-- TIDAK memerlukan perubahan skema.
CREATE TABLE IF NOT EXISTS scans (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source          TEXT        NOT NULL CHECK (source IN ('upload', 'camera')),
  model           TEXT        NOT NULL CHECK (model IN ('yolo', 'resnet', 'both')),
  status          TEXT        NOT NULL CHECK (status IN ('TIDAK ADA CACAT', 'PERLU VERIFIKASI MANUAL', 'CACAT TERDETEKSI')),
  detections      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  classification  JSONB,
  latency_ms      REAL        NOT NULL,
  image_w         INTEGER     NOT NULL,
  image_h         INTEGER     NOT NULL,
  file_name       TEXT
);

CREATE INDEX IF NOT EXISTS scans_created_at_idx ON scans (created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

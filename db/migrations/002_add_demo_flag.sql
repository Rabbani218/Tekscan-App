-- 002_add_demo_flag.sql — menambahkan kolom penanda pemindaian mode demo
ALTER TABLE scans ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

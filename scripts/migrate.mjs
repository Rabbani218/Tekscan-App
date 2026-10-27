// Menjalankan migrasi SQL di db/migrations secara berurutan (sekali per berkas).
// Pemakaian: npm run db:migrate   (membaca DATABASE_URL dari env atau .env.local)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL tidak diset. Isi di .env.local atau variabel lingkungan.");
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [f]);
    if (done.rowCount) {
      console.log(`lewati  ${f}`);
      continue;
    }
    const sql = await readFile(path.join(dir, f), "utf8");
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
    await client.query("COMMIT");
    console.log(`terap   ${f}`);
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migrasi gagal:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

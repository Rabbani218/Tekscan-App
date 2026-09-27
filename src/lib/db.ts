import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getDbPool(): mysql.Pool {
  if (!pool) {
    const host = process.env.AIVEN_MYSQL_HOST || 'mysql-1ddc11e8-rabbani-418f.g.aivencloud.com';
    const port = Number(process.env.AIVEN_MYSQL_PORT || '17900');
    const user = process.env.AIVEN_MYSQL_USER || 'avnadmin';
    const password = process.env.AIVEN_MYSQL_PASSWORD || '';
    const database = process.env.AIVEN_MYSQL_DATABASE || 'defaultdb';

    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      ssl: {
        rejectUnauthorized: false,
      },
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 8000,
    });
  }
  return pool;
}

export async function initDbTable() {
  try {
    if (!process.env.AIVEN_MYSQL_PASSWORD && !process.env.DATABASE_URL) {
      return false;
    }
    const p = getDbPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS qc_inspections (
        id VARCHAR(64) PRIMARY KEY,
        batch_id VARCHAR(64),
        file_name VARCHAR(255),
        defect_class VARCHAR(64),
        defect_label VARCHAR(64),
        confidence FLOAT,
        status VARCHAR(32),
        inspector_name VARCHAR(128),
        astm_points INT DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (err) {
    console.warn('[TEKSCAN DB] Could not initialize Aiven MySQL table:', err);
    return false;
  }
}

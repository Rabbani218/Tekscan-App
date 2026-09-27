import { NextResponse } from 'next/server';
import { getDbPool, initDbTable } from '@/lib/db';

export async function GET() {
  try {
    await initDbTable();
    const pool = getDbPool();
    const [rows] = await pool.query(
      'SELECT * FROM qc_inspections ORDER BY created_at DESC LIMIT 50'
    );
    return NextResponse.json({ success: true, data: rows, source: 'aiven_mysql' });
  } catch (err) {
    console.warn('[API /api/inspections] MySQL unavailable, returning fallback flag:', err);
    return NextResponse.json({
      success: false,
      error: 'Aiven MySQL unreachable, using client offline storage',
      fallback: true,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      id = `qc_${Date.now()}`,
      batch_id = 'BATCH-2026-A1',
      file_name = 'sample.jpg',
      defect_class = 'defect_free',
      defect_label = 'Bebas Cacat',
      confidence = 0.95,
      status = 'PASSED',
      inspector_name = 'Petugas QC',
      astm_points = 0,
      notes = '',
    } = body;

    await initDbTable();
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO qc_inspections (id, batch_id, file_name, defect_class, defect_label, confidence, status, inspector_name, astm_points, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE confidence = VALUES(confidence), status = VALUES(status)`,
      [
        id,
        batch_id,
        file_name,
        defect_class,
        defect_label,
        confidence,
        status,
        inspector_name,
        astm_points,
        notes,
      ]
    );

    return NextResponse.json({ success: true, message: 'Record saved to Aiven MySQL' });
  } catch (err) {
    console.warn('[API /api/inspections POST] Could not save to MySQL:', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      fallback: true,
    });
  }
}

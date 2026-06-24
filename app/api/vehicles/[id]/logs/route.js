import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();
  const { performed_at, service_type, odometer, cost, notes, photo_urls, performed_by_id } = body;

  if (!notes || !notes.trim()) {
    return NextResponse.json({ error: 'Describe the work done (notes are required).' }, { status: 400 });
  }

  const odo = odometer === '' || odometer === null || odometer === undefined ? null : parseInt(odometer);

  const result = await db.execute({
    sql: `INSERT INTO vehicle_service_logs
            (vehicle_id, performed_by_id, performed_at, service_type, odometer, cost, notes, photo_urls)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      performed_by_id || null,
      performed_at || new Date().toISOString().slice(0, 10),
      service_type || '',
      Number.isInteger(odo) ? odo : null,
      parseFloat(cost) || 0,
      notes.trim(),
      JSON.stringify(Array.isArray(photo_urls) ? photo_urls : []),
    ],
  });

  // Keep the vehicle's odometer current if this service logged a higher reading.
  if (Number.isInteger(odo)) {
    await db.execute({
      sql: "UPDATE vehicles SET odometer = MAX(COALESCE(odometer, 0), ?), updated_at = datetime('now') WHERE id = ?",
      args: [odo, id],
    });
  } else {
    await db.execute({ sql: "UPDATE vehicles SET updated_at = datetime('now') WHERE id = ?", args: [id] });
  }

  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { matchesReminder } from '@/lib/reminderMatch';

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

  // Auto-advance any active maintenance reminders matched by this log.
  try {
    const rems = (await db.execute({
      sql: 'SELECT id, label FROM vehicle_reminders WHERE vehicle_id = ? AND active = 1',
      args: [id],
    })).rows;

    if (rems.length) {
      const matchText = `${service_type || ''} ${notes || ''}`;

      let doneOdo;
      if (Number.isInteger(odo)) {
        doneOdo = odo;
      } else {
        const vrow = (await db.execute({ sql: 'SELECT odometer FROM vehicles WHERE id = ?', args: [id] })).rows[0];
        doneOdo = vrow ? vrow.odometer : null;
      }

      const doneDate = performed_at || new Date().toISOString().slice(0, 10);

      for (const rem of rems) {
        if (matchesReminder(matchText, rem.label)) {
          await db.execute({
            sql: 'UPDATE vehicle_reminders SET last_done_date = ?, last_done_odometer = ? WHERE id = ?',
            args: [doneDate, doneOdo, rem.id],
          });
        }
      }
    }
  } catch (err) {
    console.error('vehicle reminder auto-advance failed', err);
  }

  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}

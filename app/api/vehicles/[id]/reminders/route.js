import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const rows = (
    await db.execute({
      sql: 'SELECT * FROM vehicle_reminders WHERE vehicle_id = ? AND active = 1 ORDER BY created_at ASC',
      args: [id],
    })
  ).rows;
  return NextResponse.json(rows);
}

// POST a single reminder, or { reminders: [...] } to add several at once.
export async function POST(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();
  const items = Array.isArray(body.reminders) ? body.reminders : [body];

  const veh = (await db.execute({ sql: 'SELECT odometer FROM vehicles WHERE id = ?', args: [id] })).rows[0];
  const baseOdo = veh ? Number(veh.odometer) || 0 : 0;
  const today = new Date().toISOString().slice(0, 10);

  let created = 0;
  for (const it of items) {
    const label = (it.label || '').trim();
    if (!label) continue;
    const im = parseInt(it.interval_miles) > 0 ? parseInt(it.interval_miles) : null;
    const imo = parseInt(it.interval_months) > 0 ? parseInt(it.interval_months) : null;
    const ldd = it.last_done_date || today;
    const ldo =
      it.last_done_odometer !== undefined && it.last_done_odometer !== null && it.last_done_odometer !== ''
        ? parseInt(it.last_done_odometer)
        : baseOdo;
    await db.execute({
      sql: `INSERT INTO vehicle_reminders
              (vehicle_id, label, interval_miles, interval_months, last_done_date, last_done_odometer, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, label, im, imo, ldd, Number.isInteger(ldo) ? ldo : baseOdo, it.notes || ''],
    });
    created += 1;
  }
  return NextResponse.json({ success: true, created });
}

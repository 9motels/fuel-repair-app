import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const rows = (
    await db.execute({
      sql: 'SELECT * FROM equipment_reminders WHERE equipment_id = ? AND active = 1 ORDER BY created_at ASC',
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
  const today = new Date().toISOString().slice(0, 10);

  let created = 0;
  for (const it of items) {
    const label = (it.label || '').trim();
    if (!label) continue;
    const imo = parseInt(it.interval_months) > 0 ? parseInt(it.interval_months) : null;
    const ldd = it.last_done_date || today;
    await db.execute({
      sql: `INSERT INTO equipment_reminders (equipment_id, label, interval_months, last_done_date, notes)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, label, imo, ldd, it.notes || ''],
    });
    created += 1;
  }
  return NextResponse.json({ success: true, created });
}

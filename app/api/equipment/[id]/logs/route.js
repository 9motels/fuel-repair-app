import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { matchesReminder } from '@/lib/reminderMatch';

export async function POST(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();
  const { performed_at, work_type, notes, photo_urls, performed_by_id } = body;

  if (!notes || !notes.trim()) {
    return NextResponse.json({ error: 'Describe the work done (notes are required).' }, { status: 400 });
  }

  const result = await db.execute({
    sql: `INSERT INTO maintenance_logs
            (equipment_id, performed_by_id, performed_at, work_type, notes, photo_urls)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      performed_by_id || null,
      performed_at || new Date().toISOString().slice(0, 10),
      work_type || '',
      notes.trim(),
      JSON.stringify(Array.isArray(photo_urls) ? photo_urls : []),
    ],
  });
  // Touch the parent so "last serviced" stays meaningful.
  await db.execute({ sql: "UPDATE equipment SET updated_at = datetime('now') WHERE id = ?", args: [id] });

  // Auto-advance any active maintenance reminders matched by this log.
  try {
    const rems = (await db.execute({
      sql: 'SELECT id, label FROM equipment_reminders WHERE equipment_id = ? AND active = 1',
      args: [id],
    })).rows;

    if (rems.length) {
      const matchText = `${work_type || ''} ${notes || ''}`;
      const doneDate = performed_at || new Date().toISOString().slice(0, 10);

      for (const rem of rems) {
        if (matchesReminder(matchText, rem.label)) {
          await db.execute({
            sql: 'UPDATE equipment_reminders SET last_done_date = ? WHERE id = ?',
            args: [doneDate, rem.id],
          });
        }
      }
    }
  } catch (err) {
    console.error('equipment reminder auto-advance failed', err);
  }

  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}

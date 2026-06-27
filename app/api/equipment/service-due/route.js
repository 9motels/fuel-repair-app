import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// All active reminders for active equipment, with the equipment context the
// client needs to compute due-status + a display title.
export async function GET() {
  const db = await getDb();
  const rows = (
    await db.execute(`
      SELECT r.id, r.equipment_id, r.label, r.interval_months, r.last_done_date, r.notes,
             e.name AS equipment_name, e.make, e.model, e.category
      FROM equipment_reminders r
      JOIN equipment e ON r.equipment_id = e.id
      WHERE r.active = 1 AND e.status = 'active'
    `)
  ).rows;
  return NextResponse.json(rows);
}

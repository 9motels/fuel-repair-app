import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// All active reminders for active vehicles, with the vehicle context the client
// needs to compute due-status (current odometer + a display title).
export async function GET() {
  const db = await getDb();
  const rows = (
    await db.execute(`
      SELECT r.id, r.vehicle_id, r.label, r.interval_miles, r.interval_months,
             r.last_done_date, r.last_done_odometer, r.notes,
             v.name AS vehicle_name, v.year, v.make, v.model,
             v.odometer AS vehicle_odometer
      FROM vehicle_reminders r
      JOIN vehicles v ON r.vehicle_id = v.id
      WHERE r.active = 1 AND v.status = 'active'
    `)
  ).rows;
  return NextResponse.json(rows);
}

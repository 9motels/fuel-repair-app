import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// PATCH to edit a reminder or mark it done (send last_done_date + last_done_odometer).
export async function PATCH(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();

  const fields = [];
  const args = [];
  for (const key of ['label', 'interval_miles', 'interval_months', 'last_done_date', 'last_done_odometer', 'notes', 'active']) {
    if (key in body) {
      fields.push(`${key} = ?`);
      args.push(body[key]);
    }
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }
  args.push(id);
  await db.execute({ sql: `UPDATE vehicle_reminders SET ${fields.join(', ')} WHERE id = ?`, args });
  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM vehicle_reminders WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}

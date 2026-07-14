import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// PATCH { action: 'done' } -> mark complete today and roll the next due date
// forward by interval_months (if recurring). Otherwise update the given fields.
export async function PATCH(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();

  if (body.action === 'done') {
    const cur = (
      await db.execute({ sql: 'SELECT interval_months FROM compliance_tasks WHERE id = ?', args: [id] })
    ).rows[0];
    const done = today();
    let next = null;
    const im = cur ? Number(cur.interval_months) : 0;
    if (im > 0) {
      const d = new Date(done + 'T00:00:00');
      d.setMonth(d.getMonth() + im);
      next = d.toISOString().slice(0, 10);
    }
    await db.execute({
      sql: 'UPDATE compliance_tasks SET last_done_date = ?, next_due_date = ? WHERE id = ?',
      args: [done, next, id],
    });
    return NextResponse.json({ success: true, last_done_date: done, next_due_date: next });
  }

  const fields = [];
  const args = [];
  for (const key of ['label', 'category', 'location_id', 'equipment_id', 'interval_months', 'next_due_date', 'notes', 'active']) {
    if (key in body) {
      fields.push(`${key} = ?`);
      args.push(body[key] === '' ? null : body[key]);
    }
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }
  args.push(id);
  await db.execute({ sql: `UPDATE compliance_tasks SET ${fields.join(', ')} WHERE id = ?`, args });
  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM compliance_tasks WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}

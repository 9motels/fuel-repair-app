import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET [?location_id=] -> active compliance tasks, soonest-due first.
export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const locId = searchParams.get('location_id');
  const args = [];
  let where = 'WHERE c.active = 1';
  if (locId) {
    where += ' AND c.location_id = ?';
    args.push(locId);
  }
  const rows = (
    await db.execute({
      sql: `SELECT c.*, l.name AS location_name,
                   e.name AS equipment_name, e.make AS equipment_make, e.model AS equipment_model
            FROM compliance_tasks c
            LEFT JOIN locations l ON c.location_id = l.id
            LEFT JOIN equipment e ON c.equipment_id = e.id
            ${where}
            ORDER BY (c.next_due_date IS NULL), c.next_due_date ASC, c.label ASC`,
      args,
    })
  ).rows;
  return NextResponse.json(rows);
}

// POST { ...task } or { tasks: [ ...task ] } -> create one or many. A task is
// { label, category?, location_id?, equipment_id?, interval_months?, next_due_date?, notes? }.
export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const list = Array.isArray(body.tasks) ? body.tasks : [body];
  const ids = [];
  for (const t of list) {
    const label = (t.label || '').trim();
    if (!label) continue;
    const r = await db.execute({
      sql: `INSERT INTO compliance_tasks
              (location_id, equipment_id, label, category, interval_months, next_due_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        t.location_id || null,
        t.equipment_id || null,
        label,
        t.category || '',
        t.interval_months ? Number(t.interval_months) : null,
        t.next_due_date || null,
        (t.notes || '').trim(),
      ],
    });
    ids.push(Number(r.lastInsertRowid));
  }
  return NextResponse.json({ ids });
}

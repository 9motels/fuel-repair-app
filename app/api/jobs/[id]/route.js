import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { JOB_STATUSES, JOB_PRIORITIES } from '@/lib/jobsAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const job = (
    await db.execute({
      sql: `SELECT j.*, l.name AS location_name,
                   e.name AS equipment_name, e.make AS equipment_make, e.model AS equipment_model,
                   p.name AS created_by_name
            FROM jobs j
            LEFT JOIN locations l ON j.location_id = l.id
            LEFT JOIN equipment e ON j.equipment_id = e.id
            LEFT JOIN people p ON j.created_by_id = p.id
            WHERE j.id = ?`,
      args: [id],
    })
  ).rows[0];
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  const updates = (
    await db.execute({
      sql: `SELECT u.*, p.name AS person_name FROM job_updates u
            LEFT JOIN people p ON u.person_id = p.id
            WHERE u.job_id = ? ORDER BY u.created_at DESC`,
      args: [id],
    })
  ).rows;

  // Linked repairs (reused from the existing repairs table) with their parts cost.
  const repairRows = (
    await db.execute({
      sql: `SELECT r.*, l.name AS location_name FROM repairs r
            LEFT JOIN locations l ON r.location_id = l.id
            WHERE r.job_id = ? ORDER BY r.repair_date DESC, r.created_at DESC`,
      args: [id],
    })
  ).rows;
  const repairs = [];
  for (const r of repairRows) {
    const items = (
      await db.execute({
        sql: `SELECT ri.quantity, ri.unit_cost, it.name AS item_name
              FROM repair_items ri JOIN items it ON ri.item_id = it.id
              WHERE ri.repair_id = ?`,
        args: [r.id],
      })
    ).rows;
    const total_cost = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0);
    repairs.push({ ...r, items, total_cost });
  }

  return NextResponse.json({ ...job, updates, repairs });
}

export async function PATCH(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();
  const fields = [];
  const args = [];
  for (const key of ['title', 'problem', 'next_action', 'location_id', 'equipment_id', 'scheduled_date', 'due_date']) {
    if (key in body) { fields.push(`${key} = ?`); args.push(body[key] === '' ? null : body[key]); }
  }
  if ('priority' in body && JOB_PRIORITIES.includes(body.priority)) { fields.push('priority = ?'); args.push(body.priority); }
  if ('status' in body && JOB_STATUSES.includes(body.status)) {
    fields.push('status = ?'); args.push(body.status);
    fields.push("completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END"); args.push(body.status);
  }
  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  fields.push("updated_at = datetime('now')");
  args.push(id);
  await db.execute({ sql: `UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`, args });
  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM jobs WHERE id = ?', args: [id] });
  return NextResponse.json({ success: true });
}

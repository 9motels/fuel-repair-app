import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { JOB_STATUSES, JOB_PRIORITIES } from '@/lib/jobsAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET [?open=1&location_id=&equipment_id=&status=] -> jobs with station/equipment
// names and a lightweight update/time tally.
export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const args = [];
  const conds = [];
  if (searchParams.get('open') === '1') conds.push("j.status != 'completed'");
  const status = searchParams.get('status');
  if (status) { conds.push('j.status = ?'); args.push(status); }
  const loc = searchParams.get('location_id');
  if (loc) { conds.push('j.location_id = ?'); args.push(loc); }
  const eq = searchParams.get('equipment_id');
  if (eq) { conds.push('j.equipment_id = ?'); args.push(eq); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rows = (
    await db.execute({
      sql: `SELECT j.*, l.name AS location_name,
                   e.name AS equipment_name, e.make AS equipment_make, e.model AS equipment_model,
                   p.name AS created_by_name,
                   (SELECT COUNT(*) FROM job_updates u WHERE u.job_id = j.id) AS update_count,
                   (SELECT COALESCE(SUM(u.minutes), 0) FROM job_updates u WHERE u.job_id = j.id) AS total_minutes
            FROM jobs j
            LEFT JOIN locations l ON j.location_id = l.id
            LEFT JOIN equipment e ON j.equipment_id = e.id
            LEFT JOIN people p ON j.created_by_id = p.id
            ${where}
            ORDER BY (j.status = 'completed'),
                     CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                     j.updated_at DESC`,
      args,
    })
  ).rows;
  return NextResponse.json(rows);
}

// POST { title, location_id, equipment_id, problem, next_action, priority, status, created_by_id }
export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const title = (body.title || '').trim();
  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
  const status = JOB_STATUSES.includes(body.status) ? body.status : 'new';
  const priority = JOB_PRIORITIES.includes(body.priority) ? body.priority : 'normal';
  const result = await db.execute({
    sql: `INSERT INTO jobs (location_id, equipment_id, title, problem, next_action, priority, status, created_by_id, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      body.location_id || null,
      body.equipment_id || null,
      title,
      (body.problem || '').trim(),
      (body.next_action || '').trim(),
      priority,
      status,
      body.created_by_id || null,
      status === 'completed' ? new Date().toISOString() : null,
    ],
  });
  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}

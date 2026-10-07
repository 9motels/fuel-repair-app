import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { JOB_STATUSES, JOB_PRIORITIES } from '@/lib/jobsAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// POST { job_id?, title, location_id, equipment_id, problem, next_action, priority,
//        status, work_performed, minutes, minutes_estimated, cost, cost_note, person_id }
// Creates a new job (or appends to job_id) + a work update, then links the capture.
export async function POST(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();

  const capture = (await db.execute({ sql: 'SELECT * FROM captures WHERE id = ?', args: [id] })).rows[0];
  if (!capture) return NextResponse.json({ error: 'Capture not found' }, { status: 404 });

  const status = JOB_STATUSES.includes(body.status) ? body.status : 'new';
  const priority = JOB_PRIORITIES.includes(body.priority) ? body.priority : 'normal';
  const minutes = numOrNull(body.minutes);
  const cost = numOrNull(body.cost);
  const personId = body.person_id || capture.person_id || null;

  let jobId = body.job_id || null;

  if (jobId) {
    // Append to an existing job; advance its status / next action.
    await db.execute({
      sql: `UPDATE jobs SET status = ?, next_action = ?, updated_at = datetime('now'),
                 completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
            WHERE id = ?`,
      args: [status, (body.next_action || '').trim(), status, jobId],
    });
  } else {
    const result = await db.execute({
      sql: `INSERT INTO jobs (location_id, equipment_id, title, problem, next_action, priority, status, source, created_by_id, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'capture', ?, ?)`,
      args: [
        body.location_id || null,
        body.equipment_id || null,
        (body.title || 'Untitled job').trim(),
        (body.problem || '').trim(),
        (body.next_action || '').trim(),
        priority,
        status,
        personId,
        status === 'completed' ? new Date().toISOString() : null,
      ],
    });
    jobId = Number(result.lastInsertRowid);
  }

  await db.execute({
    sql: `INSERT INTO job_updates (job_id, person_id, kind, work_performed, raw_text, minutes, minutes_estimated, cost, cost_note, follow_up, status_after, capture_id)
          VALUES (?, ?, 'work', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      jobId,
      personId,
      (body.work_performed || '').trim(),
      capture.raw_text,
      minutes,
      body.minutes_estimated ? 1 : 0,
      cost,
      (body.cost_note || '').trim(),
      (body.next_action || '').trim(),
      status,
      capture.id,
    ],
  });

  await db.execute({
    sql: "UPDATE captures SET status = 'structured', job_id = ?, processed_at = datetime('now') WHERE id = ?",
    args: [jobId, id],
  });

  return NextResponse.json({ job_id: jobId });
}

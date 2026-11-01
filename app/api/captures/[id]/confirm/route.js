import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { JOB_STATUSES, JOB_PRIORITIES } from '@/lib/jobsAi';
import { createPartNeed, applyPartUpdate } from '@/lib/partsDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isActionable(a) {
  if (!a) return false;
  if (a.action === 'need') return !!(a.description || '').trim();
  if (a.action === 'update') return !!a.part_id;
  return false;
}

// POST { job_id?, parts_only?, title, location_id, equipment_id, problem, next_action,
//        priority, status, work_performed, minutes, minutes_estimated, cost, cost_note,
//        person_id, parts?: [{ action: 'need'|'update', description, quantity,
//        part_id, new_status, storage_location }] }
// Creates a job (or appends to job_id) + a work update — unless parts_only — then
// creates part needs / applies part updates, and links the capture.
export async function POST(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();

  const capture = (await db.execute({ sql: 'SELECT * FROM captures WHERE id = ?', args: [id] })).rows[0];
  if (!capture) return NextResponse.json({ error: 'Capture not found' }, { status: 404 });
  // Already logged (double-tap or retried request) — don't create it twice.
  if (capture.status === 'structured') {
    return NextResponse.json({ job_id: capture.job_id, already: true });
  }

  const partsOnly = !!body.parts_only;
  const actions = (Array.isArray(body.parts) ? body.parts : []).filter(isActionable);
  if (partsOnly && actions.length === 0) {
    return NextResponse.json({ error: 'Nothing to save — add a part need or pick a part to update.' }, { status: 400 });
  }

  const status = JOB_STATUSES.includes(body.status) ? body.status : 'new';
  const priority = JOB_PRIORITIES.includes(body.priority) ? body.priority : 'normal';
  const minutes = numOrNull(body.minutes);
  const cost = numOrNull(body.cost);
  const personId = body.person_id || capture.person_id || null;

  let jobId = null;

  if (!partsOnly) {
    jobId = body.job_id || null;
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
  }

  // New needs inherit the job's station/equipment when the draft didn't set them.
  let needLoc = body.location_id || null;
  let needEq = body.equipment_id || null;
  if (jobId && (!needLoc || !needEq)) {
    const job = (await db.execute({ sql: 'SELECT location_id, equipment_id FROM jobs WHERE id = ?', args: [jobId] })).rows[0];
    if (job) {
      needLoc = needLoc || job.location_id || null;
      needEq = needEq || job.equipment_id || null;
    }
  }

  let partsCreated = 0;
  let partsUpdated = 0;
  for (const a of actions) {
    if (a.action === 'need') {
      const pid = await createPartNeed(db, {
        job_id: jobId,
        location_id: needLoc,
        equipment_id: needEq,
        description: a.description,
        quantity: a.quantity,
        status: a.new_status,
        notes: `From note: "${capture.raw_text}"`,
        created_by_id: personId,
      });
      if (pid) partsCreated += 1;
    } else {
      await applyPartUpdate(db, a.part_id, { status: a.new_status, storage_location: a.storage_location, job_id: jobId });
      partsUpdated += 1;
    }
  }

  await db.execute({
    sql: "UPDATE captures SET status = 'structured', job_id = ?, processed_at = datetime('now') WHERE id = ?",
    args: [jobId, id],
  });

  return NextResponse.json({ job_id: jobId, parts_created: partsCreated, parts_updated: partsUpdated });
}

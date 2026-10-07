import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { JOB_STATUSES } from '@/lib/jobsAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = ['work', 'troubleshoot', 'remote', 'research', 'contractor'];

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// POST a work update / time entry to a job. Advances the job's status + next
// action when provided. Cost here is cash on this visit (not parts).
export async function POST(request, { params }) {
  const db = await getDb();
  const { id } = await params;
  const body = await request.json();

  const job = (await db.execute({ sql: 'SELECT id FROM jobs WHERE id = ?', args: [id] })).rows[0];
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const kind = KINDS.includes(body.kind) ? body.kind : 'work';
  const status = JOB_STATUSES.includes(body.status) ? body.status : null;

  await db.execute({
    sql: `INSERT INTO job_updates (job_id, person_id, kind, work_performed, minutes, minutes_estimated, cost, cost_note, follow_up, status_after)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      body.person_id || null,
      kind,
      (body.work_performed || '').trim(),
      numOrNull(body.minutes),
      body.minutes_estimated ? 1 : 0,
      numOrNull(body.cost),
      (body.cost_note || '').trim(),
      (body.follow_up || '').trim(),
      status,
    ],
  });

  // Advance the job if this update set a status and/or follow-up.
  const sets = ["updated_at = datetime('now')"];
  const args = [];
  if (status) {
    sets.push('status = ?'); args.push(status);
    sets.push("completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END"); args.push(status);
  }
  if (body.follow_up !== undefined) { sets.push('next_action = ?'); args.push((body.follow_up || '').trim()); }
  args.push(id);
  await db.execute({ sql: `UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, args });

  return NextResponse.json({ success: true });
}

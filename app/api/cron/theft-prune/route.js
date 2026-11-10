import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { deletePrivate } from '@/lib/theft';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Daily: drop media for unlabeled clips older than 30 days and labeled clips
// older than 90 days (the store NVR keeps the full footage; labels stay in the
// row). Same auth as the other cron: Bearer CRON_SECRET.
const UNLABELED_DAYS = 30;
const LABELED_DAYS = 90;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const rows = (await db.execute({
    sql: `SELECT id, clip_path, strip_path, still_path FROM theft_events
          WHERE (clip_path IS NOT NULL OR strip_path IS NOT NULL OR still_path IS NOT NULL)
            AND ((label IS NULL AND event_time < datetime('now', ?)) OR (label IS NOT NULL AND event_time < datetime('now', ?)))
          LIMIT 200`,
    args: [`-${UNLABELED_DAYS} days`, `-${LABELED_DAYS} days`],
  })).rows;
  const paths = rows.flatMap((r) => [r.clip_path, r.strip_path, r.still_path].filter(Boolean));
  if (paths.length) {
    await deletePrivate(paths);
    await db.execute({
      sql: `UPDATE theft_events SET clip_path = NULL, strip_path = NULL, still_path = NULL WHERE id IN (${rows.map(() => '?').join(',')})`,
      args: rows.map((r) => r.id),
    });
  }
  return NextResponse.json({ pruned_events: rows.length, deleted_files: paths.length });
}

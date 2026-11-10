import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { presentEvent } from '@/lib/theft';

export const runtime = 'nodejs';

// GET -> flagged clips for the review page, newest first.
//   ?status=unlabeled|labeled|all (default unlabeled)   ?location_id=   ?alerted=1
//   ?limit= (default 50)   ?id= (one event, any status — used by push deep links)
export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'unlabeled';
  const locationId = searchParams.get('location_id');
  const alerted = searchParams.get('alerted');
  const id = searchParams.get('id');
  const limit = Math.min(parseInt(searchParams.get('limit'), 10) || 50, 200);

  let sql = `SELECT e.*, l.name AS location_name, p.name AS labeled_by_name
             FROM theft_events e JOIN locations l ON e.location_id = l.id
             LEFT JOIN people p ON e.labeled_by_id = p.id WHERE 1=1`;
  const args = [];
  if (id) {
    // the event, plus its incident-mates (same incident_id, or same store within 2 minutes) so a push deep link shows every angle
    sql += ` AND (e.id = ? OR e.incident_id = (SELECT incident_id FROM theft_events WHERE id = ? AND incident_id IS NOT NULL)
             OR (e.location_id = (SELECT location_id FROM theft_events WHERE id = ?)
                 AND abs(strftime('%s', e.event_time) - (SELECT strftime('%s', event_time) FROM theft_events WHERE id = ?)) <= 120))`;
    args.push(id, id, id, id);
  } else {
    if (status === 'unlabeled') sql += ' AND e.label IS NULL';
    if (status === 'labeled') sql += ' AND e.label IS NOT NULL';
    if (locationId) { sql += ' AND e.location_id = ?'; args.push(locationId); }
    if (alerted === '1') sql += ' AND e.alerted = 1';
  }
  sql += ' ORDER BY e.alerted DESC, e.event_time DESC LIMIT ?'; args.push(limit);
  const rows = (await db.execute({ sql, args })).rows;
  return NextResponse.json(rows.map(presentEvent));
}

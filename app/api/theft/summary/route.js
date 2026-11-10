import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

// GET -> counts for the dashboard card: clips waiting for review, alerts today.
export async function GET() {
  const db = await getDb();
  const row = (await db.execute(`
    SELECT SUM(CASE WHEN label IS NULL THEN 1 ELSE 0 END) AS unlabeled,
           SUM(CASE WHEN label IS NULL AND alerted = 1 THEN 1 ELSE 0 END) AS unlabeled_alerts,
           SUM(CASE WHEN alerted = 1 AND date(event_time) = date('now', 'localtime') THEN 1 ELSE 0 END) AS alerts_today
    FROM theft_events`)).rows[0] || {};
  return NextResponse.json([{
    unlabeled: Number(row.unlabeled || 0),
    unlabeled_alerts: Number(row.unlabeled_alerts || 0),
    alerts_today: Number(row.alerts_today || 0),
  }]);
}

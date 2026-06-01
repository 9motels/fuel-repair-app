import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Returns the most recent cron_runs row for a given job (defaults to
// low_stock_alerts). Used by the inventory page to render
// "last checked X ago".
export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const jobName = searchParams.get('job') || 'low_stock_alerts';
  const result = await db.execute({
    sql: `SELECT * FROM cron_runs WHERE job_name = ? ORDER BY ran_at DESC LIMIT 1`,
    args: [jobName],
  });
  return NextResponse.json(result.rows[0] || null);
}

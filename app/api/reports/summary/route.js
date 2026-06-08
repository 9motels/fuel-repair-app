import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildReportData } from '@/lib/reportData';

export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const locationIds = searchParams.get('location_id') || '';

  const data = await buildReportData(db, { from, to, locationIds });
  return NextResponse.json(data);
}

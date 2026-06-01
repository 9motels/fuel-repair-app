import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const result = await db.execute(
    'SELECT id, name, active FROM people WHERE active = 1 ORDER BY name'
  );
  return NextResponse.json(result.rows);
}

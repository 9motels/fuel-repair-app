import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { safeParse } from '@/lib/equipmentUtils';

export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('location_id');
  const status = searchParams.get('status') || 'active';

  let sql = `SELECT v.*, l.name as location_name, p.name as created_by_name
             FROM vehicles v
             JOIN locations l ON v.location_id = l.id
             LEFT JOIN people p ON v.created_by_id = p.id
             WHERE 1=1`;
  const args = [];
  if (status !== 'all') {
    sql += ' AND v.status = ?';
    args.push(status);
  }
  if (locationId) {
    sql += ' AND v.location_id = ?';
    args.push(locationId);
  }
  sql += ' ORDER BY v.created_at DESC';

  const rows = (await db.execute({ sql, args })).rows;
  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      photo_urls: safeParse(r.photo_urls, []),
      ai_extracted: safeParse(r.ai_extracted, null),
    }))
  );
}

export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const {
    location_id,
    name,
    vehicle_type,
    year,
    make,
    model,
    vin,
    plate,
    odometer,
    description,
    photo_urls,
    ai_extracted,
    created_by_id,
  } = body;

  if (!location_id) {
    return NextResponse.json({ error: 'location_id is required' }, { status: 400 });
  }
  if (!name && !make && !model && !plate) {
    return NextResponse.json(
      { error: 'Give the vehicle a name, or a make/model/plate.' },
      { status: 400 }
    );
  }

  const result = await db.execute({
    sql: `INSERT INTO vehicles
            (location_id, name, vehicle_type, year, make, model, vin, plate, odometer, description, photo_urls, ai_extracted, created_by_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      location_id,
      name || '',
      vehicle_type || '',
      year || '',
      make || '',
      model || '',
      vin || '',
      plate || '',
      Number.isFinite(odometer) ? odometer : parseInt(odometer) || 0,
      description || '',
      JSON.stringify(Array.isArray(photo_urls) ? photo_urls : []),
      ai_extracted ? JSON.stringify(ai_extracted) : null,
      created_by_id || null,
    ],
  });
  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}

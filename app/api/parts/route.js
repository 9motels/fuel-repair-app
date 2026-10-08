import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PART_STATUSES, PART_OPEN_STATUSES } from '@/lib/partsAi';
import { safeParse } from '@/lib/equipmentUtils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET [?open=1&status=&job_id=] -> parts with job/station/equipment names.
export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const conds = [];
  const args = [];
  if (searchParams.get('open') === '1') {
    conds.push(`p.status IN (${PART_OPEN_STATUSES.map(() => '?').join(',')})`);
    args.push(...PART_OPEN_STATUSES);
  }
  const status = searchParams.get('status');
  if (status) { conds.push('p.status = ?'); args.push(status); }
  const jobId = searchParams.get('job_id');
  if (jobId) { conds.push('p.job_id = ?'); args.push(jobId); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rows = (
    await db.execute({
      sql: `SELECT p.*, j.title AS job_title, l.name AS location_name,
                   e.name AS equipment_name, e.make AS equipment_make, e.model AS equipment_model
            FROM parts p
            LEFT JOIN jobs j ON p.job_id = j.id
            LEFT JOIN locations l ON p.location_id = l.id
            LEFT JOIN equipment e ON p.equipment_id = e.id
            ${where}
            ORDER BY p.updated_at DESC`,
      args,
    })
  ).rows.map((r) => ({
    ...r,
    candidates: safeParse(r.candidates, null),
    photo_urls: safeParse(r.photo_urls, []),
  }));
  return NextResponse.json(rows);
}

// POST { description, job_id?, location_id?, equipment_id?, quantity?, part_number?,
//        supplier?, status?, notes?, created_by_id? } -> create a part need.
// If a job is given, inherit its station/equipment when not supplied.
export async function POST(request) {
  const db = await getDb();
  const body = await request.json();
  const description = (body.description || '').trim();
  if (!description) return NextResponse.json({ error: 'Describe the part you need.' }, { status: 400 });

  let locationId = body.location_id || null;
  let equipmentId = body.equipment_id || null;
  if (body.job_id && (!locationId || !equipmentId)) {
    const job = (await db.execute({ sql: 'SELECT location_id, equipment_id FROM jobs WHERE id = ?', args: [body.job_id] })).rows[0];
    if (job) {
      locationId = locationId || job.location_id || null;
      equipmentId = equipmentId || job.equipment_id || null;
    }
  }
  const status = PART_STATUSES.includes(body.status) ? body.status : 'needs_research';

  const result = await db.execute({
    sql: `INSERT INTO parts (job_id, location_id, equipment_id, description, quantity, part_number, supplier, status, notes, created_by_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      body.job_id || null,
      locationId,
      equipmentId,
      description,
      Number(body.quantity) || 1,
      (body.part_number || '').trim(),
      (body.supplier || '').trim(),
      status,
      (body.notes || '').trim(),
      body.created_by_id || null,
    ],
  });
  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}

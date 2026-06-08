import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Full repair history for a single pump at a single location.
// Path: /api/pumps/{location_id}/{pump_number}
export async function GET(request, { params }) {
  const db = await getDb();
  const { location_id, pump_number } = await params;
  const locId = parseInt(location_id, 10);
  const pumpNo = parseInt(pump_number, 10);
  if (!Number.isFinite(locId) || !Number.isFinite(pumpNo)) {
    return NextResponse.json({ error: 'invalid location_id or pump_number' }, { status: 400 });
  }

  const location = (await db.execute({
    sql: `SELECT id, name FROM locations WHERE id = ?`,
    args: [locId],
  })).rows[0];
  if (!location) {
    return NextResponse.json({ error: 'location not found' }, { status: 404 });
  }

  const repairs = (await db.execute({
    sql: `SELECT r.*, p.name AS created_by_name
          FROM repairs r
          LEFT JOIN people p ON r.created_by_id = p.id
          WHERE r.location_id = ? AND r.pump_number = ?
          ORDER BY r.repair_date DESC, r.created_at DESC`,
    args: [locId, pumpNo],
  })).rows;

  // Hydrate each repair with its items + total
  const detailed = [];
  for (const r of repairs) {
    const items = (await db.execute({
      sql: `SELECT ri.*, it.name AS item_name, it.part_number, it.unit,
                   sl.name AS source_location_name
            FROM repair_items ri
            JOIN items it ON ri.item_id = it.id
            JOIN locations sl ON ri.source_location_id = sl.id
            WHERE ri.repair_id = ?`,
      args: [r.id],
    })).rows;
    const total_cost = items.reduce(
      (s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0
    );
    detailed.push({ ...r, items, total_cost });
  }

  const lifetimeCost = detailed.reduce((s, r) => s + r.total_cost, 0);
  const firstRepair = detailed.length ? detailed[detailed.length - 1].repair_date : null;
  const lastRepair = detailed.length ? detailed[0].repair_date : null;

  return NextResponse.json({
    location,
    pump_number: pumpNo,
    repair_count: detailed.length,
    lifetime_cost: lifetimeCost,
    first_repair: firstRepair,
    last_repair: lastRepair,
    repairs: detailed,
  });
}

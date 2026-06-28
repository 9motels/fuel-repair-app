import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const db = await getDb();

  const vehicles = (
    await db.execute(
      `SELECT v.id, v.name, v.year, v.make, v.model, v.odometer,
              COALESCE((SELECT SUM(cost) FROM vehicle_service_logs WHERE vehicle_id = v.id), 0) AS total
       FROM vehicles v
       WHERE v.status = 'active'
       ORDER BY total DESC`
    )
  ).rows;

  const locations = (
    await db.execute(
      `SELECT l.id, l.name, COALESCE(SUM(ri.quantity * ri.unit_cost), 0) AS total
       FROM locations l
       LEFT JOIN repairs r ON r.location_id = l.id
       LEFT JOIN repair_items ri ON ri.repair_id = r.id
       GROUP BY l.id, l.name
       ORDER BY total DESC`
    )
  ).rows;

  const equipment = (
    await db.execute(
      `SELECT e.id, e.name, e.make, e.model, COALESCE(SUM(ri.quantity * ri.unit_cost), 0) AS total
       FROM equipment e
       LEFT JOIN repairs r ON r.equipment_id = e.id
       LEFT JOIN repair_items ri ON ri.repair_id = r.id
       WHERE e.status = 'active'
       GROUP BY e.id
       ORDER BY total DESC`
    )
  ).rows;

  return NextResponse.json({ vehicles, locations, equipment });
}

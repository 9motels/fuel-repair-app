import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const result = await db.execute(`
    SELECT it.id as item_id, it.name as item_name, it.part_number, it.category,
           it.min_quantity, it.unit,
           COALESCE(SUM(i.quantity), 0) as total_quantity
    FROM items it
    LEFT JOIN inventory i ON it.id = i.item_id
    WHERE it.min_quantity > 0
    GROUP BY it.id
    HAVING total_quantity <= it.min_quantity
    ORDER BY (total_quantity * 1.0 / it.min_quantity) ASC
  `);
  return NextResponse.json(result.rows);
}

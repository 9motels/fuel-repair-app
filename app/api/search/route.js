import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const EMPTY = { items: [], equipment: [], vehicles: [], repairs: [] };

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json(EMPTY);

  const db = await getDb();
  const like = '%' + q.toLowerCase() + '%';

  async function run(sql, args) {
    try {
      const result = await db.execute({ sql, args });
      return result.rows;
    } catch (e) {
      return [];
    }
  }

  const [itemRows, equipmentRows, vehicleRows, repairRows] = await Promise.all([
    run(
      'SELECT id, name, part_number FROM items WHERE lower(name) LIKE ? OR lower(part_number) LIKE ? LIMIT 10',
      [like, like]
    ),
    run(
      'SELECT id, name, make, model, serial FROM equipment WHERE lower(name) LIKE ? OR lower(make) LIKE ? OR lower(model) LIKE ? OR lower(serial) LIKE ? LIMIT 10',
      [like, like, like, like]
    ),
    run(
      'SELECT id, name, year, make, model, vin, plate FROM vehicles WHERE lower(name) LIKE ? OR lower(year) LIKE ? OR lower(make) LIKE ? OR lower(model) LIKE ? OR lower(vin) LIKE ? OR lower(plate) LIKE ? LIMIT 10',
      [like, like, like, like, like, like]
    ),
    run(
      'SELECT id, description, notes, repair_date FROM repairs WHERE lower(description) LIKE ? OR lower(notes) LIKE ? LIMIT 10',
      [like, like]
    ),
  ]);

  const items = itemRows.map((r) => ({
    id: r.id,
    title: r.name,
    sub: r.part_number || '',
    href: '/items',
  }));

  const equipment = equipmentRows.map((r) => {
    const combo = [r.make, r.model].filter(Boolean).join(' ');
    return {
      id: r.id,
      title: r.name || combo || 'Equipment #' + r.id,
      sub: combo,
      href: `/equipment/${r.id}`,
    };
  });

  const vehicles = vehicleRows.map((r) => {
    const combo = [r.year, r.make, r.model].filter(Boolean).join(' ');
    return {
      id: r.id,
      title: r.name || combo || 'Vehicle #' + r.id,
      sub: r.plate || '',
      href: `/vehicles/${r.id}`,
    };
  });

  const repairs = repairRows.map((r) => ({
    id: r.id,
    title: r.description || 'Repair',
    sub: r.repair_date || '',
    href: '/repairs',
  }));

  return NextResponse.json({ items, equipment, vehicles, repairs });
}

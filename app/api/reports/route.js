import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('location_id');
  const month = searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'month parameter required (YYYY-MM)' }, { status: 400 });

  const startDate = `${month}-01`;
  const [year, mon] = month.split('-').map(Number);
  const endDate = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;

  let locationsToReport;
  if (locationId) {
    locationsToReport = (await db.execute({ sql: 'SELECT * FROM locations WHERE id = ?', args: [locationId] })).rows;
  } else {
    locationsToReport = (await db.execute('SELECT * FROM locations ORDER BY is_central DESC, name ASC')).rows;
  }

  const reports = [];
  for (const loc of locationsToReport) {
    const repairs = (await db.execute({ sql: 'SELECT * FROM repairs WHERE location_id = ? AND repair_date >= ? AND repair_date < ? ORDER BY repair_date ASC', args: [loc.id, startDate, endDate] })).rows;

    const repairDetails = [];
    for (const r of repairs) {
      const items = (await db.execute({ sql: `SELECT ri.*, it.name as item_name, it.part_number, it.unit, sl.name as source_location_name FROM repair_items ri JOIN items it ON ri.item_id = it.id JOIN locations sl ON ri.source_location_id = sl.id WHERE ri.repair_id = ?`, args: [r.id] })).rows;
      const total_cost = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_cost), 0);
      repairDetails.push({ ...r, items, total_cost });
    }

    const itemSummary = {};
    repairDetails.forEach(r => {
      r.items.forEach(i => {
        const key = i.item_id;
        if (!itemSummary[key]) itemSummary[key] = { item_name: i.item_name, part_number: i.part_number, unit: i.unit, total_qty: 0, total_cost: 0 };
        itemSummary[key].total_qty += Number(i.quantity);
        itemSummary[key].total_cost += Number(i.quantity) * Number(i.unit_cost);
      });
    });

    const totalCost = repairDetails.reduce((sum, r) => sum + r.total_cost, 0);
    reports.push({ location: loc, month, repair_count: repairs.length, total_cost: totalCost, repairs: repairDetails, item_summary: Object.values(itemSummary).sort((a, b) => b.total_cost - a.total_cost) });
  }
  return NextResponse.json(reports);
}

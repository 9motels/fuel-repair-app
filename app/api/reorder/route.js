import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { parsePriceFromText } from '@/lib/itemCost';

export async function GET() {
  const db = await getDb();

  // Items that have a meaningful minimum.
  const itemsResult = await db.execute(
    'SELECT id, name, description, part_number, unit, min_quantity, unit_cost FROM items WHERE min_quantity > 0'
  );
  const items = itemsResult.rows;

  // On-hand totals across all locations, keyed by item_id.
  const invResult = await db.execute(
    'SELECT item_id, SUM(quantity) AS on_hand FROM inventory GROUP BY item_id'
  );
  const onHandByItem = new Map();
  for (const row of invResult.rows) {
    onHandByItem.set(Number(row.item_id), Number(row.on_hand) || 0);
  }

  const out = [];
  for (const item of items) {
    const minQty = Number(item.min_quantity) || 0;
    const onHand = onHandByItem.get(Number(item.id)) || 0;
    if (onHand > minQty) continue;

    // Most recent purchase for vendor/price fallback.
    const purchaseResult = await db.execute({
      sql: 'SELECT vendor, unit_price FROM purchases WHERE item_id = ? ORDER BY purchase_date DESC, created_at DESC LIMIT 1',
      args: [item.id],
    });
    const lastPurchase = purchaseResult.rows[0] || null;

    let unitCost = Number(item.unit_cost) || 0;
    if (!(unitCost > 0)) {
      const fromDesc = parsePriceFromText(item.description);
      if (fromDesc > 0) {
        unitCost = fromDesc;
      } else if (lastPurchase && Number(lastPurchase.unit_price) > 0) {
        unitCost = Number(lastPurchase.unit_price);
      } else {
        unitCost = 0;
      }
    }

    const vendor = lastPurchase && lastPurchase.vendor ? lastPurchase.vendor : '';
    const suggestedQty = Math.max(minQty * 2 - onHand, minQty, 1);

    out.push({
      item_id: Number(item.id),
      name: item.name,
      part_number: item.part_number || '',
      unit: item.unit || 'each',
      on_hand: onHand,
      min_quantity: minQty,
      vendor,
      unit_cost: unitCost,
      suggested_qty: suggestedQty,
    });
  }

  out.sort((a, b) => {
    const va = a.vendor || 'zzz';
    const vb = b.vendor || 'zzz';
    if (va !== vb) return va.localeCompare(vb);
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json(out);
}

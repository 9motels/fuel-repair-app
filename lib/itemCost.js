// Shared helpers for valuing inventory items.

// Pull a dollar amount out of free text like "Unit price: $65.11" or "$1,250".
export function parsePriceFromText(text) {
  if (!text) return 0;
  const m = String(text).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// Best available unit cost for an item: the explicit unit_cost when set,
// otherwise a price parsed from its description (legacy "Unit price: $X" data).
export function itemUnitCost(item) {
  if (!item) return 0;
  const c = Number(item.unit_cost);
  if (c > 0) return c;
  return parsePriceFromText(item.description);
}

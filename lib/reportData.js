// Shared aggregation queries for the Reports dashboard.
// Both /api/reports/summary (HTTP) and /api/reports/email (PDF + send)
// call buildReportData() so the dashboard, the email body, and the
// attached PDF can never disagree.

function parseLocationIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((n) => parseInt(n, 10)).filter(Number.isFinite);
  return String(raw)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter(Number.isFinite);
}

// Returns { whereClause, args } — a fragment to splice into queries with a
// fixed leading `WHERE r.repair_date >= ? AND r.repair_date <= ?` already.
function buildLocationFilter(locationIds) {
  if (!locationIds.length) return { fragment: '', args: [] };
  const placeholders = locationIds.map(() => '?').join(',');
  return {
    fragment: ` AND r.location_id IN (${placeholders})`,
    args: locationIds,
  };
}

export async function buildReportData(db, { from, to, locationIds: rawLocationIds }) {
  // Defensive defaults: last 30 days if missing.
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);
  const locationIds = parseLocationIds(rawLocationIds);
  const loc = buildLocationFilter(locationIds);

  const dateArgs = [fromDate, toDate];

  // Run all 5 aggregations in parallel.
  const [totalsRow, byLocation, topParts, byPump, byMonth] = await Promise.all([
    db.execute({
      sql: `
        SELECT
          COALESCE(SUM(ri.quantity * ri.unit_cost), 0) AS spend,
          COALESCE(SUM(ri.quantity * ri.unit_cost), 0) AS parts_cost,
          COUNT(DISTINCT CASE WHEN r.status = 'closed' THEN r.id END) AS repairs_closed,
          COUNT(DISTINCT CASE WHEN r.status = 'open'   OR r.status IS NULL THEN r.id END) AS repairs_open
        FROM repairs r
        LEFT JOIN repair_items ri ON ri.repair_id = r.id
        WHERE r.repair_date >= ? AND r.repair_date <= ?${loc.fragment}
      `,
      args: [...dateArgs, ...loc.args],
    }),
    db.execute({
      sql: `
        SELECT l.id AS location_id, l.name AS location_name,
          COUNT(DISTINCT r.id) AS repair_count,
          COALESCE(SUM(ri.quantity * ri.unit_cost), 0) AS total_cost
        FROM repairs r
        JOIN locations l ON l.id = r.location_id
        LEFT JOIN repair_items ri ON ri.repair_id = r.id
        WHERE r.repair_date >= ? AND r.repair_date <= ?${loc.fragment}
        GROUP BY l.id, l.name
        ORDER BY total_cost DESC
      `,
      args: [...dateArgs, ...loc.args],
    }),
    db.execute({
      sql: `
        SELECT it.id AS item_id, it.name AS item_name, it.part_number,
          SUM(ri.quantity)               AS total_qty,
          SUM(ri.quantity * ri.unit_cost) AS total_cost
        FROM repair_items ri
        JOIN repairs r  ON r.id  = ri.repair_id
        JOIN items   it ON it.id = ri.item_id
        WHERE r.repair_date >= ? AND r.repair_date <= ?${loc.fragment}
        GROUP BY it.id, it.name, it.part_number
        ORDER BY total_cost DESC
        LIMIT 10
      `,
      args: [...dateArgs, ...loc.args],
    }),
    db.execute({
      sql: `
        SELECT l.id AS location_id, l.name AS location_name, r.pump_number,
          COUNT(DISTINCT r.id) AS repair_count,
          COALESCE(SUM(ri.quantity * ri.unit_cost), 0) AS total_cost
        FROM repairs r
        JOIN locations l ON l.id = r.location_id
        LEFT JOIN repair_items ri ON ri.repair_id = r.id
        WHERE r.pump_number IS NOT NULL
          AND r.repair_date >= ? AND r.repair_date <= ?${loc.fragment}
        GROUP BY l.id, l.name, r.pump_number
        ORDER BY total_cost DESC
      `,
      args: [...dateArgs, ...loc.args],
    }),
    db.execute({
      sql: `
        SELECT strftime('%Y-%m', r.repair_date) AS month,
          COUNT(DISTINCT r.id) AS repair_count,
          COALESCE(SUM(ri.quantity * ri.unit_cost), 0) AS total_cost
        FROM repairs r
        LEFT JOIN repair_items ri ON ri.repair_id = r.id
        WHERE r.repair_date >= ? AND r.repair_date <= ?${loc.fragment}
        GROUP BY strftime('%Y-%m', r.repair_date)
        ORDER BY month DESC
      `,
      args: [...dateArgs, ...loc.args],
    }),
  ]);

  const t = totalsRow.rows[0] || {};
  return {
    filters: { from: fromDate, to: toDate, location_ids: locationIds },
    totals: {
      spend: Number(t.spend) || 0,
      parts_cost: Number(t.parts_cost) || 0,
      repairs_closed: Number(t.repairs_closed) || 0,
      repairs_open: Number(t.repairs_open) || 0,
    },
    by_location: byLocation.rows.map((r) => ({
      location_id: Number(r.location_id),
      location_name: r.location_name,
      repair_count: Number(r.repair_count) || 0,
      total_cost: Number(r.total_cost) || 0,
    })),
    top_parts: topParts.rows.map((r) => ({
      item_id: Number(r.item_id),
      item_name: r.item_name,
      part_number: r.part_number,
      total_qty: Number(r.total_qty) || 0,
      total_cost: Number(r.total_cost) || 0,
    })),
    by_pump: byPump.rows.map((r) => ({
      location_id: Number(r.location_id),
      location_name: r.location_name,
      pump_number: Number(r.pump_number),
      repair_count: Number(r.repair_count) || 0,
      total_cost: Number(r.total_cost) || 0,
    })),
    by_month: byMonth.rows.map((r) => ({
      month: r.month,
      repair_count: Number(r.repair_count) || 0,
      total_cost: Number(r.total_cost) || 0,
    })),
  };
}

// Shared low-stock business logic. Same source of truth for the cron job,
// the manual "check now" trigger, and the /api/alerts dashboard endpoint.
import { reminderStatus, reminderDueLabel } from './vehicleReminders';
import { complianceStatus, complianceDueLabel } from './compliance';
import { sendPushToAll } from './push';

export async function findLowStock(db) {
  // Group by (item, location). Includes only pairs where the item has a
  // min_quantity > 0 AND the location's stock is strictly below it.
  const result = await db.execute(`
    SELECT
      it.id            AS item_id,
      it.name          AS item_name,
      it.part_number   AS part_number,
      it.unit          AS unit,
      it.min_quantity  AS min_quantity,
      i.quantity       AS quantity,
      l.id             AS location_id,
      l.name           AS location_name
    FROM inventory i
    JOIN items     it ON i.item_id     = it.id
    JOIN locations l  ON i.location_id = l.id
    WHERE it.min_quantity > 0
      AND i.quantity < it.min_quantity
    ORDER BY l.name, it.name
  `);

  // Group rows by location.
  const byLocation = new Map();
  for (const row of result.rows) {
    if (!byLocation.has(row.location_id)) {
      byLocation.set(row.location_id, {
        location_id: row.location_id,
        location_name: row.location_name,
        items: [],
      });
    }
    byLocation.get(row.location_id).items.push({
      item_id: row.item_id,
      item_name: row.item_name,
      part_number: row.part_number,
      unit: row.unit,
      quantity: Number(row.quantity) || 0,
      min_quantity: Number(row.min_quantity) || 0,
      deficit: Math.max(0, Number(row.min_quantity) - Number(row.quantity)),
    });
  }

  // Sort each location's items by deficit (largest first), then return as
  // an array sorted by location name (already from SQL ORDER BY).
  for (const loc of byLocation.values()) {
    loc.items.sort((a, b) => b.deficit - a.deficit);
  }
  return Array.from(byLocation.values());
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderLowStockHtml(groups) {
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
  const locSections = groups.map((g) => {
    const rows = g.items.map((it) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">
          <div style="font-weight:600;">${escapeHtml(it.item_name)}</div>
          ${it.part_number ? `<div style="font-family:monospace;font-size:12px;color:#64748b;">${escapeHtml(it.part_number)}</div>` : ''}
        </td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#dc2626;font-weight:700;">${it.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">${it.min_quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#dc2626;font-weight:700;">-${it.deficit}</td>
      </tr>`).join('');
    return `
    <div style="margin-bottom:20px;">
      <h2 style="font-size:16px;margin:0 0 8px;color:#0f172a;">${escapeHtml(g.location_name)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:8px;">Part</th>
            <th style="padding:8px;text-align:center;">Current</th>
            <th style="padding:8px;text-align:center;">Threshold</th>
            <th style="padding:8px;text-align:center;">Deficit</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="padding:18px 24px;background:#dc2626;color:#fff;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.9;">Low Stock Alert</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${totalItems} item${totalItems === 1 ? '' : 's'} below minimum across ${groups.length} location${groups.length === 1 ? '' : 's'}</div>
    </div>
    <div style="padding:20px 24px;">
      ${locSections}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;background:#f8fafc;">
      Sent automatically by the Fuel Repair app. To adjust thresholds, edit the item on the Items page.
    </div>
  </div>
</body></html>`;
}

export function renderLowStockText(groups) {
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
  const lines = [
    `Low Stock Alert: ${totalItems} item${totalItems === 1 ? '' : 's'} below minimum across ${groups.length} location${groups.length === 1 ? '' : 's'}`,
    '',
  ];
  for (const g of groups) {
    lines.push(g.location_name);
    for (const it of g.items) {
      const partLabel = it.part_number ? `${it.item_name} (${it.part_number})` : it.item_name;
      lines.push(`  - ${partLabel}: ${it.quantity}/${it.min_quantity} (deficit ${it.deficit})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Vehicle + equipment service reminders that are overdue or due soon.
export async function findMaintenanceDue(db) {
  let veh = [];
  let eq = [];
  try {
    veh = (await db.execute(`
      SELECT r.label, r.interval_miles, r.interval_months, r.last_done_date, r.last_done_odometer,
             v.name AS unit_name, v.year, v.make, v.model, v.odometer AS odo
      FROM vehicle_reminders r JOIN vehicles v ON r.vehicle_id = v.id
      WHERE r.active = 1 AND v.status = 'active'`)).rows;
  } catch { veh = []; }
  try {
    eq = (await db.execute(`
      SELECT r.label, r.interval_months, r.last_done_date,
             e.name AS unit_name, e.make, e.model
      FROM equipment_reminders r JOIN equipment e ON r.equipment_id = e.id
      WHERE r.active = 1 AND e.status = 'active'`)).rows;
  } catch { eq = []; }

  const out = [];
  for (const r of veh) {
    const s = reminderStatus(r, r.odo);
    if (s.level === 'overdue' || s.level === 'soon') {
      out.push({ unit: r.unit_name || [r.year, r.make, r.model].filter(Boolean).join(' ') || 'Vehicle', label: r.label, level: s.level, due: reminderDueLabel(s) });
    }
  }
  for (const r of eq) {
    const s = reminderStatus(r, 0);
    if (s.level === 'overdue' || s.level === 'soon') {
      out.push({ unit: r.unit_name || [r.make, r.model].filter(Boolean).join(' ') || 'Equipment', label: r.label, level: s.level, due: reminderDueLabel(s) });
    }
  }
  out.sort((a, b) => (a.level === 'overdue' ? 0 : 1) - (b.level === 'overdue' ? 0 : 1));
  return out;
}

// Compliance tasks (calibration, fire, health, etc.) overdue or due within 30 days.
export async function findComplianceDue(db) {
  let rows = [];
  try {
    rows = (await db.execute(`
      SELECT c.label, c.next_due_date, l.name AS location_name
      FROM compliance_tasks c LEFT JOIN locations l ON c.location_id = l.id
      WHERE c.active = 1`)).rows;
  } catch { rows = []; }
  const out = [];
  for (const r of rows) {
    const s = complianceStatus(r);
    if (s.level === 'overdue' || s.level === 'soon') {
      out.push({ location: r.location_name || 'No location', label: r.label, level: s.level, due: complianceDueLabel(s) });
    }
  }
  out.sort((a, b) => (a.level === 'overdue' ? 0 : 1) - (b.level === 'overdue' ? 0 : 1));
  return out;
}

function lowStockSectionsHtml(groups) {
  return groups.map((g) => {
    const rows = g.items.map((it) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">
          <div style="font-weight:600;">${escapeHtml(it.item_name)}</div>
          ${it.part_number ? `<div style="font-family:monospace;font-size:12px;color:#64748b;">${escapeHtml(it.part_number)}</div>` : ''}
        </td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#dc2626;font-weight:700;">${it.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">${it.min_quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#dc2626;font-weight:700;">-${it.deficit}</td>
      </tr>`).join('');
    return `
    <div style="margin-bottom:20px;">
      <h2 style="font-size:16px;margin:0 0 8px;color:#0f172a;">${escapeHtml(g.location_name)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f1f5f9;text-align:left;">
          <th style="padding:8px;">Part</th><th style="padding:8px;text-align:center;">Current</th>
          <th style="padding:8px;text-align:center;">Threshold</th><th style="padding:8px;text-align:center;">Deficit</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');
}

function maintSectionHtml(due) {
  if (!due.length) return '';
  const rows = due.map((d) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(d.unit)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(d.label)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:${d.level === 'overdue' ? '#dc2626' : '#d97706'};font-weight:700;">${d.level === 'overdue' ? 'Overdue' : 'Due soon'} · ${escapeHtml(d.due)}</td>
    </tr>`).join('');
  return `
    <div style="margin-bottom:20px;">
      <h2 style="font-size:16px;margin:0 0 8px;color:#0f172a;">Maintenance due</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${rows}</tbody></table>
    </div>`;
}

function complianceSectionHtml(comp) {
  if (!comp.length) return '';
  const rows = comp.map((d) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(d.location)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(d.label)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:${d.level === 'overdue' ? '#dc2626' : '#d97706'};font-weight:700;">${d.level === 'overdue' ? 'Overdue' : 'Due soon'} · ${escapeHtml(d.due)}</td>
    </tr>`).join('');
  return `
    <div style="margin-bottom:20px;">
      <h2 style="font-size:16px;margin:0 0 8px;color:#0f172a;">Compliance due</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${rows}</tbody></table>
    </div>`;
}

export function renderDigestHtml(groups, due, comp = []) {
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
  const headBits = [];
  if (totalItems) headBits.push(`${totalItems} item${totalItems === 1 ? '' : 's'} low`);
  if (due.length) headBits.push(`${due.length} maintenance due`);
  if (comp.length) headBits.push(`${comp.length} compliance due`);
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="padding:18px 24px;background:#1e293b;color:#fff;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.9;">Daily Digest</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${headBits.join(' · ') || 'All clear'}</div>
    </div>
    <div style="padding:20px 24px;">
      ${totalItems ? lowStockSectionsHtml(groups) : ''}
      ${maintSectionHtml(due)}
      ${complianceSectionHtml(comp)}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;background:#f8fafc;">
      Sent automatically by the 23 Fuels Maintenance app.
    </div>
  </div>
</body></html>`;
}

export function renderDigestText(groups, due, comp = []) {
  const lines = [];
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
  if (totalItems) {
    lines.push(`LOW STOCK (${totalItems})`, '');
    for (const g of groups) {
      lines.push(g.location_name);
      for (const it of g.items) {
        const partLabel = it.part_number ? `${it.item_name} (${it.part_number})` : it.item_name;
        lines.push(`  - ${partLabel}: ${it.quantity}/${it.min_quantity} (deficit ${it.deficit})`);
      }
      lines.push('');
    }
  }
  if (due.length) {
    lines.push(`MAINTENANCE DUE (${due.length})`, '');
    for (const d of due) {
      lines.push(`  - ${d.unit} — ${d.label}: ${d.level === 'overdue' ? 'OVERDUE' : 'due soon'} ${d.due}`);
    }
    lines.push('');
  }
  if (comp.length) {
    lines.push(`COMPLIANCE DUE (${comp.length})`, '');
    for (const d of comp) {
      lines.push(`  - ${d.location} — ${d.label}: ${d.level === 'overdue' ? 'OVERDUE' : 'due soon'} ${d.due}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Shared send-and-audit routine used by both the cron and the run-now route.
// Returns { ok, skipped, status, count, providerId, errorMessage, durationMs }.
export async function runLowStockCheck(db, { trigger = 'cron', resend, fromAddress, toAddress }) {
  const start = Date.now();
  let status = 'error';
  let providerId = '';
  let errorMessage = '';
  let emailSent = 0;
  let count = 0;
  let skipped = false;
  let ok = false;

  try {
    const groups = await findLowStock(db);
    count = groups.reduce((s, g) => s + g.items.length, 0);
    const due = await findMaintenanceDue(db);
    const dueCount = due.length;
    const comp = await findComplianceDue(db);
    const compCount = comp.length;

    if (count === 0 && dueCount === 0 && compCount === 0) {
      status = 'skipped_none_low';
      skipped = true;
      ok = true;
    } else {
      const subjBits = [];
      if (count) subjBits.push(`${count} low stock`);
      if (dueCount) subjBits.push(`${dueCount} maintenance due`);
      if (compCount) subjBits.push(`${compCount} compliance due`);
      const subject = subjBits.join(' · ');
      const html = renderDigestHtml(groups, due, comp);
      const text = renderDigestText(groups, due, comp);
      // Best-effort push to subscribed devices (no-op if push isn't configured).
      try {
        await sendPushToAll(db, { title: 'Maintenance digest', body: subject, url: '/' });
      } catch (e) { /* never block the email/audit on push */ }
      try {
        const result = await resend.emails.send({
          from: fromAddress,
          to: toAddress,
          subject,
          html,
          text,
        });
        if (result.error) {
          status = 'send_failed';
          errorMessage = result.error.message || JSON.stringify(result.error);
        } else {
          status = 'sent';
          emailSent = 1;
          providerId = result.data?.id || '';
          ok = true;
        }
      } catch (e) {
        status = 'send_failed';
        errorMessage = e.message || 'Unknown send error';
      }
    }
  } catch (e) {
    errorMessage = e.message || 'Unknown error';
  }

  const durationMs = Date.now() - start;

  // Audit log — always written.
  await db.execute({
    sql: `INSERT INTO cron_runs
            (job_name, trigger, status, low_stock_count, email_sent,
             provider_id, error_message, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ['low_stock_alerts', trigger, status, count, emailSent, providerId, errorMessage, durationMs],
  });

  return { ok, skipped, status, count, providerId, errorMessage, durationMs };
}

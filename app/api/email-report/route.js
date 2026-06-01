import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getDb } from '@/lib/db';

const FROM_ADDRESS = process.env.RESEND_FROM || 'onboarding@resend.dev';
const TO_ADDRESS = process.env.REPAIR_REPORT_EMAIL || 'andrew@national9.com';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoney(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function renderHtml(repair) {
  const rows = repair.items.map(it => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;">
        <div style="font-weight:600;">${escapeHtml(it.item_name)}</div>
        ${it.part_number ? `<div style="font-family:monospace;font-size:12px;color:#64748b;">${escapeHtml(it.part_number)}</div>` : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#475569;">${escapeHtml(it.source_location_name)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmtMoney(it.unit_cost)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${fmtMoney(it.quantity * it.unit_cost)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="padding:20px 24px;background:#1e40af;color:#fff;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.8;">Repair Report</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">Repair #${repair.id} &mdash; ${escapeHtml(repair.location_name)}</div>
      <div style="font-size:14px;opacity:0.9;margin-top:4px;">${escapeHtml(repair.repair_date)}${repair.pump_number ? ` &middot; Pump ${repair.pump_number}` : ''}</div>
    </div>
    <div style="padding:20px 24px;">
      ${repair.description ? `<p style="margin:0 0 12px;"><strong>Description:</strong> ${escapeHtml(repair.description)}</p>` : ''}
      ${repair.notes ? `<p style="margin:0 0 16px;color:#475569;"><strong>Notes:</strong> ${escapeHtml(repair.notes)}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
        <thead>
          <tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:8px;">Part</th>
            <th style="padding:8px;">Source</th>
            <th style="padding:8px;text-align:center;">Qty</th>
            <th style="padding:8px;text-align:right;">Unit</th>
            <th style="padding:8px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:12px 8px;text-align:right;font-weight:700;font-size:16px;">Total</td>
            <td style="padding:12px 8px;text-align:right;font-weight:700;font-size:16px;">${fmtMoney(repair.total_cost)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;background:#f8fafc;">
      Generated automatically when this repair was closed.
    </div>
  </div>
</body></html>`;
}

function renderText(repair) {
  const lines = [
    `Repair #${repair.id} - ${repair.location_name}`,
    `Date: ${repair.repair_date}${repair.pump_number ? ` - Pump ${repair.pump_number}` : ''}`,
    '',
  ];
  if (repair.description) lines.push(`Description: ${repair.description}`);
  if (repair.notes) lines.push(`Notes: ${repair.notes}`);
  lines.push('', 'Parts used:');
  for (const it of repair.items) {
    lines.push(`  - ${it.item_name}${it.part_number ? ` (${it.part_number})` : ''} from ${it.source_location_name} - ${it.quantity} x ${fmtMoney(it.unit_cost)} = ${fmtMoney(it.quantity * it.unit_cost)}`);
  }
  lines.push('', `Total: ${fmtMoney(repair.total_cost)}`);
  return lines.join('\n');
}

async function loadRepair(db, repairId) {
  const repairRow = (await db.execute({
    sql: `SELECT r.*, l.name AS location_name
          FROM repairs r JOIN locations l ON r.location_id = l.id
          WHERE r.id = ?`,
    args: [repairId],
  })).rows[0];
  if (!repairRow) return null;

  const items = (await db.execute({
    sql: `SELECT ri.*, it.name AS item_name, it.part_number, it.unit,
                 sl.name AS source_location_name
          FROM repair_items ri
          JOIN items it ON ri.item_id = it.id
          JOIN locations sl ON ri.source_location_id = sl.id
          WHERE ri.repair_id = ?`,
    args: [repairId],
  })).rows;

  const total_cost = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0);
  return { ...repairRow, items, total_cost };
}

export async function POST(request) {
  const db = await getDb();
  const body = await request.json().catch(() => ({}));
  const repairId = Number(body.repair_id);
  const recipient = body.to || TO_ADDRESS;

  if (!repairId) {
    return NextResponse.json({ error: 'repair_id is required' }, { status: 400 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 });
  }

  const repair = await loadRepair(db, repairId);
  if (!repair) {
    return NextResponse.json({ error: 'Repair not found' }, { status: 404 });
  }

  const subject = `Repair #${repair.id} - ${repair.location_name} - ${fmtMoney(repair.total_cost)}`;
  const html = renderHtml(repair);
  const text = renderText(repair);

  const resend = new Resend(process.env.RESEND_API_KEY);
  let providerId = '';
  let success = false;
  let errorMessage = '';

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipient,
      subject,
      html,
      text,
    });
    if (result.error) {
      errorMessage = result.error.message || JSON.stringify(result.error);
    } else {
      success = true;
      providerId = result.data?.id || '';
    }
  } catch (e) {
    errorMessage = e.message || 'Unknown send error';
  }

  // Audit log - always written, even on failure.
  await db.execute({
    sql: `INSERT INTO repair_emails (repair_id, sent_to, success, provider_id, error_message)
          VALUES (?, ?, ?, ?, ?)`,
    args: [repairId, recipient, success ? 1 : 0, providerId, errorMessage],
  });

  if (!success) {
    return NextResponse.json({ error: errorMessage || 'Email send failed' }, { status: 502 });
  }

  // Mark repair as closed only on a successful send.
  await db.execute({
    sql: `UPDATE repairs SET status = 'closed', closed_at = datetime('now') WHERE id = ?`,
    args: [repairId],
  });

  return NextResponse.json({ ok: true, provider_id: providerId, sent_to: recipient });
}

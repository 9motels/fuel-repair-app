import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getDb } from '@/lib/db';
import { buildReportData } from '@/lib/reportData';
import { renderReportPdf } from '@/lib/reportPdf';

export const runtime = 'nodejs';
export const maxDuration = 30;

const FROM_ADDRESS = process.env.RESEND_FROM || 'onboarding@resend.dev';
const TO_ADDRESS =
  process.env.REPORTS_REPORT_EMAIL ||
  process.env.REPAIR_REPORT_EMAIL ||
  'andrew@national9.com';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

function renderHtml(data) {
  const { totals, by_location, top_parts, by_pump, by_month, filters } = data;
  const card = (label, value) => `
    <td style="padding:10px;border:1px solid #e2e8f0;border-radius:6px;width:25%;vertical-align:top;">
      <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
      <div style="font-size:18px;font-weight:700;margin-top:4px;">${value}</div>
    </td>`;

  const tableRows = (rows, render) => rows.length
    ? rows.map(render).join('')
    : `<tr><td colspan="4" style="padding:8px;color:#94a3b8;">No data in range</td></tr>`;

  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
    <div style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="padding:18px 24px;background:#1e40af;color:#fff;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.9;">Repair Summary Report</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(filters.from)} → ${escapeHtml(filters.to)}</div>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-spacing:8px;border-collapse:separate;">
          <tr>
            ${card('Total Spend', fmt(totals.spend))}
            ${card('Parts Cost', fmt(totals.parts_cost))}
            ${card('Closed', totals.repairs_closed)}
            ${card('Open', totals.repairs_open)}
          </tr>
        </table>

        <h2 style="font-size:14px;margin:18px 0 6px;">Spend by Location</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:6px;">Location</th>
            <th style="padding:6px;text-align:center;">Repairs</th>
            <th style="padding:6px;text-align:right;">Total</th>
          </tr></thead>
          <tbody>
            ${tableRows(by_location, (r) => `
              <tr><td style="padding:6px;border-bottom:1px solid #e2e8f0;">${escapeHtml(r.location_name)}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.repair_count}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${fmt(r.total_cost)}</td></tr>
            `)}
          </tbody>
        </table>

        <h2 style="font-size:14px;margin:18px 0 6px;">Top 10 Parts by Cost</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:6px;">Part</th>
            <th style="padding:6px;text-align:center;">Qty</th>
            <th style="padding:6px;text-align:right;">Total</th>
          </tr></thead>
          <tbody>
            ${tableRows(top_parts, (p) => `
              <tr><td style="padding:6px;border-bottom:1px solid #e2e8f0;">
                <div style="font-weight:600;">${escapeHtml(p.item_name)}</div>
                ${p.part_number ? `<div style="font-family:monospace;font-size:11px;color:#64748b;">${escapeHtml(p.part_number)}</div>` : ''}
              </td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;">${p.total_qty}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${fmt(p.total_cost)}</td></tr>
            `)}
          </tbody>
        </table>

        ${by_pump.length > 0 ? `
        <h2 style="font-size:14px;margin:18px 0 6px;">Cost per Pump</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:6px;">Location</th>
            <th style="padding:6px;text-align:center;">Pump</th>
            <th style="padding:6px;text-align:center;">Repairs</th>
            <th style="padding:6px;text-align:right;">Total</th>
          </tr></thead>
          <tbody>
            ${by_pump.map((r) => `
              <tr><td style="padding:6px;border-bottom:1px solid #e2e8f0;">${escapeHtml(r.location_name)}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.pump_number}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.repair_count}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${fmt(r.total_cost)}</td></tr>
            `).join('')}
          </tbody>
        </table>` : ''}

        <h2 style="font-size:14px;margin:18px 0 6px;">Monthly Trend</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:6px;">Month</th>
            <th style="padding:6px;text-align:center;">Repairs</th>
            <th style="padding:6px;text-align:right;">Total</th>
          </tr></thead>
          <tbody>
            ${tableRows(by_month, (r) => `
              <tr><td style="padding:6px;border-bottom:1px solid #e2e8f0;">${escapeHtml(r.month)}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.repair_count}</td>
              <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${fmt(r.total_cost)}</td></tr>
            `)}
          </tbody>
        </table>
      </div>
      <div style="padding:12px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;background:#f8fafc;">
        Full report attached as PDF.
      </div>
    </div>
  </body></html>`;
}

export async function POST(request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 });
  }
  const db = await getDb();
  const body = await request.json().catch(() => ({}));
  const recipient = body.to || TO_ADDRESS;

  const data = await buildReportData(db, {
    from: body.from,
    to: body.to,
    locationIds: body.location_ids,
  });

  const subject = `Fuel Repair Report ${data.filters.from} to ${data.filters.to} - ${fmt(data.totals.spend)}`;
  const html = renderHtml(data);

  let pdfAttachment = null;
  try {
    const pdfBuffer = await renderReportPdf(data, { generatedAt: new Date().toISOString().slice(0, 10) });
    pdfAttachment = {
      filename: `fuel-report-${data.filters.from}_to_${data.filters.to}.pdf`,
      content: pdfBuffer,
    };
  } catch (e) {
    console.error('Report PDF render failed', e);
  }

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
      ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
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

  await db.execute({
    sql: `INSERT INTO report_emails
            (sent_to, date_from, date_to, location_ids, success,
             provider_id, error_message, total_spend, repair_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      recipient,
      data.filters.from,
      data.filters.to,
      (data.filters.location_ids || []).join(','),
      success ? 1 : 0,
      providerId,
      errorMessage,
      data.totals.spend,
      data.totals.repairs_closed + data.totals.repairs_open,
    ],
  });

  if (!success) {
    return NextResponse.json({ error: errorMessage || 'Email send failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, provider_id: providerId, sent_to: recipient });
}

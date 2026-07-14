import { getDb } from '@/lib/db';
import {
  getClient,
  MODEL,
  buildTroubleshootSystem,
  toAnthropicMessages,
  friendlyError,
} from '@/lib/equipmentAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// POST { equipmentId, conversationId, messages } -> streamed plain-text reply.
// Grounds in the equipment + its maintenance history (read fresh from the DB),
// and persists the latest user message + the assistant reply to the conversation.
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, 500);
  }
  const body = await request.json();
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = toAnthropicMessages(rawMessages);
  if (messages.length === 0) {
    return json({ error: 'At least one user message is required.' }, 400);
  }

  const db = await getDb();

  // Ground from the DB so the prompt always reflects current details + history.
  let equipment = body.equipment;
  let logs = body.logs;
  let repairs = body.repairs;
  let manuals = []; // [{ name, url }] attached to the machine
  if (body.equipmentId) {
    const eq = (
      await db.execute({
        sql: `SELECT e.*, l.name AS location_name FROM equipment e
              JOIN locations l ON e.location_id = l.id WHERE e.id = ?`,
        args: [body.equipmentId],
      })
    ).rows[0];
    if (eq) {
      equipment = {
        name: eq.name,
        category: eq.category,
        make: eq.make,
        model: eq.model,
        serial: eq.serial,
        location: eq.location_name,
        description: eq.description,
      };
      logs = (
        await db.execute({
          sql: `SELECT ml.*, p.name AS performed_by_name FROM maintenance_logs ml
                LEFT JOIN people p ON ml.performed_by_id = p.id
                WHERE ml.equipment_id = ? ORDER BY ml.performed_at DESC, ml.created_at DESC`,
          args: [body.equipmentId],
        })
      ).rows.map((l) => ({
        performed_at: l.performed_at,
        work_type: l.work_type,
        performed_by: l.performed_by_name,
        notes: l.notes,
      }));
      const repairRows = (
        await db.execute({
          sql: `SELECT r.* FROM repairs r
                WHERE r.equipment_id = ? ORDER BY r.repair_date DESC, r.created_at DESC`,
          args: [body.equipmentId],
        })
      ).rows;
      repairs = [];
      for (const r of repairRows) {
        const items = (
          await db.execute({
            sql: `SELECT ri.quantity, it.name as item_name
                  FROM repair_items ri JOIN items it ON ri.item_id = it.id
                  WHERE ri.repair_id = ?`,
            args: [r.id],
          })
        ).rows.map((i) => ({ item_name: i.item_name, quantity: i.quantity }));
        repairs.push({ repair_date: r.repair_date, description: r.description, items });
      }
      // Attach up to 3 manual PDFs so the model can cite the actual procedures.
      manuals = (
        await db.execute({
          sql: `SELECT name, url, content_type FROM equipment_documents
                WHERE equipment_id = ? AND kind = 'manual'
                ORDER BY created_at DESC LIMIT 3`,
          args: [body.equipmentId],
        })
      ).rows
        .filter((d) => /\.pdf($|\?)/i.test(d.url) || d.content_type === 'application/pdf')
        .map((d) => ({ name: d.name, url: d.url }));
    }
  }

  // Inject the manual PDFs as document blocks on the first user turn so the
  // model reads them alongside the question. (Re-sent each turn since the API
  // is stateless — kept to the first turn and capped to hold cost/latency down.)
  if (manuals.length && messages.length) {
    const first = messages[0];
    const baseContent = Array.isArray(first.content)
      ? first.content
      : [{ type: 'text', text: String(first.content || '') }];
    const docBlocks = manuals.map((m) => ({
      type: 'document',
      source: { type: 'url', url: m.url },
      title: m.name,
    }));
    messages[0] = { ...first, content: [...docBlocks, ...baseContent] };
  }

  // Persist the incoming user message (and set the conversation title on first use).
  const convId = body.conversationId;
  const lastUser = rawMessages[rawMessages.length - 1];
  if (convId && lastUser && lastUser.role === 'user') {
    const lastImages = Array.isArray(lastUser.images) ? lastUser.images.filter(Boolean) : [];
    const lastText = typeof lastUser.content === 'string' ? lastUser.content : '';
    try {
      await db.execute({
        sql: 'INSERT INTO troubleshoot_messages (conversation_id, role, content, images) VALUES (?, ?, ?, ?)',
        args: [convId, 'user', lastText, JSON.stringify(lastImages)],
      });
      const conv = (
        await db.execute({ sql: 'SELECT title FROM troubleshoot_conversations WHERE id = ?', args: [convId] })
      ).rows[0];
      if (conv && !conv.title) {
        await db.execute({
          sql: 'UPDATE troubleshoot_conversations SET title = ? WHERE id = ?',
          args: [(lastText || 'Photo diagnosis').slice(0, 60), convId],
        });
      }
      await db.execute({
        sql: "UPDATE troubleshoot_conversations SET updated_at = datetime('now') WHERE id = ?",
        args: [convId],
      });
    } catch (e) {
      console.error('persist user message failed:', e);
    }
  }

  const client = getClient();
  const encoder = new TextEncoder();
  let full = '';
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = client.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: 'adaptive' },
          system: buildTroubleshootSystem(equipment, logs, repairs, manuals.map((m) => m.name)),
          messages,
        });
        s.on('text', (delta) => {
          full += delta;
          controller.enqueue(encoder.encode(delta));
        });
        await s.finalMessage();
      } catch (err) {
        console.error('troubleshoot failed:', err);
        const msg = `\n[${friendlyError(err)}]`;
        full += msg;
        controller.enqueue(encoder.encode(msg));
      }
      // Persist the assistant reply before closing (kept alive by the awaits).
      if (convId && full.trim()) {
        try {
          await db.execute({
            sql: 'INSERT INTO troubleshoot_messages (conversation_id, role, content) VALUES (?, ?, ?)',
            args: [convId, 'assistant', full],
          });
        } catch (e) {
          console.error('persist assistant message failed:', e);
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

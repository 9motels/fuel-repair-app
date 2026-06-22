import { getDb } from '@/lib/db';
import {
  getClient,
  MODEL,
  buildTroubleshootSystem,
  normalizeMessages,
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
  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    return json({ error: 'At least one user message is required.' }, 400);
  }

  const db = await getDb();

  // Ground from the DB so the prompt always reflects current details + history.
  let equipment = body.equipment;
  let logs = body.logs;
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
    }
  }

  // Persist the incoming user message (and set the conversation title on first use).
  const convId = body.conversationId;
  const lastUser = messages[messages.length - 1];
  if (convId && lastUser?.role === 'user') {
    try {
      await db.execute({
        sql: 'INSERT INTO troubleshoot_messages (conversation_id, role, content) VALUES (?, ?, ?)',
        args: [convId, 'user', lastUser.content],
      });
      const conv = (
        await db.execute({ sql: 'SELECT title FROM troubleshoot_conversations WHERE id = ?', args: [convId] })
      ).rows[0];
      if (conv && !conv.title) {
        await db.execute({
          sql: 'UPDATE troubleshoot_conversations SET title = ? WHERE id = ?',
          args: [lastUser.content.slice(0, 60), convId],
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
          system: buildTroubleshootSystem(equipment, logs),
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

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

// POST { equipment, logs, messages } -> streamed plain-text reply
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, 500);
  }
  const body = await request.json();
  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    return json({ error: 'At least one user message is required.' }, 400);
  }

  const client = getClient();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = client.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: 'adaptive' },
          system: buildTroubleshootSystem(body.equipment, body.logs),
          messages,
        });
        s.on('text', (delta) => controller.enqueue(encoder.encode(delta)));
        await s.finalMessage();
        controller.close();
      } catch (err) {
        console.error('equipment troubleshoot failed:', err);
        // Stream already open — surface a readable message rather than a hard fail.
        controller.enqueue(encoder.encode(`\n[${friendlyError(err)}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

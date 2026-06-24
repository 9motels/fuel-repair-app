import { getDb } from '@/lib/db';
import { getClient, MODEL, toAnthropicMessages, friendlyError } from '@/lib/equipmentAi';
import { buildVehicleTroubleshootSystem } from '@/lib/vehicleAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// POST { vehicleId, messages } -> streamed plain-text reply, grounded in the
// vehicle + its service history (read fresh from the DB).
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'AI isn’t set up yet — ANTHROPIC_API_KEY is missing.' }, 500);
  }
  const body = await request.json();
  const messages = toAnthropicMessages(Array.isArray(body.messages) ? body.messages : []);
  if (messages.length === 0) {
    return json({ error: 'At least one user message is required.' }, 400);
  }

  const db = await getDb();
  let vehicle = body.vehicle;
  let logs = body.logs;
  if (body.vehicleId) {
    const v = (
      await db.execute({
        sql: `SELECT v.*, l.name AS location_name FROM vehicles v
              JOIN locations l ON v.location_id = l.id WHERE v.id = ?`,
        args: [body.vehicleId],
      })
    ).rows[0];
    if (v) {
      vehicle = {
        name: v.name,
        vehicle_type: v.vehicle_type,
        year: v.year,
        make: v.make,
        model: v.model,
        vin: v.vin,
        plate: v.plate,
        odometer: v.odometer,
        location: v.location_name,
        description: v.description,
      };
      logs = (
        await db.execute({
          sql: `SELECT vsl.*, p.name AS performed_by_name FROM vehicle_service_logs vsl
                LEFT JOIN people p ON vsl.performed_by_id = p.id
                WHERE vsl.vehicle_id = ? ORDER BY vsl.performed_at DESC, vsl.created_at DESC`,
          args: [body.vehicleId],
        })
      ).rows.map((l) => ({
        performed_at: l.performed_at,
        service_type: l.service_type,
        odometer: l.odometer,
        performed_by: l.performed_by_name,
        notes: l.notes,
      }));
    }
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
          system: buildVehicleTroubleshootSystem(vehicle, logs),
          messages,
        });
        s.on('text', (delta) => controller.enqueue(encoder.encode(delta)));
        await s.finalMessage();
      } catch (err) {
        console.error('vehicle troubleshoot failed:', err);
        controller.enqueue(encoder.encode(`\n[${friendlyError(err)}]`));
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

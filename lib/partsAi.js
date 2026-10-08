import { getClient, MODEL, webSearchJson } from '@/lib/equipmentAi';

export const PART_STATUSES = ['needs_research', 'ready_to_order', 'ordered', 'received', 'installed', 'cancelled'];

export const PART_STATUS_LABEL = {
  needs_research: 'Needs research',
  ready_to_order: 'Ready to order',
  ordered: 'Ordered',
  received: 'Received — awaiting install',
  installed: 'Installed',
  cancelled: 'Cancelled',
};

// Open = still needs attention (not resolved).
export const PART_OPEN_STATUSES = ['needs_research', 'ready_to_order', 'ordered', 'received'];

// Research a part need via web search: candidate sources + buy links + the
// compatibility questions that must be answered before ordering. Reuses the
// shared webSearchJson helper (basic web_search, no json_schema — citations).
export async function researchPart({ description, equipmentLabel, locationName }) {
  const system =
    `You help a gas-station maintenance tech identify and source a replacement part using web search. ` +
    `Return candidate parts with DIRECT buy links (manufacturer, authorized distributor, or reputable retailer) and the OEM/vendor part number when you can confirm it. ` +
    `Crucially, list any UNRESOLVED COMPATIBILITY QUESTIONS the tech must answer before ordering (voltage, dimensions, serial/model range, left vs right, refrigerant, etc.). ` +
    `Never invent a part number or URL.`;
  const prompt =
    `Need: ${description}\n` +
    `Equipment: ${equipmentLabel || '(unspecified)'}${locationName ? ` @ ${locationName}` : ''}.\n\n` +
    `Find the right part(s) and where to buy. Respond with ONLY JSON (no prose, no fences):\n` +
    `{"candidates":[{"name":"","part_number":"","vendor":"","url":"https://...","price":"","fits_note":""}],"compat_questions":["..."],"note":""}\n` +
    `Up to 5 candidates, best first. If compatibility can't be confirmed from what's given, put the specific questions in compat_questions (else []).`;
  const data = await webSearchJson({ system, prompt, maxUses: 3 });
  const candidates = (Array.isArray(data.candidates) ? data.candidates : [])
    .filter((c) => c && typeof c.url === 'string' && /^https?:\/\//i.test(c.url))
    .slice(0, 5)
    .map((c) => ({
      name: String(c.name || '').slice(0, 200),
      part_number: String(c.part_number || '').slice(0, 80),
      vendor: String(c.vendor || '').slice(0, 120),
      url: c.url,
      price: String(c.price || '').slice(0, 40),
      fits_note: String(c.fits_note || '').slice(0, 300),
    }));
  const compat_questions = (Array.isArray(data.compat_questions) ? data.compat_questions : [])
    .map((q) => String(q || '').slice(0, 300))
    .filter(Boolean)
    .slice(0, 8);
  return { candidates, compat_questions, note: String(data.note || '').slice(0, 400) };
}

const DELIVERY_SCHEMA = {
  type: 'object',
  properties: {
    supplier: { type: 'string', description: 'Seller / shipper name, or empty' },
    order_number: { type: 'string', description: 'Order / PO / invoice number, or empty' },
    tracking_number: { type: 'string', description: 'Tracking number, or empty' },
    date: { type: 'string', description: 'Date on the slip (YYYY-MM-DD if possible), or empty' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: ['integer', 'null'] },
          part_number: { type: 'string' },
        },
        required: ['description', 'quantity', 'part_number'],
        additionalProperties: false,
      },
    },
  },
  required: ['supplier', 'order_number', 'tracking_number', 'date', 'items'],
  additionalProperties: false,
};

// Read a packing slip / order confirmation photo into structured order data.
export async function extractDelivery({ imageUrl }) {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: DELIVERY_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          {
            type: 'text',
            text: 'This is a packing slip or order confirmation for a part. Extract the order/PO/invoice number, supplier, tracking number, date, and line items. Use empty string or null where a field is absent — never guess.',
          },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') {
    const e = new Error('The model declined to read this image.');
    e.status = 422;
    throw e;
  }
  const text = response.content.find((b) => b.type === 'text')?.text || '';
  return JSON.parse(text);
}

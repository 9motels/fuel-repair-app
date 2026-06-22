// Shared helpers for the equipment AI routes (identify + troubleshoot).
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-4-8';

export const CATEGORIES = [
  'Refrigeration',
  'Fuel dispenser',
  'POS',
  'Networking',
  'HVAC',
  'Signage',
  'Other',
];

export function getClient() {
  return new Anthropic();
}

// ---- Photo identify (Claude vision + structured output) -------------------

export const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: {
      type: 'string',
      description:
        'Short friendly label for the machine, e.g. "Gilbarco Encore pump" or "Walk-in cooler compressor". Empty string if not determinable.',
    },
    category: { type: 'string', enum: CATEGORIES, description: 'Best-fit category.' },
    make: { type: 'string', description: 'Manufacturer / brand. Empty if not visible.' },
    model: { type: 'string', description: 'Model number or name. Empty if not visible.' },
    serial: { type: 'string', description: 'Serial number. Empty if not visible.' },
    description: {
      type: 'string',
      description:
        'One or two sentences: what this equipment is and any useful detail read from the plate (voltage, capacity, part numbers).',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['name', 'category', 'make', 'model', 'serial', 'description', 'confidence'],
};

export const EXTRACT_SYSTEM = `You identify equipment from a photo of its nameplate, label, or the unit itself.
Read the make, model, and serial exactly as printed — do not guess characters you cannot see; leave a field as an empty string when it is not legible.
Use the categories provided. When unsure of the category, use "Other".
Keep the description factual and useful for later troubleshooting and parts lookup.`;

// ---- Troubleshooting chat --------------------------------------------------

function fmtEquipment(e = {}) {
  const lines = [
    e.name && `Name: ${e.name}`,
    e.category && `Category: ${e.category}`,
    e.make && `Make: ${e.make}`,
    e.model && `Model: ${e.model}`,
    e.serial && `Serial: ${e.serial}`,
    e.location && `Location: ${e.location}`,
    e.description && `Description: ${e.description}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : '(no details recorded)';
}

function fmtLogs(logs = []) {
  if (!Array.isArray(logs) || logs.length === 0) return '(no maintenance history recorded)';
  return logs
    .map((l) => {
      const when = l.performed_at || '';
      const who = l.performed_by ? ` by ${l.performed_by}` : '';
      const type = l.work_type ? ` [${l.work_type}]` : '';
      return `- ${when}${type}${who}: ${l.notes || ''}`.trim();
    })
    .join('\n');
}

export function buildTroubleshootSystem(equipment, logs) {
  return `You are a hands-on maintenance assistant helping a field technician who manages convenience-store and fuel equipment. You are helping with one specific machine.

EQUIPMENT
${fmtEquipment(equipment)}

MAINTENANCE HISTORY (most recent first)
${fmtLogs(logs)}

Guidance:
- Use the equipment details and history above. Reference past work when relevant ("the compressor was replaced in March, so...").
- Give practical, step-by-step troubleshooting. Lead with the most likely cause and the safest first check.
- Call out any safety concern (electrical, fuel, refrigerant, pressurized systems) before steps that involve it.
- When suggesting parts, give the part type and how to confirm the exact part for this make/model (e.g. where the part number is stamped) rather than inventing a part number.
- If the user attaches photos (e.g. a fault, a leak, a display, or an error/fault code), read them carefully — transcribe any error code or label text and factor it into your diagnosis.
- If a detail you need isn't recorded, say what to check on the unit. Be concise and direct.`;
}

// Chat history arrives as [{ role:'user'|'assistant', content:string }]. Keep
// only those roles, drop empties, ensure it starts with a user turn.
export function normalizeMessages(messages) {
  const cleaned = (Array.isArray(messages) ? messages : [])
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim()
    )
    .map((m) => ({ role: m.role, content: m.content }));
  while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();
  return cleaned;
}

// Build Anthropic message params from chat messages. User messages may carry
// `images` (array of public URLs) which become image blocks for vision.
export function toAnthropicMessages(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const text = typeof m.content === 'string' ? m.content.trim() : '';
    const images = Array.isArray(m.images)
      ? m.images.filter((u) => typeof u === 'string' && u)
      : [];
    if (m.role === 'assistant') {
      if (text) out.push({ role: 'assistant', content: text });
      continue;
    }
    if (!text && images.length === 0) continue;
    if (images.length > 0) {
      const content = images.map((url) => ({ type: 'image', source: { type: 'url', url } }));
      content.push({ type: 'text', text: text || 'What does this photo show? Help me diagnose it.' });
      out.push({ role: 'user', content });
    } else {
      out.push({ role: 'user', content: text });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// Turn raw Anthropic/SDK errors into a calm, actionable message for the UI.
export function friendlyError(err) {
  const msg = err?.message || '';
  const status = err?.status;
  const type = err?.type;
  if (type === 'authentication_error' || status === 401) {
    return 'AI isn’t set up yet — the Anthropic API key is missing or invalid.';
  }
  if (type === 'billing_error' || status === 402 || /credit balance/i.test(msg)) {
    return 'AI features need Anthropic API credits. Add credits to your Anthropic org to enable photo identify and troubleshooting.';
  }
  return msg || 'AI request failed.';
}

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

// ---- Maintenance plan (suggest service intervals from make/model) ----------

export const EQUIP_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intervals: {
      type: 'array',
      description: 'Recommended recurring maintenance tasks for this equipment.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', description: 'Task, e.g. "Replace fuel filter" or "Clean condenser coils".' },
          interval_months: { type: 'integer', description: 'How often, in months (use 1 for monthly, 12 for yearly).' },
          notes: { type: 'string', description: 'Parts/consumables, spec, or how-to hint. Empty if none.' },
        },
        required: ['label', 'interval_months', 'notes'],
      },
    },
    summary: { type: 'string', description: 'One or two sentences of overall guidance/caveats.' },
  },
  required: ['intervals', 'summary'],
};

export const EQUIP_PLAN_SYSTEM = `You are a facilities/equipment maintenance expert for convenience stores and fuel sites. Given a piece of equipment, propose a practical preventive-maintenance schedule based on the manufacturer's typical recommendations (owner's/service manual) for that make/model and category.
- Suggest the recurring tasks that actually apply to this kind of unit (e.g. refrigeration: clean condenser coils, check refrigerant/temps, replace water/air filters; fuel dispenser: replace fuel filters, check hoses/nozzles/breakaways, calibration; HVAC: filters, coils, belts; air compressor: oil, filters, drain tank; printers: clean head/rollers).
- Give each a realistic interval in months. Keep the list focused (5-10 of the most important items), not exhaustive.
- In notes, name the consumable/part type or spec where helpful, but do NOT invent exact OEM part numbers you aren't sure of.
- These are estimates from typical schedules — say in the summary that they should be confirmed against the unit's manual. Be concise and practical.`;

export function buildEquipPlanPrompt(equipment = {}) {
  const lines = [
    equipment.name && `Name: ${equipment.name}`,
    equipment.category && `Category: ${equipment.category}`,
    equipment.make && `Make: ${equipment.make}`,
    equipment.model && `Model: ${equipment.model}`,
    equipment.serial && `Serial: ${equipment.serial}`,
    equipment.description && `Details: ${equipment.description}`,
  ].filter(Boolean).join('\n');
  return `Propose a preventive-maintenance schedule for this equipment:\n\n${lines || '(few details recorded)'}\n\nReturn the recurring tasks with how often (in months) and a short note on parts/consumables.`;
}

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

function fmtRepairs(repairs = []) {
  if (!Array.isArray(repairs) || repairs.length === 0) return '(no repairs recorded)';
  return repairs
    .map((r) => {
      const when = r.repair_date || '';
      const what = r.description || 'Repair';
      const parts = Array.isArray(r.items) && r.items.length
        ? ` — parts: ${r.items.map((i) => `${i.item_name} x${i.quantity}`).join(', ')}`
        : '';
      return `- ${when}: ${what}${parts}`.trim();
    })
    .join('\n');
}

export function buildTroubleshootSystem(equipment, logs, repairs, manualNames = []) {
  const manualsSection = manualNames.length
    ? `

MANUALS ATTACHED
The following manufacturer document(s) for this machine are attached to this conversation as PDFs: ${manualNames.join('; ')}. Read them and ground your answers in them.`
    : '';
  return `You are a hands-on maintenance assistant helping a field technician who manages convenience-store and fuel equipment. You are helping with one specific machine.

EQUIPMENT
${fmtEquipment(equipment)}

MAINTENANCE HISTORY (most recent first)
${fmtLogs(logs)}

REPAIRS (parts replaced, most recent first)
${fmtRepairs(repairs)}${manualsSection}

Guidance:
- Use the equipment details and history above. Reference past work when relevant ("the compressor was replaced in March, so...").
- If a manual is attached, prefer its procedures, specs, and part numbers over general knowledge, and cite the section/page when you pull a figure or step from it.
- Give practical, step-by-step troubleshooting. Lead with the most likely cause and the safest first check.
- Call out any safety concern (electrical, fuel, refrigerant, pressurized systems) before steps that involve it.
- When suggesting parts, give the part type and how to confirm the exact part for this make/model (e.g. where the part number is stamped). Only cite a specific part number if it's in the attached manual or the machine's records — don't invent one.
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

// Best-effort JSON extraction from a model's text answer (it may wrap the JSON
// in prose or a ```json fence when we can't force output_config — see below).
function extractJson(text) {
  if (!text) return null;
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

// Run a web-search-grounded request that returns JSON. We deliberately DON'T use
// output_config json_schema here: web search attaches citations to the reply, and
// citations + json_schema is a 400. So we ask for strict JSON in the text and parse
// it tolerantly. Handles the server tool loop's pause_turn with a small resume cap.
export async function webSearchJson({ system, prompt, maxUses = 4, maxResumes = 1 }) {
  const client = getClient();
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxUses }];
  let messages = [{ role: 'user', content: prompt }];
  let response;
  for (let i = 0; i <= maxResumes; i++) {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 3072,
      // Low effort keeps the search snappy — this is retrieval, not deep
      // reasoning — so the whole call stays under the serverless time limit.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system,
      tools,
      messages,
    });
    if (response.stop_reason === 'refusal') {
      const e = new Error('The model declined this search.');
      e.status = 422;
      throw e;
    }
    if (response.stop_reason === 'pause_turn') {
      messages = [...messages, { role: 'assistant', content: response.content }];
      continue;
    }
    break;
  }
  const text = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = extractJson(text);
  if (!parsed) {
    const e = new Error('Could not read the search results. Try again.');
    e.status = 502;
    throw e;
  }
  return parsed;
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

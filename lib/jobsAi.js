import { getClient, MODEL } from '@/lib/equipmentAi';

export const JOB_STATUSES = ['new', 'scheduled', 'waiting_parts', 'waiting_contractor', 'completed'];
export const JOB_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export const STATUS_LABEL = {
  new: 'New',
  scheduled: 'Scheduled',
  waiting_parts: 'Waiting for Parts',
  waiting_contractor: 'Waiting for Contractor',
  completed: 'Completed',
};

export const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

// Structured-output schema for turning a plain-language capture into a draft job
// + work update. Nullable numbers use ["number","null"] so "unknown" stays unknown.
const STRUCTURE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short job title, e.g. "Back cooler not cooling"' },
    location_id: { type: ['integer', 'null'], description: 'Matched station id, or null if unclear' },
    location_guess: { type: 'string', description: 'The station as the note names it (for display)' },
    equipment_id: { type: ['integer', 'null'], description: 'Matched equipment id, or null' },
    equipment_guess: { type: 'string', description: 'The equipment as the note names it' },
    equipment_ambiguous: { type: 'boolean', description: 'True if equipment is named but matches more than one record or is uncertain' },
    problem: { type: 'string', description: 'The reported problem / symptom, if any' },
    work_performed: { type: 'string', description: 'What was actually done this visit, concise and faithful' },
    minutes: { type: ['integer', 'null'], description: 'Time spent in minutes if stated, else null' },
    minutes_estimated: { type: 'boolean', description: 'True if time was approximate ("about", "roughly")' },
    cost: { type: ['number', 'null'], description: 'Cash cost in dollars if stated, else null (NOT zero)' },
    cost_note: { type: 'string', description: 'Any note about cost, e.g. "no parts"' },
    status: { type: 'string', enum: JOB_STATUSES },
    priority: { type: 'string', enum: JOB_PRIORITIES },
    next_action: { type: 'string', description: 'The follow-up / next action, e.g. "Check tomorrow"' },
  },
  required: [
    'title', 'location_id', 'location_guess', 'equipment_id', 'equipment_guess',
    'equipment_ambiguous', 'problem', 'work_performed', 'minutes', 'minutes_estimated',
    'cost', 'cost_note', 'status', 'priority', 'next_action',
  ],
  additionalProperties: false,
};

function buildSystem(locations, equipment) {
  const locLines = locations.map((l) => `  ${l.id} — ${l.name}`).join('\n') || '  (none)';
  const eqLines =
    equipment
      .map((e) => {
        const mm = [e.make, e.model].filter(Boolean).join(' ');
        return `  ${e.id} — ${e.name || mm || 'equipment'}${mm && e.name ? ` (${mm})` : ''} @ ${e.location_name || '?'}`;
      })
      .join('\n') || '  (none)';
  return `You convert a field technician's short, plain-language repair/maintenance note into a structured draft. The tech manages four gas stations and fixes refrigeration, pumps, IT, handhelds, cameras, and other equipment.

STATIONS (match by id):
${locLines}

EQUIPMENT (match by id; may be incomplete):
${eqLines}

Rules:
- Match the station to a STATIONS id when the note clearly names one; else location_id = null and put what it said in location_guess.
- Match equipment to an EQUIPMENT id only when you're confident. If the note names equipment that matches more than one record, or you're unsure, set equipment_ambiguous = true and equipment_id = null. If no equipment is mentioned, equipment_ambiguous = false and equipment_id = null.
- NEVER invent a cost or a time. If time isn't stated, minutes = null. If cost isn't stated, cost = null (never 0). "No parts" is a cost_note, not a zero cost.
- If time is approximate ("about 45 min", "roughly an hour"), set minutes_estimated = true.
- work_performed: faithfully summarize what was done; don't add steps that weren't described.
- status: infer from the note (a finished fix = completed; "need to order a part" = waiting_parts; "waiting on the tech" = waiting_contractor; a scheduled visit = scheduled; otherwise new).
- priority: normal unless the note signals urgency (down equipment, safety, "ASAP") → high/urgent, or clearly minor → low.
- next_action: the follow-up if any ("check tomorrow"), else empty.
- title: a short, specific label a human would skim.`;
}

export async function structureCapture({ rawText, locations, equipment }) {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1536,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: STRUCTURE_SCHEMA } },
    system: buildSystem(locations, equipment),
    messages: [{ role: 'user', content: `Note:\n"""${rawText}"""\n\nReturn the structured draft.` }],
  });
  if (response.stop_reason === 'refusal') {
    const e = new Error('The model declined to read this note.');
    e.status = 422;
    throw e;
  }
  const text = response.content.find((b) => b.type === 'text')?.text || '';
  return JSON.parse(text);
}

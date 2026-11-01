import { getClient, MODEL } from '@/lib/equipmentAi';
import { JOB_STATUSES, JOB_PRIORITIES } from '@/lib/jobMeta';
import { PART_STATUSES } from '@/lib/partMeta';

// Constants live in the SDK-free jobMeta.js (client pages import from there);
// re-exported here so server routes can keep importing from jobsAi.
export { JOB_STATUSES, JOB_PRIORITIES, STATUS_LABEL, PRIORITY_LABEL } from '@/lib/jobMeta';

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
    job_relevant: {
      type: 'boolean',
      description: 'False only when the note is purely parts logistics (a part arrived / was ordered / was stored) with no repair work, problem, or time to log',
    },
    parts: {
      type: 'array',
      description: 'Part needs and part progress updates mentioned in the note; empty if none',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['need', 'update'] },
          description: { type: 'string', description: 'The part in plain words' },
          quantity: { type: ['integer', 'null'] },
          match_part_id: { type: ['integer', 'null'], description: 'For update: the OPEN PARTS id it refers to, or null if unsure' },
          new_status: { type: 'string', enum: [...PART_STATUSES, 'unchanged'] },
          storage_location: { type: 'string', description: 'Where the part was put, if stated; else empty' },
        },
        required: ['action', 'description', 'quantity', 'match_part_id', 'new_status', 'storage_location'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'title', 'location_id', 'location_guess', 'equipment_id', 'equipment_guess',
    'equipment_ambiguous', 'problem', 'work_performed', 'minutes', 'minutes_estimated',
    'cost', 'cost_note', 'status', 'priority', 'next_action', 'job_relevant', 'parts',
  ],
  additionalProperties: false,
};

function buildSystem(locations, equipment, openParts, storageOptions) {
  const locLines = locations.map((l) => `  ${l.id} — ${l.name}`).join('\n') || '  (none)';
  const eqLines =
    equipment
      .map((e) => {
        const mm = [e.make, e.model].filter(Boolean).join(' ');
        return `  ${e.id} — ${e.name || mm || 'equipment'}${mm && e.name ? ` (${mm})` : ''} @ ${e.location_name || '?'}`;
      })
      .join('\n') || '  (none)';
  const partLines =
    openParts
      .map((p) => {
        const ref = [p.part_number && `#${p.part_number}`, p.supplier, p.order_number && `order ${p.order_number}`].filter(Boolean).join(', ');
        const where = [p.location_name, p.job_title && `job: ${p.job_title}`].filter(Boolean).join('; ');
        return `  ${p.id} — ${p.description}${p.quantity > 1 ? ` x${p.quantity}` : ''} [${p.status}]${ref ? ` (${ref})` : ''}${where ? ` @ ${where}` : ''}`;
      })
      .join('\n') || '  (none)';
  const storageLine = storageOptions.length ? storageOptions.join(', ') : '(none)';
  return `You convert a field technician's short, plain-language repair/maintenance note into a structured draft. The tech manages four gas stations and fixes refrigeration, pumps, IT, handhelds, cameras, and other equipment.

STATIONS (match by id):
${locLines}

EQUIPMENT (match by id; may be incomplete):
${eqLines}

OPEN PARTS being tracked (match updates by id):
${partLines}

KNOWN STORAGE LOCATIONS: ${storageLine}

Parts rules:
- A part that is needed / must be identified / must be ordered → parts action "need". new_status: needs_research if the exact part isn't known yet; ready_to_order if identified but not ordered; ordered if they say they ordered it.
- Progress on a part already in OPEN PARTS (it arrived / came in / was ordered / was installed / was put somewhere) → action "update" with match_part_id set to that id only when you're confident which one; if unsure or nothing matches, match_part_id = null.
- Status words: arrived / came in / got it / picked it up → received; ordered → ordered; installed / swapped in / put it on the unit → installed. If only where it's kept changed, new_status = "unchanged".
- Don't confuse storing a part ("put it in the truck", "left it at the office") with installing it ("put it in the cooler").
- storage_location: where the part now is, using the matching KNOWN STORAGE LOCATION when obvious ("the truck" → a truck/vehicle name, "office" → Office); otherwise the note's own words; else empty.
- Never add a "need" for a part already in OPEN PARTS — use "update" instead. parts = [] when the note mentions no parts.
- job_relevant = false only when the note is purely parts logistics (arrived / ordered / stored) with no repair work, problem, or time to log; otherwise true.

Job rules:
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

export async function structureCapture({ rawText, locations, equipment, openParts = [], storageOptions = [] }) {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: STRUCTURE_SCHEMA } },
    system: buildSystem(locations, equipment, openParts, storageOptions),
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

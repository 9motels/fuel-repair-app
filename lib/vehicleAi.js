// Helpers for the vehicle AI routes (identify from photo + troubleshoot).
// Reuses the shared Anthropic client/model/error helpers from equipmentAi.

export const VEHICLE_TYPES = [
  'Car',
  'Truck',
  'Van',
  'SUV',
  'Trailer',
  'Equipment',
  'Other',
];

// ---- Photo identify (Claude vision + structured output) -------------------

export const VEHICLE_EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: {
      type: 'string',
      description:
        'Short friendly label, e.g. "Red F-250 plow truck" or "Shop van". Empty string if not determinable.',
    },
    vehicle_type: { type: 'string', enum: VEHICLE_TYPES, description: 'Best-fit type.' },
    year: { type: 'string', description: 'Model year if visible/known, else empty string.' },
    make: { type: 'string', description: 'Manufacturer, e.g. Ford. Empty if not visible.' },
    model: { type: 'string', description: 'Model, e.g. F-250. Empty if not visible.' },
    vin: { type: 'string', description: 'VIN exactly as printed. Empty if not legible.' },
    plate: { type: 'string', description: 'License plate. Empty if not visible.' },
    description: {
      type: 'string',
      description:
        'One or two sentences: what the vehicle is and any useful detail (engine, trim, capacity) read from the photo.',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['name', 'vehicle_type', 'year', 'make', 'model', 'vin', 'plate', 'description', 'confidence'],
};

export const VEHICLE_EXTRACT_SYSTEM = `You identify a vehicle from a photo of the vehicle, its VIN plate/sticker, or its registration.
Read the VIN, plate, year, make, and model exactly as printed — do not guess characters you cannot see; leave a field as an empty string when it is not legible.
A VIN is 17 characters. If you can read a VIN, decode the year/make/model from it when the photo doesn't show them directly, but never invent a VIN.
Use the vehicle types provided; when unsure use "Other". Keep the description factual and useful for service and parts lookup.`;

// ---- Troubleshooting chat --------------------------------------------------

function fmtVehicle(v = {}) {
  const lines = [
    v.name && `Name: ${v.name}`,
    v.vehicle_type && `Type: ${v.vehicle_type}`,
    [v.year, v.make, v.model].filter(Boolean).length &&
      `Vehicle: ${[v.year, v.make, v.model].filter(Boolean).join(' ')}`,
    v.vin && `VIN: ${v.vin}`,
    v.plate && `Plate: ${v.plate}`,
    (v.odometer || v.odometer === 0) && v.odometer ? `Odometer: ${v.odometer}` : null,
    v.location && `Location: ${v.location}`,
    v.description && `Description: ${v.description}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : '(no details recorded)';
}

function fmtLogs(logs = []) {
  if (!Array.isArray(logs) || logs.length === 0) return '(no service history recorded)';
  return logs
    .map((l) => {
      const when = l.performed_at || '';
      const odo = l.odometer ? ` @ ${l.odometer} mi` : '';
      const type = l.service_type ? ` [${l.service_type}]` : '';
      const who = l.performed_by ? ` by ${l.performed_by}` : '';
      return `- ${when}${odo}${type}${who}: ${l.notes || ''}`.trim();
    })
    .join('\n');
}

export function buildVehicleTroubleshootSystem(vehicle, logs) {
  return `You are a hands-on automotive/fleet technician helping someone who maintains a fleet of work vehicles. You are helping with one specific vehicle.

VEHICLE
${fmtVehicle(vehicle)}

SERVICE HISTORY (most recent first)
${fmtLogs(logs)}

Guidance:
- Use the vehicle details and history above. Reference past work when relevant ("the brakes were done at 80k, so...").
- Give practical, step-by-step troubleshooting. Lead with the most likely cause and the safest first check.
- Call out any safety concern (brakes, steering, fuel, lifting/jacking, electrical) before steps that involve it.
- When suggesting parts, give the part type and how to confirm the exact part for this year/make/model (VIN-specific where it matters) rather than inventing a part number.
- If a detail you need isn't recorded, say what to check on the vehicle. Be concise and direct.`;
}

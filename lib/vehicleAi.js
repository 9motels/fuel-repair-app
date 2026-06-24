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

// ---- Maintenance plan (suggest service intervals + fluids from the VIN) ----

export const MAINTENANCE_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intervals: {
      type: 'array',
      description: 'Common preventive-maintenance items for this vehicle.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', description: 'Service item, e.g. "Engine oil & filter".' },
          interval_miles: { type: 'integer', description: 'Mileage interval. Use 0 if it is time-based only.' },
          interval_months: { type: 'integer', description: 'Month interval. Use 0 if it is mileage-based only.' },
          fluid: { type: 'string', description: 'Fluid/spec, e.g. "5W-30 full synthetic". Empty if not applicable.' },
          capacity: { type: 'string', description: 'Approx capacity, e.g. "6.0 qt". Empty if not applicable.' },
          notes: { type: 'string', description: 'Filter/part type or other guidance. Empty if none.' },
        },
        required: ['label', 'interval_miles', 'interval_months', 'fluid', 'capacity', 'notes'],
      },
    },
    summary: { type: 'string', description: 'One or two sentences of overall guidance/caveats.' },
  },
  required: ['intervals', 'summary'],
};

export const MAINTENANCE_PLAN_SYSTEM = `You are an automotive maintenance expert. Given a vehicle, propose a practical preventive-maintenance schedule based on the manufacturer's typical recommendations for that year/make/model/engine.
- Cover the common items that apply: engine oil & filter, tire rotation, engine air filter, cabin air filter, brake fluid, engine coolant, transmission fluid, differential / transfer case (if 4WD/AWD or RWD truck), spark plugs, serpentine belt. Skip items that don't apply to this drivetrain/fuel type.
- Give realistic mileage and/or month intervals. Use 0 for an interval that doesn't apply (e.g. a strictly time-based item has interval_miles 0).
- For fluids, give the spec and an approximate capacity. Capacities and fluid specs are ESTIMATES — they vary by engine and trim. Keep them realistic and note in the summary that they must be confirmed against the owner's manual before relying on exact quantities. Never invent a precise figure you're unsure of; give a typical value.
- Be concise and practical. Do not include a precise OEM part number unless you are confident; describe the part type instead.`;

export function buildMaintenancePlanPrompt(vehicle = {}, decoded = null) {
  const lines = [
    `Year: ${vehicle.year || decoded?.year || '(unknown)'}`,
    `Make: ${vehicle.make || decoded?.make || '(unknown)'}`,
    `Model: ${vehicle.model || decoded?.model || '(unknown)'}`,
    vehicle.vin && `VIN: ${vehicle.vin}`,
    decoded?.displacementL &&
      `Engine: ${decoded.displacementL}L${decoded.engineCylinders ? ` ${decoded.engineCylinders}-cyl` : ''}${decoded.fuelType ? ` ${decoded.fuelType}` : ''}`,
    decoded?.trim && `Trim: ${decoded.trim}`,
    decoded?.driveType && `Drive: ${decoded.driveType}`,
    decoded?.bodyClass && `Body: ${decoded.bodyClass}`,
    vehicle.odometer ? `Current odometer: ${vehicle.odometer} mi` : null,
  ].filter(Boolean).join('\n');
  return `Propose a preventive-maintenance schedule for this vehicle:\n\n${lines}\n\nReturn the common service items with mileage/month intervals, fluid type, approximate capacity, and filter/part guidance.`;
}

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

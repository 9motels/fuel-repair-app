import { NextResponse } from 'next/server';
import { GET as locationsGET } from '@/app/api/locations/route';
import { GET as alertsGET } from '@/app/api/alerts/route';
import { GET as purchasesGET } from '@/app/api/purchases/route';
import { GET as transfersGET } from '@/app/api/transfers/route';
import { GET as repairsGET } from '@/app/api/repairs/route';
import { GET as inventoryGET } from '@/app/api/inventory/route';
import { GET as equipmentGET } from '@/app/api/equipment/route';
import { GET as itemsGET } from '@/app/api/items/route';
import { GET as vehiclesGET } from '@/app/api/vehicles/route';
import { GET as vehicleDueGET } from '@/app/api/vehicles/service-due/route';
import { GET as equipmentDueGET } from '@/app/api/equipment/service-due/route';
import { GET as complianceGET } from '@/app/api/compliance/route';
import { GET as jobsGET } from '@/app/api/jobs/route';
import { GET as partsGET } from '@/app/api/parts/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dashboard section -> [the section's own handler, the URL it would be called with].
const SECTIONS = {
  locations: [locationsGET, '/api/locations'],
  alerts: [alertsGET, '/api/alerts'],
  purchases: [purchasesGET, '/api/purchases'],
  transfers: [transfersGET, '/api/transfers'],
  repairs: [repairsGET, '/api/repairs?limit=5'], // the dashboard only shows the latest 5
  inventory: [inventoryGET, '/api/inventory'],
  equipment: [equipmentGET, '/api/equipment'],
  items: [itemsGET, '/api/items'],
  vehicles: [vehiclesGET, '/api/vehicles'],
  serviceDue: [vehicleDueGET, '/api/vehicles/service-due'],
  equipServiceDue: [equipmentDueGET, '/api/equipment/service-due'],
  compliance: [complianceGET, '/api/compliance'],
  jobs: [jobsGET, '/api/jobs?open=1'],
  parts: [partsGET, '/api/parts?open=1'],
};

// GET -> everything the dashboard shows, in ONE round trip. Each section runs its
// existing endpoint handler in-process (identical logic), instead of the phone
// making 14 separate requests that can each hit their own cold start. A section
// that fails comes back as [] so the rest of the dashboard still renders.
export async function GET(request) {
  const origin = new URL(request.url).origin;
  const keys = Object.keys(SECTIONS);
  const settled = await Promise.allSettled(
    keys.map(async (key) => {
      const [handler, path] = SECTIONS[key];
      const res = await handler(new Request(origin + path));
      return res.ok ? res.json() : [];
    })
  );
  const data = {};
  keys.forEach((key, i) => {
    if (settled[i].status === 'fulfilled') data[key] = settled[i].value;
    else {
      console.error(`dashboard section ${key} failed:`, settled[i].reason);
      data[key] = [];
    }
  });
  return NextResponse.json(data);
}

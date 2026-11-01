// Server-side part writes shared by quick capture (and anything else that needs
// them). Status moves stamp ordered_at / received_at / installed_at once.
import { PART_STATUSES, PART_STATUS_TIMESTAMP } from '@/lib/partMeta';

// Insert a new part need. Returns the new id, or null if there's no description.
export async function createPartNeed(db, { job_id, location_id, equipment_id, description, quantity, status, notes, created_by_id }) {
  const desc = (description || '').trim();
  if (!desc) return null;
  const st = PART_STATUSES.includes(status) ? status : 'needs_research';
  const stampCol = PART_STATUS_TIMESTAMP[st];
  const result = await db.execute({
    sql: `INSERT INTO parts (job_id, location_id, equipment_id, description, quantity, status, notes, created_by_id${stampCol ? `, ${stampCol}` : ''})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?${stampCol ? ", datetime('now')" : ''})`,
    args: [job_id || null, location_id || null, equipment_id || null, desc, Number(quantity) || 1, st, (notes || '').trim(), created_by_id || null],
  });
  return Number(result.lastInsertRowid);
}

// Move an existing part forward and/or record where it's stored. Links it to
// job_id only if the part isn't already on a job.
export async function applyPartUpdate(db, id, { status, storage_location, job_id }) {
  const sets = ["updated_at = datetime('now')"];
  const args = [];
  if (status && status !== 'unchanged' && PART_STATUSES.includes(status)) {
    sets.push('status = ?');
    args.push(status);
    const col = PART_STATUS_TIMESTAMP[status];
    if (col) sets.push(`${col} = COALESCE(${col}, datetime('now'))`);
  }
  const storage = (storage_location || '').trim();
  if (storage) {
    sets.push('storage_location = ?');
    args.push(storage);
  }
  if (job_id) {
    sets.push('job_id = COALESCE(job_id, ?)');
    args.push(job_id);
  }
  args.push(id);
  await db.execute({ sql: `UPDATE parts SET ${sets.join(', ')} WHERE id = ?`, args });
}

// Where parts get kept: the office, the truck, each vehicle, each station.
export async function storageOptions(db) {
  const [veh, loc] = await Promise.all([
    db.execute("SELECT name FROM vehicles WHERE status != 'retired' ORDER BY name"),
    db.execute('SELECT name FROM locations ORDER BY name'),
  ]);
  return [...new Set(['Office', 'My truck', ...veh.rows.map((r) => r.name).filter(Boolean), ...loc.rows.map((r) => r.name)])];
}

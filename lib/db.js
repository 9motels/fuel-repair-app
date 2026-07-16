import { createClient } from '@libsql/client';

let client = null;
let initialized = false;
let initPromise = null;

export function getClient() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

export async function getDb() {
  const db = getClient();
  if (!initialized) {
    // Dedupe concurrent init on the same warm instance so a burst of parallel
    // requests (e.g. the dashboard) doesn't each re-run the schema setup.
    if (!initPromise) {
      initPromise = initializeDb(db)
        .then(() => {
          initialized = true;
        })
        .catch((e) => {
          initPromise = null; // allow a retry on the next request
          throw e;
        });
    }
    await initPromise;
  }
  return db;
}

// SQLite/libSQL doesn't support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
// so we swallow "duplicate column" errors to keep this idempotent.
async function addColumnIfMissing(db, table, columnDef) {
  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (e) {
    if (!/duplicate column/i.test(e.message || '')) throw e;
  }
}

async function initializeDb(db) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT DEFAULT '',
      is_central INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT '',
      part_number TEXT DEFAULT '',
      unit TEXT DEFAULT 'each',
      min_quantity INTEGER DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      UNIQUE(item_id, location_id)
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      vendor TEXT DEFAULT '',
      purchase_date TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      pump_number INTEGER DEFAULT NULL,
      repair_date TEXT NOT NULL,
      description TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      equipment_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repair_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repair_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      source_location_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (source_location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      from_location_id INTEGER NOT NULL,
      to_location_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE CASCADE,
      FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repair_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repair_id INTEGER NOT NULL,
      sent_to TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      success INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cron_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      ran_at TEXT DEFAULT (datetime('now')),
      trigger TEXT NOT NULL DEFAULT 'cron',
      status TEXT NOT NULL,
      low_stock_count INTEGER DEFAULT 0,
      email_sent INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      duration_ms INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_cron_runs_job_ran ON cron_runs(job_name, ran_at DESC);

    CREATE TABLE IF NOT EXISTS report_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_to TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      location_ids TEXT DEFAULT '',
      success INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      total_spend REAL DEFAULT 0,
      repair_count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_repairs_date ON repairs(repair_date);
    CREATE INDEX IF NOT EXISTS idx_repair_items_repair ON repair_items(repair_id);

    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      name TEXT DEFAULT '',
      category TEXT DEFAULT '',
      make TEXT DEFAULT '',
      model TEXT DEFAULT '',
      serial TEXT DEFAULT '',
      description TEXT DEFAULT '',
      photo_urls TEXT DEFAULT '[]',
      ai_extracted TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_id) REFERENCES people(id)
    );

    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      performed_by_id INTEGER DEFAULT NULL,
      performed_at TEXT NOT NULL,
      work_type TEXT DEFAULT '',
      notes TEXT NOT NULL,
      photo_urls TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
      FOREIGN KEY (performed_by_id) REFERENCES people(id)
    );

    CREATE INDEX IF NOT EXISTS idx_equipment_location ON equipment(location_id);
    CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
    CREATE INDEX IF NOT EXISTS idx_maintenance_logs_equipment ON maintenance_logs(equipment_id);

    CREATE TABLE IF NOT EXISTS equipment_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'manual',
      content_type TEXT DEFAULT '',
      size INTEGER DEFAULT 0,
      uploaded_by_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by_id) REFERENCES people(id)
    );

    CREATE INDEX IF NOT EXISTS idx_equipment_documents_equipment ON equipment_documents(equipment_id);

    CREATE TABLE IF NOT EXISTS troubleshoot_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      title TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS troubleshoot_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      images TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES troubleshoot_conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ts_conversations_equipment ON troubleshoot_conversations(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_ts_messages_conversation ON troubleshoot_messages(conversation_id);

    CREATE TABLE IF NOT EXISTS equipment_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      interval_months INTEGER DEFAULT NULL,
      last_done_date TEXT DEFAULT NULL,
      notes TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_equipment_reminders_equipment ON equipment_reminders(equipment_id);

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      name TEXT DEFAULT '',
      vehicle_type TEXT DEFAULT '',
      year TEXT DEFAULT '',
      make TEXT DEFAULT '',
      model TEXT DEFAULT '',
      vin TEXT DEFAULT '',
      plate TEXT DEFAULT '',
      odometer INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      photo_urls TEXT DEFAULT '[]',
      ai_extracted TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_id) REFERENCES people(id)
    );

    CREATE TABLE IF NOT EXISTS vehicle_service_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      performed_by_id INTEGER DEFAULT NULL,
      performed_at TEXT NOT NULL,
      service_type TEXT DEFAULT '',
      odometer INTEGER DEFAULT NULL,
      cost REAL DEFAULT 0,
      notes TEXT NOT NULL,
      photo_urls TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY (performed_by_id) REFERENCES people(id)
    );

    CREATE TABLE IF NOT EXISTS vehicle_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      interval_miles INTEGER DEFAULT NULL,
      interval_months INTEGER DEFAULT NULL,
      last_done_date TEXT DEFAULT NULL,
      last_done_odometer INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_vehicles_location ON vehicles(location_id);
    CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
    CREATE INDEX IF NOT EXISTS idx_vehicle_logs_vehicle ON vehicle_service_logs(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_vehicle_reminders_vehicle ON vehicle_reminders(vehicle_id);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      person_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_item_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_text TEXT NOT NULL,
      part_number TEXT DEFAULT '',
      vendor TEXT DEFAULT '',
      item_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_text),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_aliases_part ON invoice_item_aliases(part_number);

    CREATE TABLE IF NOT EXISTS compliance_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER DEFAULT NULL,
      equipment_id INTEGER DEFAULT NULL,
      label TEXT NOT NULL,
      category TEXT DEFAULT '',
      interval_months INTEGER DEFAULT NULL,
      last_done_date TEXT DEFAULT NULL,
      next_due_date TEXT DEFAULT NULL,
      notes TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_compliance_location ON compliance_tasks(location_id);
    CREATE INDEX IF NOT EXISTS idx_compliance_due ON compliance_tasks(next_due_date);

    CREATE TABLE IF NOT EXISTS count_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      applied_at TEXT DEFAULT NULL,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_id) REFERENCES people(id)
    );

    CREATE TABLE IF NOT EXISTS count_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      system_qty INTEGER NOT NULL DEFAULT 0,
      counted_qty INTEGER DEFAULT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, item_id),
      FOREIGN KEY (session_id) REFERENCES count_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_count_sessions_location ON count_sessions(location_id);
    CREATE INDEX IF NOT EXISTS idx_count_lines_session ON count_lines(session_id);
  `);

  // Seeds + idempotent column additions run concurrently — on a cold serverless
  // instance these are otherwise ~12 sequential Turso round-trips before the first
  // real query, which dominates cold-start latency. They're independent, so fire
  // them in one wave. (INSERT OR IGNORE is a no-op once seeded; addColumnIfMissing
  // swallows "duplicate column" so re-running is safe.)
  await Promise.all([
    db.execute("INSERT OR IGNORE INTO people (name, active) VALUES ('Andrew', 1)"),
    db.execute("INSERT OR IGNORE INTO people (name, active) VALUES ('Kevin', 1)"),
    addColumnIfMissing(db, 'items', "unit_cost REAL DEFAULT 0"),
    addColumnIfMissing(db, 'repairs', "status TEXT DEFAULT 'open'"),
    addColumnIfMissing(db, 'repairs', "closed_at TEXT DEFAULT NULL"),
    addColumnIfMissing(db, 'repairs', "created_by_id INTEGER DEFAULT NULL"),
    addColumnIfMissing(db, 'repairs', "equipment_id INTEGER DEFAULT NULL"),
    addColumnIfMissing(db, 'repairs', "repair_type TEXT DEFAULT 'fuel'"),
    addColumnIfMissing(db, 'transfers', "created_by_id INTEGER DEFAULT NULL"),
    addColumnIfMissing(db, 'purchases', "created_by_id INTEGER DEFAULT NULL"),
    addColumnIfMissing(db, 'troubleshoot_messages', "images TEXT DEFAULT '[]'"),
    addColumnIfMissing(db, 'equipment', "warranty_provider TEXT DEFAULT ''"),
    addColumnIfMissing(db, 'equipment', "warranty_expires TEXT DEFAULT NULL"),
    addColumnIfMissing(db, 'equipment', "warranty_notes TEXT DEFAULT ''"),
  ]);
}

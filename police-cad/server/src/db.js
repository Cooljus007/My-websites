import Database from 'better-sqlite3';

const db = new Database('police-cad.db');
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      badge_number TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('dispatcher', 'officer', 'supervisor', 'admin')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('available', 'enroute', 'on_scene', 'busy', 'offline')),
      officer_name TEXT,
      location_lat REAL,
      location_lng REAL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'critical')),
      status TEXT NOT NULL CHECK(status IN ('open', 'assigned', 'in_progress', 'closed')),
      description TEXT,
      location TEXT,
      latitude REAL,
      longitude REAL,
      assigned_unit_id INTEGER,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(assigned_unit_id) REFERENCES units(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'dispatch',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
    CREATE INDEX IF NOT EXISTS idx_calls_priority ON calls(priority);
    CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
  `);

  seedData();
}

function hasRows(table) {
  return db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count > 0;
}

function logSystem(action, entityType, entityId, details = '') {
  db.prepare(`
    INSERT INTO activity_logs (actor, action, entity_type, entity_id, details)
    VALUES ('SYSTEM', ?, ?, ?, ?)
  `).run(action, entityType, entityId ?? null, details);
}

function seedData() {
  if (!hasRows('users')) {
    const insert = db.prepare('INSERT INTO users (name, badge_number, role) VALUES (?, ?, ?)');
    [
      ['Alex Weber', 'D-1001', 'dispatcher'],
      ['Mia Hoffmann', 'A-2203', 'officer'],
      ['Jonas Klein', 'S-0410', 'supervisor'],
      ['Samir Kaya', 'ADM-1', 'admin']
    ].forEach((u) => insert.run(...u));
  }

  if (!hasRows('units')) {
    const insert = db.prepare(`
      INSERT INTO units (unit_code, type, status, officer_name, location_lat, location_lng, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    [
      ['ADAM-12', 'Patrol', 'available', 'Mia Hoffmann', 52.52, 13.405],
      ['BRAVO-7', 'Traffic', 'enroute', 'Luca Brandt', 52.516, 13.39],
      ['CHARLIE-4', 'K9', 'busy', 'Lea Scholz', 52.509, 13.43],
      ['DELTA-9', 'SWAT', 'offline', 'Team Delta', 52.526, 13.35]
    ].forEach((u) => insert.run(...u));
  }

  if (!hasRows('calls')) {
    const dispatcherId = db.prepare("SELECT id FROM users WHERE role='dispatcher' LIMIT 1").get()?.id;
    const units = db.prepare('SELECT id FROM units').all();
    const insert = db.prepare(`
      INSERT INTO calls (title, priority, status, description, location, latitude, longitude, assigned_unit_id, created_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    insert.run(
      'Verkehrsunfall mit Verletzten',
      'high',
      'assigned',
      'Mehrere Fahrzeuge beteiligt, Rettungsdienst angefordert.',
      'Alexanderplatz, Berlin',
      52.5219,
      13.4132,
      units[1]?.id ?? null,
      dispatcherId
    );

    insert.run(
      'Verdächtige Person',
      'medium',
      'open',
      'Meldung über Person mit auffälligem Verhalten vor Geschäft.',
      'Potsdamer Platz, Berlin',
      52.5097,
      13.376,
      units[0]?.id ?? null,
      dispatcherId
    );

    logSystem('SEED', 'calls', null, 'Initial demo calls inserted');
  }
}

export default db;

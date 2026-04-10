import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import db, { initDb } from './db.js';

initDb();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const rowToJson = (row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null });

function addLog(actor, action, entityType, entityId, details = {}) {
  const info = JSON.stringify(details);
  const result = db.prepare(
    `INSERT INTO activity_logs (actor, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?)`
  ).run(actor, action, entityType, entityId ?? null, info);

  const created = db.prepare('SELECT * FROM activity_logs WHERE id=?').get(result.lastInsertRowid);
  io.emit('activity:new', rowToJson(created));
}

function getDashboard() {
  const activeCalls = db.prepare("SELECT COUNT(*) as count FROM calls WHERE status != 'closed'").get().count;
  const availableUnits = db.prepare("SELECT COUNT(*) as count FROM units WHERE status = 'available'").get().count;
  const criticalCalls = db.prepare("SELECT COUNT(*) as count FROM calls WHERE priority='critical' AND status != 'closed'").get().count;
  const openChatMessages = db.prepare("SELECT COUNT(*) as count FROM chat_messages WHERE created_at >= datetime('now', '-12 hours')").get().count;

  return { activeCalls, availableUnits, criticalCalls, openChatMessages };
}

app.get('/api/dashboard', (_, res) => {
  res.json({ stats: getDashboard() });
});

app.get('/api/calls', (req, res) => {
  const { status, q = '' } = req.query;
  let sql = `
    SELECT c.*, u.unit_code as assigned_unit_code
    FROM calls c
    LEFT JOIN units u ON u.id = c.assigned_unit_id
    WHERE (c.title LIKE ? OR c.description LIKE ? OR c.location LIKE ?)
  `;
  const params = [`%${q}%`, `%${q}%`, `%${q}%`];

  if (status && status !== 'all') {
    sql += ' AND c.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY c.priority DESC, c.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows });
});

app.post('/api/calls', (req, res) => {
  const { title, priority, description, location, latitude, longitude, createdBy } = req.body;
  const result = db.prepare(`
    INSERT INTO calls (title, priority, status, description, location, latitude, longitude, created_by, updated_at)
    VALUES (?, ?, 'open', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(title, priority, description, location, latitude, longitude, createdBy ?? null);

  const created = db.prepare('SELECT * FROM calls WHERE id = ?').get(result.lastInsertRowid);
  addLog(createdBy || 'DISPATCH', 'CREATE_CALL', 'calls', created.id, { title, priority });
  io.emit('calls:updated');
  res.status(201).json({ data: created });
});

app.patch('/api/calls/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM calls WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Call not found' });

  const payload = {
    title: req.body.title ?? existing.title,
    priority: req.body.priority ?? existing.priority,
    status: req.body.status ?? existing.status,
    description: req.body.description ?? existing.description,
    location: req.body.location ?? existing.location,
    latitude: req.body.latitude ?? existing.latitude,
    longitude: req.body.longitude ?? existing.longitude,
    assignedUnitId: req.body.assigned_unit_id ?? existing.assigned_unit_id
  };

  db.prepare(`
    UPDATE calls
    SET title=?, priority=?, status=?, description=?, location=?, latitude=?, longitude=?, assigned_unit_id=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    payload.title,
    payload.priority,
    payload.status,
    payload.description,
    payload.location,
    payload.latitude,
    payload.longitude,
    payload.assignedUnitId,
    id
  );

  const updated = db.prepare('SELECT * FROM calls WHERE id = ?').get(id);
  addLog('DISPATCH', 'UPDATE_CALL', 'calls', id, payload);
  io.emit('calls:updated');
  res.json({ data: updated });
});

app.get('/api/units', (req, res) => {
  const { status = 'all', q = '' } = req.query;
  let sql = 'SELECT * FROM units WHERE (unit_code LIKE ? OR officer_name LIKE ? OR type LIKE ?)';
  const params = [`%${q}%`, `%${q}%`, `%${q}%`];
  if (status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY updated_at DESC';
  res.json({ data: db.prepare(sql).all(...params) });
});

app.patch('/api/units/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM units WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Unit not found' });

  const nextStatus = req.body.status ?? existing.status;
  const lat = req.body.location_lat ?? existing.location_lat;
  const lng = req.body.location_lng ?? existing.location_lng;

  db.prepare('UPDATE units SET status=?, location_lat=?, location_lng=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(nextStatus, lat, lng, id);

  addLog('UNIT_CTRL', 'UPDATE_UNIT', 'units', id, { status: nextStatus, lat, lng });
  io.emit('units:updated');

  res.json({ data: db.prepare('SELECT * FROM units WHERE id=?').get(id) });
});

app.get('/api/users', (_, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY role, name').all();
  res.json({ data: users });
});

app.post('/api/users', (req, res) => {
  const { name, badge_number, role } = req.body;
  const result = db.prepare('INSERT INTO users (name, badge_number, role) VALUES (?, ?, ?)').run(name, badge_number, role);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  addLog('ADMIN', 'CREATE_USER', 'users', user.id, { name, role });
  res.status(201).json({ data: user });
});

app.get('/api/activity', (_, res) => {
  const rows = db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 150').all().map(rowToJson);
  res.json({ data: rows });
});

app.get('/api/chat', (_, res) => {
  const rows = db.prepare('SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 120').all().reverse();
  res.json({ data: rows });
});

io.on('connection', (socket) => {
  socket.on('chat:message', ({ user_name, role, message, channel }) => {
    if (!message?.trim()) return;
    const result = db.prepare(
      'INSERT INTO chat_messages (user_name, role, message, channel) VALUES (?, ?, ?, ?)'
    ).run(user_name || 'Unknown', role || 'officer', message.trim(), channel || 'dispatch');

    const row = db.prepare('SELECT * FROM chat_messages WHERE id=?').get(result.lastInsertRowid);
    addLog(user_name || 'Unknown', 'SEND_MESSAGE', 'chat', row.id, { channel: row.channel });
    io.emit('chat:new', row);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Police CAD backend listening on http://localhost:${PORT}`);
});

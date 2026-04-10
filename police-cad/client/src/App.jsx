import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

const API = 'http://localhost:4000/api';
const socket = io('http://localhost:4000', { autoConnect: true });

const defaultCall = {
  title: '', priority: 'medium', description: '', location: '', latitude: 52.52, longitude: 13.405
};

const statuses = ['open', 'assigned', 'in_progress', 'closed'];
const unitStatuses = ['available', 'enroute', 'on_scene', 'busy', 'offline'];

export default function App() {
  const [dashboard, setDashboard] = useState({});
  const [calls, setCalls] = useState([]);
  const [units, setUnits] = useState([]);
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newCall, setNewCall] = useState(defaultCall);
  const [chatMessage, setChatMessage] = useState('');
  const [query, setQuery] = useState('');
  const [callFilter, setCallFilter] = useState('all');

  const fetchAll = async () => {
    const [d, c, u, us, a, ch] = await Promise.all([
      fetch(`${API}/dashboard`).then((r) => r.json()),
      fetch(`${API}/calls?status=${callFilter}&q=${encodeURIComponent(query)}`).then((r) => r.json()),
      fetch(`${API}/units?q=${encodeURIComponent(query)}`).then((r) => r.json()),
      fetch(`${API}/users`).then((r) => r.json()),
      fetch(`${API}/activity`).then((r) => r.json()),
      fetch(`${API}/chat`).then((r) => r.json())
    ]);
    setDashboard(d.stats || {});
    setCalls(c.data || []);
    setUnits(u.data || []);
    setUsers(us.data || []);
    setActivity(a.data || []);
    setMessages(ch.data || []);
  };

  useEffect(() => {
    fetchAll();
  }, [callFilter]);

  useEffect(() => {
    const refresh = () => fetchAll();
    socket.on('calls:updated', refresh);
    socket.on('units:updated', refresh);
    socket.on('activity:new', (entry) => setActivity((prev) => [entry, ...prev].slice(0, 150)));
    socket.on('chat:new', (msg) => setMessages((prev) => [...prev, msg].slice(-140)));
    return () => {
      socket.off('calls:updated', refresh);
      socket.off('units:updated', refresh);
      socket.off('activity:new');
      socket.off('chat:new');
    };
  }, []);

  const filteredCalls = useMemo(() => calls, [calls]);

  const createCall = async (e) => {
    e.preventDefault();
    await fetch(`${API}/calls`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newCall, createdBy: 1 })
    });
    setNewCall(defaultCall);
    fetchAll();
  };

  const updateCallStatus = async (id, status) => {
    await fetch(`${API}/calls/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
    });
  };

  const updateUnitStatus = async (id, status) => {
    await fetch(`${API}/units/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
    });
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    socket.emit('chat:message', {
      user_name: 'Dispatch-1', role: 'dispatcher', channel: 'dispatch', message: chatMessage
    });
    setChatMessage('');
  };

  return (
    <div className="layout">
      <header className="topbar">
        <h1>POLICE CAD / DISPATCH CORE</h1>
        <div className="stats">
          <Stat label="Aktive Calls" value={dashboard.activeCalls || 0} />
          <Stat label="Verfügbare Units" value={dashboard.availableUnits || 0} />
          <Stat label="Kritisch" value={dashboard.criticalCalls || 0} />
          <Stat label="Funk 12h" value={dashboard.openChatMessages || 0} />
        </div>
      </header>

      <div className="filters">
        <input placeholder="Suche Calls, Orte, Units..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={callFilter} onChange={(e) => setCallFilter(e.target.value)}>
          <option value="all">Alle Call-Status</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={fetchAll}>Filter anwenden</button>
      </div>

      <main className="grid">
        <section className="panel">
          <h2>Einsatzsystem</h2>
          <form className="call-form" onSubmit={createCall}>
            <input required placeholder="Titel" value={newCall.title} onChange={(e) => setNewCall((p) => ({ ...p, title: e.target.value }))} />
            <select value={newCall.priority} onChange={(e) => setNewCall((p) => ({ ...p, priority: e.target.value }))}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </select>
            <input placeholder="Ort" value={newCall.location} onChange={(e) => setNewCall((p) => ({ ...p, location: e.target.value }))} />
            <textarea placeholder="Beschreibung" value={newCall.description} onChange={(e) => setNewCall((p) => ({ ...p, description: e.target.value }))} />
            <div className="row2">
              <input type="number" step="0.0001" value={newCall.latitude} onChange={(e) => setNewCall((p) => ({ ...p, latitude: Number(e.target.value) }))} />
              <input type="number" step="0.0001" value={newCall.longitude} onChange={(e) => setNewCall((p) => ({ ...p, longitude: Number(e.target.value) }))} />
            </div>
            <button type="submit">Call erstellen</button>
          </form>
          <div className="list">
            {filteredCalls.map((call) => (
              <article key={call.id} className={`item priority-${call.priority}`}>
                <div>
                  <strong>#{call.id} {call.title}</strong>
                  <p>{call.location} · {call.priority} · Unit: {call.assigned_unit_code || 'keine'}</p>
                </div>
                <select value={call.status} onChange={(e) => updateCallStatus(call.id, e.target.value)}>
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Einheitenverwaltung</h2>
          <div className="list">
            {units.map((unit) => (
              <article key={unit.id} className="item">
                <div>
                  <strong>{unit.unit_code}</strong>
                  <p>{unit.type} · {unit.officer_name}</p>
                </div>
                <select value={unit.status} onChange={(e) => updateUnitStatus(unit.id, e.target.value)}>
                  {unitStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </article>
            ))}
          </div>
          <h3>Benutzer & Rollen</h3>
          <ul className="users">{users.map((u) => <li key={u.id}>{u.name} ({u.badge_number}) – {u.role}</li>)}</ul>
        </section>

        <section className="panel map-panel">
          <h2>Karte / Lagebild</h2>
          <MapContainer center={[52.52, 13.405]} zoom={12} style={{ height: '340px', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {calls.filter((c) => c.latitude && c.longitude).map((c) => (
              <Marker key={`call-${c.id}`} position={[c.latitude, c.longitude]}>
                <Popup>Call #{c.id}: {c.title}</Popup>
              </Marker>
            ))}
            {units.filter((u) => u.location_lat && u.location_lng).map((u) => (
              <Marker key={`unit-${u.id}`} position={[u.location_lat, u.location_lng]}>
                <Popup>{u.unit_code} ({u.status})</Popup>
              </Marker>
            ))}
          </MapContainer>

          <h2>Funk / Echtzeit-Chat</h2>
          <div className="chat">
            {messages.map((m) => <p key={m.id}><b>{m.user_name}</b>: {m.message}</p>)}
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <input value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Nachricht an Dispatch" />
            <button>Senden</button>
          </form>
        </section>

        <section className="panel activity">
          <h2>Activity-Log</h2>
          <div className="list">
            {activity.map((a) => (
              <article key={a.id} className="item slim">
                <strong>{a.action}</strong>
                <p>{a.actor} · {a.entity_type} #{a.entity_id || '-'} · {a.created_at}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

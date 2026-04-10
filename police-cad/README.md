# Police CAD Webanwendung

Moderne CAD-Demo mit React + Vite Frontend, Node/Express Backend, SQLite-Datenbank und Socket.IO-Realtime.

## Features
- Dashboard mit KPI-Kacheln (aktive Einsätze, verfügbare Units, kritische Calls, Funkaufkommen)
- Einsatzsystem (Calls anlegen, Status verwalten, suchen & filtern)
- Einheitenverwaltung (Status-Updates pro Unit)
- Benutzer- und Rollensystem (Dispatcher, Officer, Supervisor, Admin)
- Realtime Funk-/Chat via Socket.IO
- Kartenansicht (OpenStreetMap + Leaflet Marker für Calls/Units)
- Activity-Log für Aktionen
- Dunkles Leitstellen-UI

## Start
```bash
cd police-cad
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000

## API-Auszug
- `GET /api/dashboard`
- `GET /api/calls?status=all&q=`
- `POST /api/calls`
- `PATCH /api/calls/:id`
- `GET /api/units`
- `PATCH /api/units/:id`
- `GET /api/users`
- `GET /api/activity`
- `GET /api/chat`

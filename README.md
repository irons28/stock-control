# Stock Operations Platform

A full-stack stock control system covering purchase order receiving, sales order allocation, serial number tracking, CSV import, role-based access, and activity timelines.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | SQLite (single file, no server required) |
| API | REST, JSON |

---

## Deploying to a Work Server

### Requirements

- Node.js 18 or later (`node --version`)
- Git (to pull updates)

### First-time setup

```bash
# 1. Clone the repo
git clone <repo-url> stock-control
cd stock-control

# 2. Create your .env from the template
cp .env.example .env

# 3. Edit .env — at minimum set:
#    PORT          — the port the app runs on (default 3001)
#    FRONTEND_ORIGIN — the URL users will use to access the app
#                      e.g. http://192.168.1.50:3001  or  http://stock.internal
#    DATABASE_PATH — absolute path to the SQLite file, e.g. /data/stock-control/stock.sqlite
nano .env

# 4. Start (builds frontend + starts backend)
./start.sh
```

Open `http://<server-ip>:<PORT>` in a browser.

### Subsequent deployments

```bash
git pull
./start.sh
```

The database file is never reset on startup — your data is preserved.

---

## Keeping it running (PM2)

For a persistent background process that survives reboots:

```bash
npm install -g pm2

# Start
pm2 start backend/server.js --name stock-control --env production

# Auto-start on server reboot
pm2 save
pm2 startup   # follow the printed instruction

# View logs
pm2 logs stock-control

# Restart after a git pull
pm2 restart stock-control
```

---

## Environment Variables

All variables live in `.env` at the project root. The backend loads it automatically on startup.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` for the deployed server |
| `PORT` | `3001` | Port the backend listens on |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` = all interfaces) |
| `FRONTEND_ORIGIN` | `http://localhost:3001` | Browser-facing URL — used for CORS and displayed in the startup log |
| `DATABASE_PATH` | `./data/stock-control.sqlite` | Path to the SQLite file. Use an absolute path on a server. |
| `VITE_API_BASE_URL` | `http://localhost:3001/api` | Only needed when running `npm run dev` inside `/frontend` |
| `VITE_BACKEND_PORT` | `3001` | Only needed in dev; aligns the Vite proxy with the backend port |

---

## Development (local)

Run both services separately with live reload:

```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev        # nodemon, restarts on file change

# Terminal 2 — frontend
cd frontend
npm install
npm run dev        # Vite dev server with HMR at http://localhost:5173
```

The frontend proxies `/api` requests to `http://localhost:${VITE_BACKEND_PORT}` automatically.

---

## Database

### Location

The SQLite file lives at `DATABASE_PATH`. On a server, use an absolute path:

```
DATABASE_PATH=/home/youruser/stock-data/stock-control.sqlite
```

### Backup

SQLite is a single file — back it up with a simple copy:

```bash
cp /path/to/stock-control.sqlite /path/to/backups/stock-control-$(date +%Y%m%d).sqlite
```

Or with a cron job:

```cron
0 2 * * * cp /path/to/stock-control.sqlite /path/to/backups/stock-control-$(date +\%Y\%m\%d).sqlite
```

### Reset (demo data only)

Wipe and rebuild with demo data:

```bash
cd backend
npm run db:reset
```

---

## Roles

The app has three roles. Switch between them using the user picker in the sidebar (demo mode).

| Role | Can do |
|---|---|
| **Admin** | Everything |
| **Office** | Create POs and SOs, allocate stock, dispatch, import data, master data |
| **Warehouse** | Receive goods, scan serials, view POs/SOs/stock (read-only) |

---

## Demo Data

After `npm run db:reset`:

| Order | Status | Notes |
|---|---|---|
| PO-1001 | Overdue | 5× TILL-001, 3× PRINTER-001 outstanding |
| PO-1002 | Part Received | 1 of 3 tills received |
| SO-2001 | Urgent | Dispatch overdue (Alpha Vet) |
| SO-2002 | Dispatch Ready | TILL-SN-1002 allocated |

Key serial numbers: `TILL-SN-1001` (available), `TILL-SN-1002` (allocated), `TILL-SN-1003` (dispatched).

---

## Useful Scripts

```bash
# Backend
npm run start        # production start
npm run dev          # dev with nodemon
npm run test         # smoke tests
npm run db:reset     # wipe + reseed demo data

# Frontend
npm run build        # production build → frontend/dist/
npm run dev          # Vite dev server
npm run test         # Vitest unit tests
```

---

## Security Notes

- Authentication is **header-based** (`x-user-id`, `x-user-name`, `x-user-role`). This is a trusted-network internal tool — it assumes users on the network are authorised staff.
- HTTPS is not handled by the app. For internet-facing deployments, put it behind a reverse proxy (nginx, Caddy) with TLS.
- The `helmet` package sets secure HTTP response headers on all responses.
- Write operations are rate-limited to 200 requests per IP per minute.
- No passwords or secrets are stored in the codebase.

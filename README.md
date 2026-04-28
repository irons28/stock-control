# Stock Control

An operational inventory management system for purchasing, goods receiving, stock tracking, and sales order fulfilment.

Built with Express + SQLite (backend) and React + Vite (frontend).

---

## Project structure

```
stock-control/
├── backend/          Express REST API (Node 18+, SQLite)
├── frontend/         React SPA (Vite)
└── docs/             Migration and operational guides
```

---

## Quick start

### 1. Backend

```bash
cd backend
npm install
npm run dev        # starts on http://localhost:3001
```

To reset and re-seed the database:

```bash
npm run db:reset
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # starts on http://localhost:5173
```

Open `http://localhost:5173` in a browser. The sidebar status indicator turns green when the API is reachable.

---

## Running tests

### Backend (Node built-in test runner)

```bash
cd backend
npm test
```

### Frontend (Vitest)

```bash
cd frontend
npm test
```

---

## API overview

All endpoints are prefixed with `/api`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Database connectivity check |
| GET | `/api/customers` | All customers |
| GET | `/api/suppliers` | All suppliers |
| GET | `/api/products` | Product catalogue |
| GET | `/api/stock-locations` | Warehouse locations |
| GET | `/api/purchase-orders` | Purchase orders with supplier name |
| GET | `/api/sales-orders` | Sales orders with customer name |
| GET | `/api/stock-movements` | Full movement history |
| GET | `/api/goods-receiving` | Goods receipts |
| GET | `/api/serials?search=X` | Search serial numbers |
| GET | `/api/serials/:serial` | Serial detail and movement timeline |

Error responses always use the shape:

```json
{ "error": true, "message": "...", "details": {} }
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Backend listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `VITE_API_BASE_URL` | `http://localhost:3001/api` | Frontend API base URL |

---

## Data migration from Access

See [docs/access-migration-plan.md](docs/access-migration-plan.md) for the step-by-step guide to exporting data from Microsoft Access and importing it via the CSV import tool.

Import order: customers → suppliers → products → purchase orders → sales orders.

---

## Database

SQLite file is stored at `backend/data/stock-control.sqlite`.

The schema is created and migrated automatically on server start via `initDatabase()`. Seed data (sample customers, suppliers, products, and locations) is inserted using `INSERT OR IGNORE` so it is safe to restart.

To wipe and recreate from scratch: `cd backend && npm run db:reset`.

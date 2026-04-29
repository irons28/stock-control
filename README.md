# Stock Control App

Phase 1 establishes the project foundation for a full-stack stock control system covering purchase order receiving, sales order allocation, serial number tracking, partial deliveries, dashboards, and barcode or QR workflows.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite for local development
- API: REST

## Project Structure

```text
root/
  frontend/
  backend/
  docs/
  README.md
  .gitignore
  .env.example
```

## Getting Started

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` if you want to override the defaults.

- `PORT`: backend port
- `HOST`: backend host
- `FRONTEND_ORIGIN`: local CORS origin
- `DATABASE_PATH`: SQLite file location
- `VITE_API_BASE_URL`: frontend API base URL

## Resetting the Demo Database

Wipe and rebuild the database with realistic Phase 1 demo data:

```bash
cd backend
npm run db:reset
```

This seeds the following demo records:

### Purchase Orders

| Order   | Status         | Notes                                  |
|---------|----------------|----------------------------------------|
| PO-1001 | Overdue        | 5× TILL-001, 3× PRINTER-001 outstanding |
| PO-1002 | Part Received  | 1 of 3 tills received; rest due shortly |
| PO-1003 | Open           | Consumables restock, future delivery   |
| PO-1004 | Fully Received | 3× TILL-001, 30× LABEL-001 archived    |

### Sales Orders

| Order   | Status         | Notes                                  |
|---------|----------------|----------------------------------------|
| SO-2001 | Urgent         | Dispatch was due yesterday (Alpha Vet) |
| SO-2002 | Dispatch Ready | TILL-SN-1002 allocated, due tomorrow   |
| SO-2003 | Open           | Awaiting label stock allocation        |

### Serial Numbers

| Serial      | Status    |
|-------------|-----------|
| TILL-SN-1001 | Available  |
| TILL-SN-1002 | Allocated (SO-2002) |
| TILL-SN-1003 | Dispatched |
| TILL-SN-1004 | Received – awaiting allocation |

### Key Endpoints (after reset)

```
GET /api/dashboard/summary        — KPIs: overdue POs, urgent SOs, dispatch-ready items
GET /api/purchase-orders          — all four PO states
GET /api/sales-orders             — all three SO states
GET /api/serials/TILL-SN-1001     — available serial detail + movement history
GET /api/dispatch/ready           — SO-2002 ready to dispatch with TILL-SN-1002
```

## Current Scope

Phase 1 delivers the full stock control workflow: purchase order receiving, sales order allocation, serial number tracking, partial deliveries, goods receipt, dispatch, CSV imports, and a live dashboard.

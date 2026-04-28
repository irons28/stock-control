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

## Current Scope

This phase only delivers the platform foundation, navigation shell, health checks, environment wiring, and documentation. Business workflows and transactional logic will be added in later phases.

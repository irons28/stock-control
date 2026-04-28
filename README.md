# Stock Control Database Schema

This branch adds the first SQLite schema for the stock control system, plus sample data for local development.

## Backend setup

```bash
cd backend
npm install
npm run db:reset
npm run dev
```

## Database commands

- `npm run db:init`: create the schema if the database file does not exist yet
- `npm run db:reset`: drop existing tables, recreate the schema, and load the sample dataset

The SQLite database file is created at `backend/data/stock-control.sqlite` by default.

To use a different file, set `DATABASE_PATH` before running the backend or the database scripts.

## Seed data included

- 3 customers
- 3 suppliers
- 6 products
- 3 purchase orders
- 3 sales orders
- received goods, serial numbers, allocations, dispatches, and activity log entries

The sample data includes both serial-tracked and non-serial-tracked products so the schema can be exercised immediately after reset.

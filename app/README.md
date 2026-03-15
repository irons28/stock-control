# Stock Control

A stock control application for small businesses and stores that need to manage product inventory, suppliers, locations, and goods-in workflows.

## Phase 1

Phase 1 focuses on:

- product management
- supplier management
- internal stock locations
- a clean database foundation for purchasing, goods-in, holding, putaway, and dispatch

## Development

```bash
cd app
npm start
```

By default the app runs on `http://localhost:3001`.

## Import Tooling

CSV templates are available from the app at:

- `/api/import/templates`
- `/api/import/templates/:type`

Supported import types are:

- `suppliers`
- `customers`
- `locations`
- `products`
- `opening-stock`
- `serial-stock`
- `purchase-orders`
- `sales-orders`

Validate a CSV before applying it:

```bash
node scripts/import-data.js products ./my-products.csv --url=http://localhost:3001
```

Apply an import only after validation returns zero invalid rows:

```bash
node scripts/import-data.js products ./my-products.csv --apply --url=http://localhost:3001
```

Recommended import order:

1. suppliers, customers, locations
2. products
3. opening-stock and serial-stock
4. purchase-orders
5. sales-orders

For the full cutover sequence, see `migration-playbook.md`.


Phase A rule: purchase orders and sales orders are expected to be imported from the external system. Manual order creation is disabled by default in the app.

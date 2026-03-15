# Migration Playbook

## Objective

Move live stock-control data into the app in a controlled order and verify that the opening position is correct before go-live.

## Source Files To Prepare

Create one CSV for each of these:

1. suppliers
2. customers
3. locations
4. products
5. opening-stock
6. serial-stock
7. purchase-orders
8. sales-orders

Use the matching templates from `/api/import/templates/:type`.

## Recommended Sequence

1. Validate and import `suppliers`
2. Validate and import `customers`
3. Validate and import `locations`
4. Validate and import `products`
5. Validate and import `opening-stock`
6. Validate and import `serial-stock`
7. Validate and import `purchase-orders`

## Validation Rules To Watch

- `opening-stock` only supports non-serial products.
- `serial-stock` requires one row per serial number.
- `location_code` must already exist before stock imports.
- `purchase-orders` should only contain open or part-received orders.
- `sales-orders` should only contain open customer orders still to be fulfilled.
- Imported PO numbers must not already exist in the database.

## Reconciliation Checkpoints

After each import group, check the `Imports` tab in the app:

- required locations present
- no products missing suppliers
- quantity and serial totals look credible
- open purchase order count matches the live business position
- import run log shows `success` or expected `warning` only

## CLI Examples

```bash
node scripts/import-data.js suppliers ./migration/suppliers.csv --url=http://localhost:3001
node scripts/import-data.js suppliers ./migration/suppliers.csv --apply --url=http://localhost:3001
node scripts/import-data.js serial-stock ./migration/serial-stock.csv --apply --url=http://localhost:3001
```

## Go-Live Rule

Do not start using the app operationally until:

- master data is complete
- stock totals reconcile to the live stock position
- serial counts and locations reconcile
- open purchase orders have been loaded and checked
- open sales orders have been loaded and checked

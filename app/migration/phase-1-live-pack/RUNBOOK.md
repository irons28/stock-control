# Runbook

## Validation Pass

Run these first and fix every invalid row before applying anything.

```bash
node scripts/import-data.js suppliers ./migration/phase-1-live-pack/csv/01-suppliers.csv --url=http://localhost:3001
node scripts/import-data.js customers ./migration/phase-1-live-pack/csv/02-customers.csv --url=http://localhost:3001
node scripts/import-data.js locations ./migration/phase-1-live-pack/csv/03-locations.csv --url=http://localhost:3001
node scripts/import-data.js products ./migration/phase-1-live-pack/csv/04-products.csv --url=http://localhost:3001
node scripts/import-data.js opening-stock ./migration/phase-1-live-pack/csv/05-opening-stock.csv --url=http://localhost:3001
node scripts/import-data.js serial-stock ./migration/phase-1-live-pack/csv/06-serial-stock.csv --url=http://localhost:3001
node scripts/import-data.js purchase-orders ./migration/phase-1-live-pack/csv/07-purchase-orders.csv --url=http://localhost:3001
node scripts/import-data.js sales-orders ./migration/phase-1-live-pack/csv/08-sales-orders.csv --url=http://localhost:3001
```

## Apply Pass

Apply in the same order only after validation is clean.

```bash
node scripts/import-data.js suppliers ./migration/phase-1-live-pack/csv/01-suppliers.csv --apply --url=http://localhost:3001
node scripts/import-data.js customers ./migration/phase-1-live-pack/csv/02-customers.csv --apply --url=http://localhost:3001
node scripts/import-data.js locations ./migration/phase-1-live-pack/csv/03-locations.csv --apply --url=http://localhost:3001
node scripts/import-data.js products ./migration/phase-1-live-pack/csv/04-products.csv --apply --url=http://localhost:3001
node scripts/import-data.js opening-stock ./migration/phase-1-live-pack/csv/05-opening-stock.csv --apply --url=http://localhost:3001
node scripts/import-data.js serial-stock ./migration/phase-1-live-pack/csv/06-serial-stock.csv --apply --url=http://localhost:3001
node scripts/import-data.js purchase-orders ./migration/phase-1-live-pack/csv/07-purchase-orders.csv --apply --url=http://localhost:3001
node scripts/import-data.js sales-orders ./migration/phase-1-live-pack/csv/08-sales-orders.csv --apply --url=http://localhost:3001
```

## Reconciliation Checks

After each apply group, review the `Imports` tab in the app and confirm:

- required locations are present
- no products are missing suppliers
- quantity stock looks credible
- serial stock counts look credible
- open purchase order count matches the live business position
- open sales order count matches the live business position
- recent import runs show expected status only

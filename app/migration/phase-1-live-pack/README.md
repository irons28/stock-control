# Phase 1 Live Migration Pack

This folder is the working pack for the first real stock-control migration.

## Folder Layout

- `csv/`: live source files you will edit and import
- `reports/`: validation outputs and reconciliation notes
- `RUNBOOK.md`: the order to validate and apply each file
- `CHECKLIST.md`: migration checklist for sign-off

## CSV Files

1. `01-suppliers.csv`
2. `02-customers.csv`
3. `03-locations.csv`
4. `04-products.csv`
5. `05-opening-stock.csv`
6. `06-serial-stock.csv`
7. `07-purchase-orders.csv`
8. `08-sales-orders.csv`

Replace the sample rows with your real data and keep the headers unchanged.

## Important

- Do not import `opening-stock` until products and locations are complete.
- Do not import `serial-stock` until serial-tracked products exist.
- Do not import `purchase-orders` until suppliers and products reconcile.
- Save validation results in `reports/` so each pass is traceable.

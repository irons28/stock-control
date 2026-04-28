# Access Migration Plan

This document explains how to export data from Microsoft Access and import it into the Stock Control system using the CSV import tool.

---

## Overview

The migration works by exporting each table from Access as a CSV file, cleaning the data to match the expected column names, and then importing through the **Imports** page in the stock control app.

The import endpoints are:

| Endpoint | Description |
|---|---|
| `POST /api/import/customers` | Import customer records |
| `POST /api/import/suppliers` | Import supplier records |
| `POST /api/import/products` | Import product catalogue |
| `POST /api/import/purchase-orders` | Import purchase order headers |
| `POST /api/import/sales-orders` | Import sales order headers |

---

## Step 1: Export from Access to CSV

1. Open your Access database.
2. In the ribbon, go to **External Data → Export → Text File**.
3. Choose **Delimited** format and select **Comma** as the delimiter.
4. Check **Include Field Names on First Row**.
5. Save the file as `.csv`.

Repeat for each table you need to migrate.

---

## Step 2: Clean your CSV data

Before importing, review and clean each file:

- **Remove blank rows** at the top or bottom.
- **Rename column headers** to match the expected field names (see required and optional columns in the app).
- **Trim leading/trailing spaces** from codes and names.
- **Dates** should be in `YYYY-MM-DD` format (e.g., `2024-03-15`).
- **Prices** should be plain numbers without currency symbols (e.g., `12.99` not `£12.99`).
- **Status fields** should be `active` or `inactive`. Leave blank to default to `active`.
- For `tracking_mode` in products: use `serial` or `quantity`.

---

## Step 3: Import order

Import in this order to satisfy foreign key relationships:

### 1. Customers

**Required columns:** `code`, `name`

**Optional columns:** `contact_name`, `email`, `phone`, `address_line1`, `city`, `postcode`, `country`, `status`

**Example:**
```csv
code,name,contact_name,email,phone,address_line1,city,postcode,country
CUST-001,Acme Veterinary Ltd,Jane Smith,jane@acme.example,01234 567890,10 High St,London,EC1A 1BB,UK
CUST-002,River Farm Supplies,Tom Hill,tom@riverfarm.example,01234 111222,2 Mill Lane,Bristol,BS1 4AB,UK
```

---

### 2. Suppliers

**Required columns:** `code`, `name`

**Optional columns:** `contact_name`, `email`, `phone`, `address_line1`, `city`, `postcode`, `country`, `account_reference`, `status`

**Example:**
```csv
code,name,contact_name,email,phone,account_reference
SUP-001,Parts Direct Ltd,Bob Jones,bob@parts.example,01234 999000,PD-4421
SUP-002,MedEquip Wholesale,Carol Lane,carol@medequip.example,0121 500 6000,ME-0078
```

---

### 3. Products

**Required columns:** `sku`, `name`

**Optional columns:** `description`, `category`, `barcode`, `tracking_mode`, `unit_of_measure`, `cost_price`, `sell_price`, `status`, `supplier_code`

- `supplier_code` must match a `code` value from an already-imported supplier.
- `tracking_mode`: `serial` for individually tracked items, `quantity` for bulk/consumables.
- Products in the `Consumables` category are automatically flagged as consumable.

**Example:**
```csv
sku,name,category,tracking_mode,unit_of_measure,cost_price,sell_price,supplier_code
PROD-001,Examination Gloves,Consumables,quantity,box,4.50,9.99,SUP-002
PROD-002,Ultrasound Scanner,Equipment,serial,each,1200.00,1999.00,SUP-001
```

---

### 4. Purchase Orders

**Required columns:** `order_number`, `supplier_code`

**Optional columns:** `status`, `ordered_at`, `expected_at`, `notes`

- `supplier_code` must match an imported supplier.
- `status`: `draft`, `ordered`, `partial`, `received`, or `cancelled`.

**Example:**
```csv
order_number,supplier_code,status,ordered_at,expected_at,notes
PO-2024-001,SUP-001,ordered,2024-01-15,2024-02-01,Initial stock order
PO-2024-002,SUP-002,received,2024-01-20,2024-02-10,Consumables restock
```

---

### 5. Sales Orders

**Required columns:** `order_number`, `customer_code`

**Optional columns:** `status`, `requested_at`, `dispatch_due_at`, `notes`

- `customer_code` must match an imported customer.
- `status`: `draft`, `confirmed`, `allocated`, `dispatched`, or `cancelled`.

**Example:**
```csv
order_number,customer_code,status,requested_at,dispatch_due_at,notes
SO-2024-001,CUST-001,confirmed,2024-01-18,2024-02-05,Urgent delivery
SO-2024-002,CUST-002,draft,2024-01-22,,Hold pending stock
```

---

### 6. Serials and stock history (if available)

Serial numbers and stock movement history are not yet importable via CSV. If you have this data in Access:

- Export it to CSV for safekeeping.
- Stock items with serial numbers should be received through the goods receiving workflow once purchase orders are in the system.
- Historical movements are not migrated — the import establishes a clean starting point.

---

## Import behaviour

- **Existing records are not overwritten.** If a record with the same unique code or order number already exists, the row is skipped and reported in the results.
- **Row-level results** are shown after each import: how many rows were imported, skipped, or errored.
- **Error rows** include the reason (e.g., missing required field, supplier not found) so you can fix and re-import.
- All imports are logged in the activity log for audit purposes.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Supplier 'X' not found` | Import suppliers before products or purchase orders |
| `Customer 'X' not found` | Import customers before sales orders |
| `Missing required fields: code` | Ensure the CSV header row uses the exact field name `code` |
| `CSV contains no data rows` | Check that the file has at least one row after the header |
| Records already exist (skipped) | Expected if re-running — use a fresh database or different codes |

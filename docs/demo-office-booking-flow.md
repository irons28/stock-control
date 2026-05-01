# Demo: Office Booking Flow

An end-to-end walkthrough of the stock control system using a realistic EPOS equipment scenario.
Run this after `npm run db:reset` to start with clean demo data.

---

## Scenario

**Supplier:** EPOS Hardware Supplies Ltd (`SUP-EPOS`)
**Customer:** Example Retail Ltd (`CUST-EXAMPLE`)

A purchase order for EPOS equipment has been raised to fulfil a customer order for a new store fit-out.
The delivery arrives during the demo — you receive it, put the stock away, allocate it to the
customer order, and dispatch.

### Pre-seeded state

| Reference     | Type            | Status     | Contents                                            |
|---------------|-----------------|------------|-----------------------------------------------------|
| `PO-DEMO-001` | Purchase Order  | Confirmed  | 3× EPOS Till Terminal, 2× Receipt Printer (EPOS), 20× Label Rolls |
| `SO-DEMO-001` | Sales Order     | Confirmed  | 2× EPOS Till Terminal, 1× Receipt Printer (EPOS), 10× Label Rolls |

The PO and SO lines are pre-linked — the suggestion engine will highlight `SO-DEMO-001` immediately
after the goods receipt with the reason **"Linked to this purchase order"**.

---

## Step-by-step walkthrough

### Step 1 — Confirm the starting state

1. Open the **Dashboard**.
2. Confirm **PO-DEMO-001** appears in the purchase orders panel as "Confirmed / not yet received".
3. Confirm **SO-DEMO-001** appears in the sales orders panel as "Confirmed / nothing allocated".
4. Open **Purchase Orders**, search for `PO-DEMO-001`, click it. Verify:
   - 3× EPOS Till Terminal — qty received: 0
   - 2× Receipt Printer (EPOS) — qty received: 0
   - 20× Label Rolls — qty received: 0
5. Open **Sales Orders**, search for `SO-DEMO-001`, click it. Verify:
   - 2× EPOS Till Terminal — allocated: 0
   - 1× Receipt Printer (EPOS) — allocated: 0
   - 10× Label Rolls — allocated: 0

---

### Step 2 — Receive the delivery (Receive Goods)

A partial delivery arrives today: **2 tills**, **1 printer**, and **10 label rolls**.

1. Navigate to **Receive Goods**.
2. Enter purchase order number: **`PO-DEMO-001`** and press Search.
3. The form loads with the 3 PO lines. Fill in:

   | Product              | Qty to receive | Serials to scan                      |
   |----------------------|---------------|--------------------------------------|
   | EPOS Till Terminal   | 2             | `TILL-DEMO-001` then `TILL-DEMO-002` |
   | Receipt Printer (EPOS) | 1           | `PRINT-DEMO-001`                     |
   | Label Rolls          | 10            | *(qty only — no serials)*            |

4. Enter delivery note number: **`DN-DEMO-001`**
5. Click **Book Receipt**.
6. The system confirms receipt and the **Suggested Allocations** panel appears beneath it.

**Expected suggestions panel:**

- **SO-DEMO-001** — Example Retail Ltd
  - EPOS Till Terminal: 2 available / 2 needed → reasons: "Linked to this purchase order", "Matching product"
  - Receipt Printer (EPOS): 1 available / 1 needed → reason: "Linked to this purchase order"
  - Label Rolls: 10 available / 10 needed → reason: "Linked to this purchase order"
  - ⚠️ Each line shows **"Requires put-away"** notice (stock is in HOLD location)
  - **Go to SO →** button links directly to SO-DEMO-001

---

### Step 3 — Allocate serials to the sales order (Sales Orders)

1. Click **"Go to SO →"** on the suggestions panel (or navigate to **Sales Orders** and open `SO-DEMO-001`).
2. The order shows 3 unallocated lines. For each serial line, use the **Quick Apply** banner
   or the chip scanner input to scan/type the serial numbers.

   **EPOS Till Terminal line (need 2):**
   - Scan or type: `TILL-DEMO-001` → chip appears
   - Scan or type: `TILL-DEMO-002` → chip appears
   - Click **Allocate 2 serials** (or use **Select 2 serials** Quick Apply button)

   **Receipt Printer line (need 1):**
   - Scan or type: `PRINT-DEMO-001` → chip appears
   - Click **Allocate 1 serial**

   **Label Rolls line (need 10):**
   - The quantity input shows 10 available. Enter `10` in the quantity field.
   - Click **Allocate 10 rolls** (or use the Quick Apply **Fill 10 rolls** button)

3. After allocating all lines the **Dispatch** button becomes active.

**Expected state after allocation:**
- TILL-DEMO-001 → status: `allocated`, linked to SO-DEMO-001
- TILL-DEMO-002 → status: `allocated`, linked to SO-DEMO-001
- PRINT-DEMO-001 → status: `allocated`, linked to SO-DEMO-001
- Label Rolls → 10 units `allocated` against SO-DEMO-001

---

### Step 4 — Dispatch the order

1. On **SO-DEMO-001**, click **Dispatch Order**.
2. Confirm the dispatch in the dialog.
3. The page shows the 🚚 **Dispatch Celebration** state.

**Expected changes:**
- SO-DEMO-001 status → `dispatched`
- TILL-DEMO-001, TILL-DEMO-002, PRINT-DEMO-001 → `hold_status = dispatched`
- Label Rolls → `quantity_allocated` resets; `quantity_dispatched` increments by 10

---

### Step 5 — Verify in Serial Tracker

1. Navigate to **Serial Tracker**.
2. Search for `TILL-DEMO-001`. Verify the timeline shows:
   - **Received** — DN-DEMO-001, PO-DEMO-001
   - **Allocated** — SO-DEMO-001, Example Retail Ltd
   - **Dispatched**
3. Repeat for `TILL-DEMO-002` and `PRINT-DEMO-001`.

---

### Step 6 — Check remaining PO (optional)

1. Navigate to **Purchase Orders**, open `PO-DEMO-001`.
2. Confirm it shows as **partially received**:
   - EPOS Till Terminal: received 2 of 3
   - Receipt Printer: received 1 of 2
   - Label Rolls: received 10 of 20
3. The remaining items can be received on a future delivery against the same PO.

---

## Reference data

| Field             | Value                     |
|-------------------|---------------------------|
| Purchase order    | `PO-DEMO-001`             |
| Sales order       | `SO-DEMO-001`             |
| Supplier          | EPOS Hardware Supplies Ltd (`SUP-EPOS`) |
| Customer          | Example Retail Ltd (`CUST-EXAMPLE`) |
| Delivery note     | `DN-DEMO-001`             |
| Serial — Till 1   | `TILL-DEMO-001`           |
| Serial — Till 2   | `TILL-DEMO-002`           |
| Serial — Printer  | `PRINT-DEMO-001`          |
| Non-serial qty    | 10× Label Rolls           |

---

## Reset

To restart the demo from scratch:

```bash
npm run db:reset
```

This wipes and re-seeds the database. All demo data is deterministic — PO-DEMO-001 and SO-DEMO-001
are always created in the same state. Existing test data (PO-1001 through PO-1004, SO-2001 through
SO-2003, and all serial lifecycle examples) is preserved alongside the demo scenario.

# Stock Control Application - Phase 1 Specification

## 1. Purpose

This application is a separate product under the same umbrella as Warehouse Tracker.

It is intended for small businesses, stores, and product-led operations that:

- buy stock from suppliers
- receive stock against purchase orders
- place stock into holding before putaway
- store stock in shelf or bin locations
- dispatch stock to customers
- track serialised and non-serialised items

This is not a pallet-tracking system. The core model is product, stock movement, and order flow.

## 2. Product Positioning

### Warehouse Tracker

- designed for warehouses handling stock for multiple customers
- focused on pallet locations and warehouse movement
- location-first workflow

### Stock Control

- designed for a single business managing its own products
- focused on products, quantities, serial numbers, purchasing, and dispatch
- inventory-first workflow

## 3. Phase 1 Goal

Deliver a usable first release that supports the full basic stock lifecycle:

1. create products
2. create suppliers
3. create locations
4. raise purchase orders
5. receive stock against a purchase order
6. place stock into a holding location
7. move stock into shelf or bin locations
8. create customer orders
9. allocate and dispatch stock
10. view stock and movement history

## 4. Phase 1 Modules

### 4.1 Products

Store and manage:

- SKU
- product name
- description
- category
- barcode
- supplier default
- cost price
- selling price
- tax flag
- unit of measure
- serial tracking enabled or disabled
- active or inactive status

Two stock types must be supported:

- serialised items: tills, printers, scanners, card readers
- quantity items: labels, rolls, consumables, accessories

### 4.2 Suppliers

Store supplier records with:

- supplier name
- contact name
- phone
- email
- address
- account reference
- active or inactive status

### 4.3 Locations

Support simple internal locations such as:

- GOODS-IN
- HOLDING
- SHELF-A1
- SHELF-A2
- BIN-01
- VAN-STOCK
- DAMAGED

Each location should have:

- code
- name
- type
- active or inactive status

Suggested location types:

- holding
- shelf
- bin
- dispatch
- damaged
- vehicle

### 4.4 Purchase Orders

Allow users to:

- create PO number
- choose supplier
- add expected products
- add expected quantities
- set order status
- record notes and dates

Suggested PO statuses:

- draft
- ordered
- part_received
- received
- cancelled

### 4.5 Goods In

When stock arrives, staff should:

- search or open the purchase order
- confirm items received
- enter quantities received
- enter serial numbers for serialised products
- record exceptions such as short delivery or damaged stock

All received stock should initially go to a holding location.

### 4.6 Holding and Putaway

After goods-in, staff should:

- view stock currently in HOLDING
- move stock to final shelf or bin locations
- move all or part of a quantity line
- move specific serialised units individually

### 4.7 Customers and Sales Orders

Allow users to:

- create customer records
- create customer orders
- add order lines
- reserve stock
- dispatch stock

Suggested sales order statuses:

- draft
- allocated
- part_dispatched
- dispatched
- cancelled

### 4.8 Dispatch

Dispatch workflow must support:

- selecting stock from locations
- confirming quantities to send
- selecting serial numbers where required
- reducing available stock
- recording dispatch date
- recording carrier or reference note

### 4.9 Stock Search and Visibility

Users should be able to search by:

- SKU
- product name
- barcode
- serial number
- purchase order number
- customer order number
- location

The system should show:

- quantity on hand
- quantity in holding
- quantity allocated
- quantity available
- serialised stock records
- recent movements

### 4.10 Stock Adjustments

Allow authorised users to:

- increase stock
- decrease stock
- mark stock as damaged
- write off stock
- correct location mistakes

Each adjustment must require a reason.

### 4.11 Audit Log

Every important event should be recorded:

- PO created
- goods received
- serial number captured
- stock moved
- stock adjusted
- order allocated
- stock dispatched

## 5. Phase 1 User Roles

Initial roles:

- admin: full access
- manager: operational access and reporting
- staff: goods-in, putaway, dispatch, stock lookup

Phase 1 can keep role logic simple.

## 6. Phase 1 Screens

### Main screens

- Dashboard
- Products
- Product Details
- Suppliers
- Locations
- Purchase Orders
- Purchase Order Details
- Goods In
- Holding Stock
- Putaway
- Customers
- Sales Orders
- Dispatch
- Stock Search
- Adjustments
- Audit Log

### Dashboard widgets

- total products
- stock in holding
- low stock items
- open purchase orders
- open customer orders
- recent goods-in
- recent dispatches

## 7. Data Model

## 7.1 Core tables

- users
- sessions
- suppliers
- customers
- product_categories
- products
- locations
- purchase_orders
- purchase_order_lines
- goods_receipts
- goods_receipt_lines
- inventory_units
- inventory_balances
- stock_movements
- sales_orders
- sales_order_lines
- dispatches
- dispatch_lines
- adjustments
- activity_log

## 7.2 Table purpose

### products

One row per product master.

Important fields:

- sku
- name
- description
- category_id
- barcode
- serial_tracking
- unit_of_measure
- cost_price
- sell_price
- supplier_id
- reorder_level
- is_active

### purchase_orders

One row per PO header.

Important fields:

- po_number
- supplier_id
- status
- ordered_at
- expected_at
- notes

### purchase_order_lines

One row per product on a PO.

Important fields:

- purchase_order_id
- product_id
- qty_ordered
- qty_received
- unit_cost

### goods_receipts

One row per goods-in event.

Important fields:

- purchase_order_id
- received_at
- received_by
- notes

### goods_receipt_lines

One row per received product line.

Important fields:

- goods_receipt_id
- purchase_order_line_id
- product_id
- qty_received
- target_location_id

### inventory_units

Used only for serialised items.

One row per physical unit.

Important fields:

- product_id
- serial_number
- current_location_id
- status
- goods_receipt_line_id
- sales_order_line_id

Suggested statuses:

- in_holding
- available
- allocated
- dispatched
- damaged

### inventory_balances

Used for non-serialised stock totals by product and location.

Important fields:

- product_id
- location_id
- qty_on_hand
- qty_allocated

### stock_movements

Single source of truth for stock history.

Important fields:

- product_id
- movement_type
- qty
- from_location_id
- to_location_id
- serial_number
- reference_type
- reference_id
- created_at
- created_by

Suggested movement types:

- goods_in
- putaway
- transfer
- allocate
- deallocate
- dispatch
- adjustment_in
- adjustment_out
- damage

## 8. Key Business Rules

1. All goods received must first enter a holding location.
2. Serial-tracked products must capture a unique serial number for each unit received.
3. Non-serial products must be tracked by quantity per location.
4. Dispatch cannot exceed available stock.
5. Allocated stock must not be available for another order.
6. Every movement must create an audit trail.
7. Damaged stock must be separated from available stock.
8. Inactive products and locations cannot be used for new transactions.

## 9. Phase 1 Workflow Examples

### Goods In Workflow

1. user opens purchase order
2. user confirms delivered lines
3. user enters quantities received
4. user enters serial numbers if required
5. system creates goods receipt
6. system places stock into HOLDING
7. system updates PO received quantities
8. system writes stock movement records

### Putaway Workflow

1. user opens holding stock list
2. user selects product or unit
3. user selects destination location
4. system moves stock from HOLDING to shelf or bin
5. system writes movement history

### Dispatch Workflow

1. user creates customer order
2. user adds required products
3. system checks available stock
4. user allocates stock
5. user confirms dispatch
6. system reduces available stock
7. system updates serial or quantity records
8. system writes movement history

## 10. Reporting for Phase 1

Initial reports:

- current stock by product
- current stock by location
- serial number lookup
- goods received by date
- dispatched orders by date
- low stock report

## 11. Technical Direction

Build as a new application using the existing warehouse-tracker codebase as a technical starting point only.

Reuse where useful:

- Node.js and Express setup
- SQLite for initial release
- auth/session patterns
- mobile-friendly UI structure
- live update approach where helpful

Do not reuse the warehouse tracker data model.

## 12. Step-by-Step Delivery Plan

### Stage 1 - Foundation

- create new project folder
- rename application and update branding
- keep base server and frontend structure
- create clean database schema for stock control
- add initial seed locations such as GOODS-IN and HOLDING

### Stage 2 - Master Data

- build products module
- build suppliers module
- build locations module
- build customer module

### Stage 3 - Purchasing

- build purchase order header and line management
- add PO statuses
- add PO listing and detail pages

### Stage 4 - Goods In

- build receive-against-PO workflow
- add serial number capture
- create goods receipt records
- route all received stock into holding

### Stage 5 - Stock Storage

- build holding stock screen
- build putaway workflow
- build stock by location views

### Stage 6 - Sales and Dispatch

- build customer orders
- build allocation logic
- build dispatch workflow
- reduce stock correctly for serial and quantity items

### Stage 7 - Controls

- build stock adjustments
- build audit log views
- add low stock indicators

### Stage 8 - Hardening

- test key workflows
- validate edge cases
- improve permissions
- prepare deployment and backup approach

## 13. When Coding Should Start

Coding should start after these three decisions are confirmed:

1. application name
2. whether to keep SQLite for phase 1
3. whether we clone the latest warehouse tracker code into a new project folder or start with a clean minimal shell

Recommended answers:

- name: Stock Control
- database: SQLite for phase 1
- starting point: clone the latest warehouse tracker structure and refactor into the new app

## 14. First Build Sprint

The first coding sprint should only cover:

- project setup
- branding rename
- clean database schema
- products
- suppliers
- locations

That keeps the first milestone small and gives a stable base before purchasing and dispatch are added.

## 15. Definition of Done for Phase 1

Phase 1 is complete when a user can:

1. create a product
2. create a supplier
3. create a purchase order
4. receive stock into holding
5. capture serial numbers where needed
6. move stock into shelf or bin locations
7. create a customer order
8. dispatch stock
9. search stock by SKU, serial, and location
10. view full movement history

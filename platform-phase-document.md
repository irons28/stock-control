# Stock Operations Platform Phase Document

## Purpose

This document defines how the stock-control application should evolve from a single-use stock tool into one shared platform that can support multiple businesses and multiple operational sectors.

The recommended direction is:

- one shared platform
- one core stock engine
- business-level configuration
- sector-specific modules layered on top

This avoids maintaining separate codebases while still allowing the app to behave differently for different customers.

## Product Positioning

Working platform name:

`Stock Operations Platform`

Example solution profiles on top of the platform:

- `Retail / Warehouse Fulfilment`
- `Veterinary Stock Management`
- later, other stock-holding businesses with receiving, movement, and dispatch needs

## Platform Principles

1. One source of stock truth
   The platform should maintain the definitive stock position by product, location, serial, batch, and movement history.

2. External systems may remain the system of record for commercial documents
   Sales orders and purchase orders may be created elsewhere and imported or synced into the platform for warehouse execution.

3. Workflows should be role-based and business-type aware
   Users should only see the workflows relevant to their business type and permissions.

4. Core stock logic must remain shared
   Receiving, transfer, allocation, dispatch, adjustment, audit, and reconciliation should not be duplicated between sectors.

5. Industry-specific needs should be additive, not invasive
   Veterinary controls such as batch and expiry should extend the platform without breaking retail and warehouse workflows.

## Core Platform Scope

These are the functions every business profile should share.

### Core Master Data

- businesses
- users
- roles and permissions
- products / SKUs
- suppliers
- customers or service accounts
- locations
- product categories
- tracking rules

### Core Stock Engine

- quantity-based stock balances
- serial-tracked inventory units
- stock movements
- holding / quarantine locations
- transfers between locations
- putaway into storage locations
- dispatch / issue out
- stock adjustments
- audit trail
- import history
- reconciliation checks

### Core Reporting

- stock by location
- stock by product
- stock movement history
- low stock / reorder watch
- open inbound workload
- open outbound workload
- adjustment reporting
- import and migration status

### Core Operations UI

- overview dashboard
- setup
- inbound
- outbound
- control
- reports
- imports / reconciliation

## Sector Module: Retail / Warehouse Fulfilment

This module is aimed at businesses like Swan Retail and other companies that receive, store, build, and dispatch stock.

### Typical Workflow

1. purchase order created in another system
2. purchase order imported into platform
3. goods received against PO
4. serials captured where required
5. stock placed into holding
6. stock put away into shelf/bin/rack locations
7. sales order imported from another system
8. stock allocated to order
9. order picked / built / packed
10. order dispatched to customer

### Required Features

- imported purchase orders
- goods in against purchase order
- imported sales orders
- allocation to sales order
- dispatch workflow
- customer fulfilment visibility
- shelf/bin/rack location structure
- serial capture for selected products
- quantity stock for consumables
- adjustment controls for missing, damaged, or found stock

### Optional Enhancements

- pick list generation
- dispatch labels
- courier reference capture
- build status / ready-to-ship status
- barcode scanning support
- returns handling

## Sector Module: Veterinary Stock Management

This module is aimed at practices with central stock and mobile veterinarians or field staff carrying controlled stock.

### Typical Workflow

1. clinic receives stock centrally
2. stock stored in clinic locations
3. stock transferred to van, vet bag, or mobile kit
4. stock used during appointments or visits
5. usage recorded against patient, visit, or job
6. remaining stock stays assigned to mobile location
7. replenishment sent from clinic back to mobile user
8. expired, damaged, or wasted stock adjusted with reason

### Required Features

- clinic locations
- vehicle / van locations
- mobile bag / kit locations
- transfer to mobile locations
- issue and usage recording
- batch / lot tracking
- expiry date tracking
- wastage and expired stock workflows
- higher audit control for regulated stock
- replenishment management

### Optional Enhancements

- patient reference on stock usage
- appointment / visit reference on stock usage
- controlled drug logs
- stock count by vehicle
- mobile offline capture and later sync

## Shared Platform vs Sector Modules

### Shared Core

These should remain common to every version of the app:

- product definitions
- stock balances
- serial tracking
- location model
- stock movements
- adjustments
- import tooling
- reconciliation
- permissions
- audit logging

### Sector-Specific Layer

These should be enabled only where needed:

- sales order import and dispatch workflow
- purchase order import and goods-in workflow
- patient/job/visit usage workflow
- batch tracking
- expiry controls
- mobile van/kit location behaviour
- controlled stock controls

## Configuration Model

Each customer business should have a profile that controls which modules are enabled.

### Proposed Business Profile Settings

- `business_type`
- `uses_purchase_order_import`
- `uses_sales_order_import`
- `uses_dispatch_workflow`
- `uses_serial_tracking`
- `uses_batch_tracking`
- `uses_expiry_tracking`
- `uses_mobile_locations`
- `uses_usage_transactions`
- `uses_controlled_stock_rules`

### Example Business Profiles

#### Swan Retail Style Profile

- business_type: retail_fulfilment
- uses_purchase_order_import: true
- uses_sales_order_import: true
- uses_dispatch_workflow: true
- uses_serial_tracking: true
- uses_batch_tracking: false
- uses_expiry_tracking: false
- uses_mobile_locations: false
- uses_usage_transactions: false
- uses_controlled_stock_rules: false

#### Veterinary Profile

- business_type: veterinary
- uses_purchase_order_import: true
- uses_sales_order_import: optional
- uses_dispatch_workflow: limited
- uses_serial_tracking: optional
- uses_batch_tracking: true
- uses_expiry_tracking: true
- uses_mobile_locations: true
- uses_usage_transactions: true
- uses_controlled_stock_rules: true

## Data Model Direction

The current schema is a good early phase base, but to support platform-level reuse it should evolve.

### Core Tables To Keep and Expand

- businesses
- users
- suppliers
- customers
- product_categories
- products
- locations
- inventory_balances
- inventory_units
- stock_movements
- adjustments
- activity_log
- import_runs

### New or Expanded Tables Recommended

- `businesses`
  One record per client business using the platform.

- `business_settings`
  Feature flags and business-specific behaviour.

- `documents`
  Shared header table for imported purchase orders, sales orders, transfers, usage documents, and dispatches.

- `document_lines`
  Shared line table for external and internal document lines.

- `stock_batches`
  Batch / lot tracking for medicines and other batch-controlled stock.

- `usage_transactions`
  Stock consumption records for visit, patient, or job usage.

- `mobile_units`
  Optional metadata for vans, mobile teams, or field kits.

### Important Schema Rules

- add `business_id` to all operational tables
- support both quantity stock and individually tracked units
- support optional `serial_number`
- support optional `batch_number`
- support optional `expiry_date`
- preserve immutable movement history
- preserve external document references

## UX Direction

The same app should present different workflows depending on the business profile.

### Shared Navigation Base

- Overview
- Setup
- Inbound
- Outbound
- Control
- Reports
- Imports

### Retail / Warehouse Navigation Behaviour

Show:

- imported purchase orders
- goods in
- holding / putaway
- imported sales orders
- allocation
- dispatch

Hide or disable:

- patient usage
- batch expiry administration if not in use
- mobile van controls if not in use

### Veterinary Navigation Behaviour

Show:

- clinic stock
- van / mobile kit stock
- transfers to mobile teams
- stock usage
- expiry and batch monitoring
- wastage / quarantine / controlled stock actions

Hide or disable:

- customer dispatch workflows if not needed
- retail order allocation screens if not needed

## Delivery Phases

### Phase A: Refocus Current App

Goal:
Turn the current app into a warehouse execution tool rather than a document-entry system.

Deliver:

- remove or hide create purchase order form
- remove or hide create sales order form
- rely on imported purchase and sales orders
- keep receive, putaway, allocate, dispatch, and adjustments
- strengthen import and reconciliation tools

### Phase B: Multi-Business Foundation

Goal:
Allow one platform instance to support multiple separate businesses.

Deliver:

- introduce `businesses`
- add `business_id` to operational tables
- scope users, products, locations, and movements by business
- add business profile configuration

### Phase C: Modular Workflow Controls

Goal:
Make the UI and workflows business-profile aware.

Deliver:

- feature flags
- role-based navigation
- sector-specific views
- configurable dashboard panels

### Phase D: Batch and Expiry Controls

Goal:
Support regulated or expiry-sensitive stock.

Deliver:

- batch / lot records
- expiry date support
- expiry reporting
- batch traceability
- write-off / expired stock workflow

### Phase E: Veterinary Module

Goal:
Support clinic plus mobile vet operations.

Deliver:

- mobile locations
- transfer to vans / vet bags
- usage transactions
- replenishment workflows
- controlled stock controls

## Immediate Recommendation

The immediate next platform step should be `Phase A`.

That means:

- keep the current stock engine
- stop treating this app as the place where orders are created
- treat it as the operational execution and stock-traceability system
- import commercial documents from the external system

This is the cleanest fit for Swan Retail and still leaves the platform in a strong position for veterinary and other verticals later.

## Summary

Recommended strategy:

- one platform
- one shared stock engine
- modular sector workflows
- multi-business support
- imported external documents where appropriate
- industry-specific extensions only where needed

This gives the best balance between reuse, maintainability, and commercial flexibility.

# Phase 1 Blueprint

## Goal

Create a professional project foundation for a stock control platform that supports inbound receiving, outbound allocation, serial traceability, operational dashboards, and barcode or QR-assisted workflows.

## System Vision

The application will help warehouse and operations teams manage stock from supplier purchase orders through goods receiving, internal availability, sales order allocation, and dispatch. It is being structured to stay simple for local development while remaining scalable enough for future workflow expansion.

## Planned Modules

### Dashboard

- Operational health summary
- Open order counts
- Receiving and dispatch exceptions
- Inventory accuracy indicators

### Purchase Orders

- Supplier purchase order list
- Expected delivery tracking
- Ordered versus received visibility
- Partial receipt readiness

### Receive Goods

- Receipt workflow for inbound deliveries
- Quantity capture by line
- Serial and batch capture hooks
- Damage and discrepancy logging points

### Sales Orders

- Customer order visibility
- Allocation status overview
- Reserved versus available stock monitoring
- Partial delivery support planning

### Serial Tracker

- Serial number search
- Inbound and outbound traceability
- Stock status visibility by serial
- Future audit and recall support

### Dispatch

- Pick and dispatch workflow staging
- Shipment confirmation points
- Parcel or pallet level tracking hooks
- Delivery completion support

### Imports

- Controlled CSV import entry points
- Validation and preview flow placeholders
- Error handling and reconciliation planning

## Technical Foundation

- React + Vite frontend for a fast local developer experience
- Express REST API backend
- SQLite for local development storage
- Environment-based configuration
- Health checks, error handling, and modular structure from day one

## Out Of Scope For Phase 1

- Purchase and sales order business logic
- Allocation engine
- Receiving transactions
- Serial number validation rules
- Barcode scanning logic
- Reporting calculations

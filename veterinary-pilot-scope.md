# Veterinary Pilot Scope

## Objective

Turn the stock-control platform into a veterinary pilot focused on clinic stock, van or kit replenishment, and field usage tracking.

## Minimum Useful Pilot

The pilot should support:

1. clinic as the central stock location
2. vans and kits as mobile stock locations
3. stock transfer from clinic to mobile locations
4. stock usage from mobile locations
5. stock adjustments for damaged, expired, or found stock
6. imported purchase orders if needed for clinic receiving
7. optional imported sales orders only if customer shipment handling is required

## First Workflow Set

This branch should prove these workflows:

- receive stock into clinic or holding
- transfer stock to van or kit
- record field usage against a visit, patient, or job reference
- review recent transfers
- review recent usage transactions
- audit stock movement history

## Not Yet In This Pilot

These should come after the first pilot review:

- batch / lot tracking
- expiry dates
- controlled drug controls
- patient master records
- appointment integration
- offline mobile capture

## Success Criteria

The pilot is useful if a practice can:

- see what stock is in the clinic
- see what stock is in each van or kit
- replenish a van or kit from the clinic
- record what was used in the field
- trace movements afterwards

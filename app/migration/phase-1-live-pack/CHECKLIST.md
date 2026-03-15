# Migration Checklist

## Master Data

- [ ] Suppliers exported from live system
- [ ] Customers exported from live system
- [ ] Locations defined and reviewed
- [ ] Products exported from live system
- [ ] Products checked for missing supplier values
- [ ] Serial-tracked products identified clearly

## Stock Data

- [ ] Opening stock prepared for non-serial items only
- [ ] Serial stock prepared with one row per serial number
- [ ] Shelf/bin/holding location codes match imported locations
- [ ] Quantity totals checked against live stock position
- [ ] Serial counts checked against live stock position

## Purchasing Data

- [ ] Only open or part-received purchase orders included
- [ ] PO numbers unique
- [ ] Product SKUs on PO lines exist in products file
- [ ] Supplier names on PO lines match suppliers file

## Validation

- [ ] Suppliers validated
- [ ] Customers validated
- [ ] Locations validated
- [ ] Products validated
- [ ] Opening stock validated
- [ ] Serial stock validated
- [ ] Purchase orders validated
- [ ] Sales orders validated

## Go-Live Review

- [ ] Import runs recorded successfully in app
- [ ] Reconciliation screen reviewed
- [ ] Required locations all present
- [ ] No unresolved migration warnings remain

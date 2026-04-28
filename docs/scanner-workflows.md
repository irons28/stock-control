# Scanner Workflows

## How scanners behave

Most barcode and QR scanners behave like keyboards. They type the scanned value into whichever field has focus, then usually send an `Enter` or carriage return keypress.

## Recommended scanner setting

Use a scanner profile that appends `Enter` or `Carriage Return` after each scan. That lets the app submit the scan immediately without an extra click or tap.

## Where scanning is supported

- `Purchase Orders` includes a `Receive Goods Serial Entry` panel for scanner-first serial capture during inbound receiving.
- `Serial Tracker` accepts scanned serials for traceability lookups and keeps a removable list of recent searches.
- `Sales Orders` includes a `Dispatch Check` placeholder panel for outbound scanning flows and future dispatch validation work.

## UI expectations

- Keep the scanner field focused before scanning.
- Pressing `Enter` submits the typed or scanned value.
- Leading and trailing whitespace is trimmed before the value is processed.
- Duplicate serial prevention can be enabled per workflow when repeated scans should be blocked.

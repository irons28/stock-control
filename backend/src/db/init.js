const { all, get, run } = require("./connection");

async function hasColumn(tableName, columnName) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

async function addColumnIfMissing(tableName, columnDefinition) {
  const [columnName] = columnDefinition.trim().split(/\s+/);

  if (await hasColumn(tableName, columnName)) {
    return;
  }

  await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
}

async function ensureRecord({ selectSql, selectParams = [], insertSql, insertParams = [] }) {
  const existing = await get(selectSql, selectParams);

  if (existing?.id) {
    return existing.id;
  }

  const result = await run(insertSql, insertParams);
  return result.id;
}

async function createCoreTables() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    status TEXT NOT NULL DEFAULT 'active',
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address_line1 TEXT DEFAULT '',
    city TEXT DEFAULT '',
    postcode TEXT DEFAULT '',
    country TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address_line1 TEXT DEFAULT '',
    city TEXT DEFAULT '',
    postcode TEXT DEFAULT '',
    country TEXT DEFAULT '',
    account_reference TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT '',
    barcode TEXT DEFAULT '',
    default_supplier_id INTEGER,
    tracking_mode TEXT NOT NULL DEFAULT 'quantity',
    is_serial_tracked INTEGER NOT NULL DEFAULT 0,
    is_consumable INTEGER NOT NULL DEFAULT 0,
    unit_of_measure TEXT NOT NULL DEFAULT 'each',
    cost_price REAL NOT NULL DEFAULT 0,
    sell_price REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (default_supplier_id) REFERENCES suppliers(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS stock_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    location_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL,
    customer_id INTEGER,
    linked_sales_order_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    ordered_at TEXT,
    expected_at TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (linked_sales_order_id) REFERENCES sales_orders(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    linked_purchase_order_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    requested_at TEXT,
    dispatch_due_at TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (linked_purchase_order_id) REFERENCES purchase_orders(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales_order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sales_order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    linked_purchase_order_line_id INTEGER,
    quantity_ordered REAL NOT NULL DEFAULT 0,
    quantity_allocated REAL NOT NULL DEFAULT 0,
    quantity_dispatched REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (linked_purchase_order_line_id) REFERENCES purchase_order_lines(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity_ordered REAL NOT NULL DEFAULT 0,
    quantity_received REAL NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0,
    linked_sales_order_line_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (linked_sales_order_line_id) REFERENCES sales_order_lines(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS goods_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    receipt_number TEXT NOT NULL UNIQUE,
    delivery_number TEXT DEFAULT '',
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    received_by TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS goods_receipt_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_receipt_id INTEGER NOT NULL,
    purchase_order_line_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    holding_location_id INTEGER NOT NULL,
    quantity_received REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goods_receipt_id) REFERENCES goods_receipts(id),
    FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (holding_location_id) REFERENCES stock_locations(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS stock_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    stock_location_id INTEGER,
    actual_location_id INTEGER,
    serial_number TEXT,
    quantity_on_hand REAL NOT NULL DEFAULT 0,
    quantity_allocated REAL NOT NULL DEFAULT 0,
    hold_status TEXT NOT NULL DEFAULT 'available',
    hold_reason TEXT DEFAULT '',
    linked_purchase_order_id INTEGER,
    linked_purchase_order_line_id INTEGER,
    linked_sales_order_id INTEGER,
    linked_sales_order_line_id INTEGER,
    customer_id INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (stock_location_id) REFERENCES stock_locations(id),
    FOREIGN KEY (actual_location_id) REFERENCES stock_locations(id),
    FOREIGN KEY (linked_purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (linked_purchase_order_line_id) REFERENCES purchase_order_lines(id),
    FOREIGN KEY (linked_sales_order_id) REFERENCES sales_orders(id),
    FOREIGN KEY (linked_sales_order_line_id) REFERENCES sales_order_lines(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movement_type TEXT NOT NULL,
    stock_item_id INTEGER,
    product_id INTEGER NOT NULL,
    source_location_id INTEGER,
    destination_location_id INTEGER,
    actual_source_location_id INTEGER,
    actual_destination_location_id INTEGER,
    quantity REAL NOT NULL DEFAULT 0,
    linked_purchase_order_id INTEGER,
    linked_sales_order_id INTEGER,
    customer_id INTEGER,
    moved_by_user_id INTEGER,
    reference_type TEXT DEFAULT '',
    reference_id INTEGER,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (source_location_id) REFERENCES stock_locations(id),
    FOREIGN KEY (destination_location_id) REFERENCES stock_locations(id),
    FOREIGN KEY (actual_source_location_id) REFERENCES stock_locations(id),
    FOREIGN KEY (actual_destination_location_id) REFERENCES stock_locations(id),
    FOREIGN KEY (linked_purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (linked_sales_order_id) REFERENCES sales_orders(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (moved_by_user_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS purchase_sales_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_line_id INTEGER NOT NULL,
    sales_order_line_id INTEGER NOT NULL,
    quantity_linked REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id),
    FOREIGN KEY (sales_order_line_id) REFERENCES sales_order_lines(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_item_id INTEGER,
    serial_number TEXT,
    activity_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    reference_type TEXT DEFAULT '',
    reference_id INTEGER,
    payload_json TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
  )`);
}

async function applySchemaMigrations() {
  await addColumnIfMissing("customers", "address_line1 TEXT DEFAULT ''");
  await addColumnIfMissing("customers", "city TEXT DEFAULT ''");
  await addColumnIfMissing("customers", "postcode TEXT DEFAULT ''");
  await addColumnIfMissing("customers", "country TEXT DEFAULT ''");

  await addColumnIfMissing("suppliers", "address_line1 TEXT DEFAULT ''");
  await addColumnIfMissing("suppliers", "city TEXT DEFAULT ''");
  await addColumnIfMissing("suppliers", "postcode TEXT DEFAULT ''");
  await addColumnIfMissing("suppliers", "country TEXT DEFAULT ''");

  await addColumnIfMissing("products", "category TEXT DEFAULT ''");
  await addColumnIfMissing("products", "barcode TEXT DEFAULT ''");
  await addColumnIfMissing("products", "is_serial_tracked INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("products", "is_consumable INTEGER NOT NULL DEFAULT 0");

  await addColumnIfMissing("purchase_orders", "customer_id INTEGER REFERENCES customers(id)");
  await addColumnIfMissing("purchase_orders", "linked_sales_order_id INTEGER REFERENCES sales_orders(id)");

  await addColumnIfMissing("sales_orders", "linked_purchase_order_id INTEGER REFERENCES purchase_orders(id)");
  await addColumnIfMissing("sales_order_lines", "linked_purchase_order_line_id INTEGER REFERENCES purchase_order_lines(id)");

  await addColumnIfMissing("goods_receipts", "delivery_number TEXT DEFAULT ''");

  await addColumnIfMissing("stock_movements", "stock_item_id INTEGER REFERENCES stock_items(id)");
  await addColumnIfMissing("stock_movements", "actual_source_location_id INTEGER REFERENCES stock_locations(id)");
  await addColumnIfMissing("stock_movements", "actual_destination_location_id INTEGER REFERENCES stock_locations(id)");
  await addColumnIfMissing("stock_movements", "linked_purchase_order_id INTEGER REFERENCES purchase_orders(id)");
  await addColumnIfMissing("stock_movements", "linked_sales_order_id INTEGER REFERENCES sales_orders(id)");
  await addColumnIfMissing("stock_movements", "customer_id INTEGER REFERENCES customers(id)");
  await addColumnIfMissing("stock_movements", "moved_by_user_id INTEGER REFERENCES users(id)");
}

async function seedReferenceData() {
  await run(`INSERT OR IGNORE INTO customers (
    code, name, contact_name, email, phone, address_line1, city, postcode, country
  ) VALUES (
    'CUST-ALPHA',
    'Alpha Veterinary Group',
    'Sophie Turner',
    'orders@alphavet.example',
    '0207 100 1001',
    '12 Clinic Road',
    'London',
    'SW1A 1AA',
    'UK'
  )`);

  await run(`INSERT OR IGNORE INTO customers (
    code, name, contact_name, email, phone, address_line1, city, postcode, country
  ) VALUES (
    'CUST-HARBOR',
    'Harbor Retail Ltd',
    'Daniel Price',
    'stock@harborretail.example',
    '0161 200 3004',
    '44 Exchange Street',
    'Manchester',
    'M1 2AB',
    'UK'
  )`);

  await run(`INSERT OR IGNORE INTO suppliers (
    code, name, contact_name, email, phone, address_line1, city, postcode, country, account_reference
  ) VALUES (
    'SUP-NEXUS',
    'Nexus Hardware Supply',
    'Leah Morgan',
    'sales@nexushardware.example',
    '0113 400 5006',
    '7 Foundry Park',
    'Leeds',
    'LS1 4EF',
    'UK',
    'NH-2045'
  )`);

  await run(`INSERT OR IGNORE INTO suppliers (
    code, name, contact_name, email, phone, address_line1, city, postcode, country, account_reference
  ) VALUES (
    'SUP-CONSUMIX',
    'Consumix Distribution',
    'Jake Bennett',
    'trade@consumix.example',
    '0121 600 7008',
    '88 Meridian Way',
    'Birmingham',
    'B1 3CD',
    'UK',
    'CD-8841'
  )`);

  await run(`INSERT OR IGNORE INTO products (
    sku, name, description, category, barcode, default_supplier_id, tracking_mode,
    is_serial_tracked, is_consumable, unit_of_measure, cost_price, sell_price
  ) VALUES (
    'TILL-001',
    'Smart Till Terminal',
    'Android countertop till terminal',
    'Hardware',
    '5010000000011',
    (SELECT id FROM suppliers WHERE code = 'SUP-NEXUS'),
    'serial',
    1,
    0,
    'each',
    325.00,
    499.00
  )`);

  await run(`INSERT OR IGNORE INTO products (
    sku, name, description, category, barcode, default_supplier_id, tracking_mode,
    is_serial_tracked, is_consumable, unit_of_measure, cost_price, sell_price
  ) VALUES (
    'PRINTER-001',
    'Receipt Printer',
    'Thermal receipt printer',
    'Hardware',
    '5010000000028',
    (SELECT id FROM suppliers WHERE code = 'SUP-NEXUS'),
    'serial',
    1,
    0,
    'each',
    110.00,
    179.00
  )`);

  await run(`INSERT OR IGNORE INTO products (
    sku, name, description, category, barcode, default_supplier_id, tracking_mode,
    is_serial_tracked, is_consumable, unit_of_measure, cost_price, sell_price
  ) VALUES (
    'SCANNER-001',
    'Bluetooth Scanner',
    'Handheld barcode scanner',
    'Hardware',
    '5010000000035',
    (SELECT id FROM suppliers WHERE code = 'SUP-NEXUS'),
    'serial',
    1,
    0,
    'each',
    58.00,
    95.00
  )`);

  await run(`INSERT OR IGNORE INTO products (
    sku, name, description, category, barcode, default_supplier_id, tracking_mode,
    is_serial_tracked, is_consumable, unit_of_measure, cost_price, sell_price
  ) VALUES (
    'ROLL-001',
    'Thermal Till Roll',
    '80mm thermal paper roll',
    'Consumables',
    '5010000000042',
    (SELECT id FROM suppliers WHERE code = 'SUP-CONSUMIX'),
    'quantity',
    0,
    1,
    'roll',
    1.10,
    2.25
  )`);

  await run(`INSERT OR IGNORE INTO products (
    sku, name, description, category, barcode, default_supplier_id, tracking_mode,
    is_serial_tracked, is_consumable, unit_of_measure, cost_price, sell_price
  ) VALUES (
    'LABEL-001',
    'Shelf Edge Labels',
    'Pack of shelf edge labels',
    'Consumables',
    '5010000000059',
    (SELECT id FROM suppliers WHERE code = 'SUP-CONSUMIX'),
    'quantity',
    0,
    1,
    'pack',
    3.20,
    6.50
  )`);

  await run(`INSERT OR IGNORE INTO stock_locations (
    code, name, location_type
  ) VALUES (
    'RECEIVING',
    'Receiving',
    'receiving'
  )`);

  await run(`INSERT OR IGNORE INTO stock_locations (
    code, name, location_type
  ) VALUES (
    'HOLD',
    'Hold',
    'holding'
  )`);

  await run(`INSERT OR IGNORE INTO stock_locations (
    code, name, location_type
  ) VALUES (
    'CONSUMABLES',
    'Consumables',
    'consumable'
  )`);

  await run(`INSERT OR IGNORE INTO stock_locations (
    code, name, location_type
  ) VALUES (
    'DISPATCH',
    'Dispatch',
    'dispatch'
  )`);

  await run(`INSERT OR IGNORE INTO stock_locations (
    code, name, location_type
  ) VALUES (
    'RACK-A1',
    'Rack A1',
    'rack'
  )`);
}

async function createIndexes() {
  await run(`CREATE INDEX IF NOT EXISTS idx_products_default_supplier_id ON products(default_supplier_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_products_tracking_flags ON products(is_serial_tracked, is_consumable)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_customer_id ON purchase_orders(customer_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_linked_sales_order_id ON purchase_orders(linked_sales_order_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id ON sales_orders(customer_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sales_orders_linked_purchase_order_id ON sales_orders(linked_purchase_order_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_goods_receipts_purchase_order_id ON goods_receipts(purchase_order_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_items_product_id ON stock_items(product_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_items_stock_location_id ON stock_items(stock_location_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_items_actual_location_id ON stock_items(actual_location_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_items_hold_status ON stock_items(hold_status)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_items_serial_number ON stock_items(serial_number) WHERE serial_number IS NOT NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_stock_item_id ON stock_movements(stock_item_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_linked_purchase_order_id ON stock_movements(linked_purchase_order_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_linked_sales_order_id ON stock_movements(linked_sales_order_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_activity_log_serial_number ON activity_log(serial_number)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_activity_log_stock_item_id ON activity_log(stock_item_id)`);
}

async function seedOperationalData() {
  const po1001Id = await ensureRecord({
    selectSql: "SELECT id FROM purchase_orders WHERE order_number = ?",
    selectParams: ["PO-1001"],
    insertSql: `INSERT INTO purchase_orders (
      order_number, supplier_id, status, ordered_at, expected_at, notes
    ) VALUES (
      'PO-1001',
      (SELECT id FROM suppliers WHERE code = 'SUP-NEXUS'),
      'received',
      '2026-04-08T09:00:00.000Z',
      '2026-04-10T09:00:00.000Z',
      'Inbound smart till replenishment'
    )`,
  });

  const po1002Id = await ensureRecord({
    selectSql: "SELECT id FROM purchase_orders WHERE order_number = ?",
    selectParams: ["PO-1002"],
    insertSql: `INSERT INTO purchase_orders (
      order_number, supplier_id, status, ordered_at, expected_at, notes
    ) VALUES (
      'PO-1002',
      (SELECT id FROM suppliers WHERE code = 'SUP-NEXUS'),
      'received',
      '2026-04-09T11:00:00.000Z',
      '2026-04-12T10:00:00.000Z',
      'Receipt printers for outbound orders'
    )`,
  });

  const po1003Id = await ensureRecord({
    selectSql: "SELECT id FROM purchase_orders WHERE order_number = ?",
    selectParams: ["PO-1003"],
    insertSql: `INSERT INTO purchase_orders (
      order_number, supplier_id, status, ordered_at, expected_at, notes
    ) VALUES (
      'PO-1003',
      (SELECT id FROM suppliers WHERE code = 'SUP-NEXUS'),
      'received',
      '2026-04-11T08:30:00.000Z',
      '2026-04-14T08:30:00.000Z',
      'Bluetooth scanner replenishment'
    )`,
  });

  const so2001Id = await ensureRecord({
    selectSql: "SELECT id FROM sales_orders WHERE order_number = ?",
    selectParams: ["SO-2001"],
    insertSql: `INSERT INTO sales_orders (
      order_number, customer_id, status, requested_at, dispatch_due_at, notes
    ) VALUES (
      'SO-2001',
      (SELECT id FROM customers WHERE code = 'CUST-ALPHA'),
      'allocated',
      '2026-04-11T13:10:00.000Z',
      '2026-04-18T12:00:00.000Z',
      'Awaiting installer scheduling'
    )`,
  });

  const so2002Id = await ensureRecord({
    selectSql: "SELECT id FROM sales_orders WHERE order_number = ?",
    selectParams: ["SO-2002"],
    insertSql: `INSERT INTO sales_orders (
      order_number, customer_id, status, requested_at, dispatch_due_at, notes
    ) VALUES (
      'SO-2002',
      (SELECT id FROM customers WHERE code = 'CUST-HARBOR'),
      'dispatched',
      '2026-04-12T09:45:00.000Z',
      '2026-04-15T16:00:00.000Z',
      'Printer dispatched on same-week fulfilment'
    )`,
  });

  const so2003Id = await ensureRecord({
    selectSql: "SELECT id FROM sales_orders WHERE order_number = ?",
    selectParams: ["SO-2003"],
    insertSql: `INSERT INTO sales_orders (
      order_number, customer_id, status, requested_at, dispatch_due_at, notes
    ) VALUES (
      'SO-2003',
      (SELECT id FROM customers WHERE code = 'CUST-ALPHA'),
      'returned',
      '2026-04-13T10:20:00.000Z',
      '2026-04-16T15:00:00.000Z',
      'Returned after customer reported print quality issue'
    )`,
  });

  const po1001TillLineId = await ensureRecord({
    selectSql: `
      SELECT id FROM purchase_order_lines
      WHERE purchase_order_id = ? AND product_id = (SELECT id FROM products WHERE sku = 'TILL-001')
    `,
    selectParams: [po1001Id],
    insertSql: `
      INSERT INTO purchase_order_lines (
        purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost
      ) VALUES (
        ?,
        (SELECT id FROM products WHERE sku = 'TILL-001'),
        2,
        2,
        325.00
      )
    `,
    insertParams: [po1001Id],
  });

  const po1002PrinterLineId = await ensureRecord({
    selectSql: `
      SELECT id FROM purchase_order_lines
      WHERE purchase_order_id = ? AND product_id = (SELECT id FROM products WHERE sku = 'PRINTER-001')
    `,
    selectParams: [po1002Id],
    insertSql: `
      INSERT INTO purchase_order_lines (
        purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost
      ) VALUES (
        ?,
        (SELECT id FROM products WHERE sku = 'PRINTER-001'),
        2,
        2,
        110.00
      )
    `,
    insertParams: [po1002Id],
  });

  const po1003ScannerLineId = await ensureRecord({
    selectSql: `
      SELECT id FROM purchase_order_lines
      WHERE purchase_order_id = ? AND product_id = (SELECT id FROM products WHERE sku = 'SCANNER-001')
    `,
    selectParams: [po1003Id],
    insertSql: `
      INSERT INTO purchase_order_lines (
        purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost
      ) VALUES (
        ?,
        (SELECT id FROM products WHERE sku = 'SCANNER-001'),
        1,
        1,
        58.00
      )
    `,
    insertParams: [po1003Id],
  });

  const so2001TillLineId = await ensureRecord({
    selectSql: `
      SELECT id FROM sales_order_lines
      WHERE sales_order_id = ? AND product_id = (SELECT id FROM products WHERE sku = 'TILL-001')
    `,
    selectParams: [so2001Id],
    insertSql: `
      INSERT INTO sales_order_lines (
        sales_order_id, product_id, linked_purchase_order_line_id, quantity_ordered, quantity_allocated, quantity_dispatched
      ) VALUES (
        ?,
        (SELECT id FROM products WHERE sku = 'TILL-001'),
        ?,
        1,
        1,
        0
      )
    `,
    insertParams: [so2001Id, po1001TillLineId],
  });

  const so2002PrinterLineId = await ensureRecord({
    selectSql: `
      SELECT id FROM sales_order_lines
      WHERE sales_order_id = ? AND product_id = (SELECT id FROM products WHERE sku = 'PRINTER-001')
    `,
    selectParams: [so2002Id],
    insertSql: `
      INSERT INTO sales_order_lines (
        sales_order_id, product_id, linked_purchase_order_line_id, quantity_ordered, quantity_allocated, quantity_dispatched
      ) VALUES (
        ?,
        (SELECT id FROM products WHERE sku = 'PRINTER-001'),
        ?,
        1,
        1,
        1
      )
    `,
    insertParams: [so2002Id, po1002PrinterLineId],
  });

  const so2003PrinterLineId = await ensureRecord({
    selectSql: `
      SELECT id FROM sales_order_lines
      WHERE sales_order_id = ? AND product_id = (SELECT id FROM products WHERE sku = 'PRINTER-001')
    `,
    selectParams: [so2003Id],
    insertSql: `
      INSERT INTO sales_order_lines (
        sales_order_id, product_id, linked_purchase_order_line_id, quantity_ordered, quantity_allocated, quantity_dispatched
      ) VALUES (
        ?,
        (SELECT id FROM products WHERE sku = 'PRINTER-001'),
        ?,
        1,
        1,
        1
      )
    `,
    insertParams: [so2003Id, po1002PrinterLineId],
  });

  await ensureRecord({
    selectSql: "SELECT id FROM purchase_sales_links WHERE purchase_order_line_id = ? AND sales_order_line_id = ?",
    selectParams: [po1001TillLineId, so2001TillLineId],
    insertSql: `
      INSERT INTO purchase_sales_links (
        purchase_order_line_id, sales_order_line_id, quantity_linked, created_at
      ) VALUES (?, ?, 1, '2026-04-11T13:15:00.000Z')
    `,
    insertParams: [po1001TillLineId, so2001TillLineId],
  });

  await ensureRecord({
    selectSql: "SELECT id FROM purchase_sales_links WHERE purchase_order_line_id = ? AND sales_order_line_id = ?",
    selectParams: [po1002PrinterLineId, so2002PrinterLineId],
    insertSql: `
      INSERT INTO purchase_sales_links (
        purchase_order_line_id, sales_order_line_id, quantity_linked, created_at
      ) VALUES (?, ?, 1, '2026-04-12T10:05:00.000Z')
    `,
    insertParams: [po1002PrinterLineId, so2002PrinterLineId],
  });

  await ensureRecord({
    selectSql: "SELECT id FROM purchase_sales_links WHERE purchase_order_line_id = ? AND sales_order_line_id = ?",
    selectParams: [po1002PrinterLineId, so2003PrinterLineId],
    insertSql: `
      INSERT INTO purchase_sales_links (
        purchase_order_line_id, sales_order_line_id, quantity_linked, created_at
      ) VALUES (?, ?, 1, '2026-04-13T10:25:00.000Z')
    `,
    insertParams: [po1002PrinterLineId, so2003PrinterLineId],
  });

  const gr1001Id = await ensureRecord({
    selectSql: "SELECT id FROM goods_receipts WHERE receipt_number = ?",
    selectParams: ["GRN-1001"],
    insertSql: `
      INSERT INTO goods_receipts (
        purchase_order_id, receipt_number, delivery_number, received_at, received_by, notes
      ) VALUES (
        ?,
        'GRN-1001',
        'DEL-77821',
        '2026-04-10T08:42:00.000Z',
        'Liam Chen',
        'Two tills received intact'
      )
    `,
    insertParams: [po1001Id],
  });

  const gr1002Id = await ensureRecord({
    selectSql: "SELECT id FROM goods_receipts WHERE receipt_number = ?",
    selectParams: ["GRN-1002"],
    insertSql: `
      INSERT INTO goods_receipts (
        purchase_order_id, receipt_number, delivery_number, received_at, received_by, notes
      ) VALUES (
        ?,
        'GRN-1002',
        'DEL-77845',
        '2026-04-12T09:10:00.000Z',
        'Liam Chen',
        'Printer shipment booked into receiving'
      )
    `,
    insertParams: [po1002Id],
  });

  const gr1003Id = await ensureRecord({
    selectSql: "SELECT id FROM goods_receipts WHERE receipt_number = ?",
    selectParams: ["GRN-1003"],
    insertSql: `
      INSERT INTO goods_receipts (
        purchase_order_id, receipt_number, delivery_number, received_at, received_by, notes
      ) VALUES (
        ?,
        'GRN-1003',
        'DEL-77867',
        '2026-04-14T07:55:00.000Z',
        'Liam Chen',
        'Scanner received with one damaged outer carton'
      )
    `,
    insertParams: [po1003Id],
  });

  await ensureRecord({
    selectSql: "SELECT id FROM goods_receipt_lines WHERE goods_receipt_id = ? AND purchase_order_line_id = ?",
    selectParams: [gr1001Id, po1001TillLineId],
    insertSql: `
      INSERT INTO goods_receipt_lines (
        goods_receipt_id, purchase_order_line_id, product_id, holding_location_id, quantity_received, created_at
      ) VALUES (
        ?,
        ?,
        (SELECT id FROM products WHERE sku = 'TILL-001'),
        (SELECT id FROM stock_locations WHERE code = 'RECEIVING'),
        2,
        '2026-04-10T08:42:00.000Z'
      )
    `,
    insertParams: [gr1001Id, po1001TillLineId],
  });

  await ensureRecord({
    selectSql: "SELECT id FROM goods_receipt_lines WHERE goods_receipt_id = ? AND purchase_order_line_id = ?",
    selectParams: [gr1002Id, po1002PrinterLineId],
    insertSql: `
      INSERT INTO goods_receipt_lines (
        goods_receipt_id, purchase_order_line_id, product_id, holding_location_id, quantity_received, created_at
      ) VALUES (
        ?,
        ?,
        (SELECT id FROM products WHERE sku = 'PRINTER-001'),
        (SELECT id FROM stock_locations WHERE code = 'RECEIVING'),
        2,
        '2026-04-12T09:10:00.000Z'
      )
    `,
    insertParams: [gr1002Id, po1002PrinterLineId],
  });

  await ensureRecord({
    selectSql: "SELECT id FROM goods_receipt_lines WHERE goods_receipt_id = ? AND purchase_order_line_id = ?",
    selectParams: [gr1003Id, po1003ScannerLineId],
    insertSql: `
      INSERT INTO goods_receipt_lines (
        goods_receipt_id, purchase_order_line_id, product_id, holding_location_id, quantity_received, created_at
      ) VALUES (
        ?,
        ?,
        (SELECT id FROM products WHERE sku = 'SCANNER-001'),
        (SELECT id FROM stock_locations WHERE code = 'RECEIVING'),
        1,
        '2026-04-14T07:55:00.000Z'
      )
    `,
    insertParams: [gr1003Id, po1003ScannerLineId],
  });

  const serialSeeds = [
    {
      serialNumber: "TILL-2026-0001",
      sku: "TILL-001",
      holdStatus: "available",
      holdReason: "",
      purchaseOrderId: po1001Id,
      purchaseOrderLineId: po1001TillLineId,
      salesOrderId: null,
      salesOrderLineId: null,
      customerCode: null,
      quantityOnHand: 1,
      quantityAllocated: 0,
      locationCode: "RACK-A1",
    },
    {
      serialNumber: "TILL-2026-0002",
      sku: "TILL-001",
      holdStatus: "allocated",
      holdReason: "Reserved for install booking",
      purchaseOrderId: po1001Id,
      purchaseOrderLineId: po1001TillLineId,
      salesOrderId: so2001Id,
      salesOrderLineId: so2001TillLineId,
      customerCode: "CUST-ALPHA",
      quantityOnHand: 1,
      quantityAllocated: 1,
      locationCode: "HOLD",
    },
    {
      serialNumber: "PRN-2026-0001",
      sku: "PRINTER-001",
      holdStatus: "dispatched",
      holdReason: "",
      purchaseOrderId: po1002Id,
      purchaseOrderLineId: po1002PrinterLineId,
      salesOrderId: so2002Id,
      salesOrderLineId: so2002PrinterLineId,
      customerCode: "CUST-HARBOR",
      quantityOnHand: 0,
      quantityAllocated: 0,
      locationCode: null,
    },
    {
      serialNumber: "PRN-2026-0002",
      sku: "PRINTER-001",
      holdStatus: "returned",
      holdReason: "Customer return pending QA inspection",
      purchaseOrderId: po1002Id,
      purchaseOrderLineId: po1002PrinterLineId,
      salesOrderId: so2003Id,
      salesOrderLineId: so2003PrinterLineId,
      customerCode: "CUST-ALPHA",
      quantityOnHand: 1,
      quantityAllocated: 0,
      locationCode: "HOLD",
    },
    {
      serialNumber: "SCN-2026-0001",
      sku: "SCANNER-001",
      holdStatus: "quarantined",
      holdReason: "Damage reported on arrival",
      purchaseOrderId: po1003Id,
      purchaseOrderLineId: po1003ScannerLineId,
      salesOrderId: null,
      salesOrderLineId: null,
      customerCode: null,
      quantityOnHand: 1,
      quantityAllocated: 0,
      locationCode: "HOLD",
    },
  ];

  for (const serialSeed of serialSeeds) {
    await ensureRecord({
      selectSql: "SELECT id FROM stock_items WHERE serial_number = ?",
      selectParams: [serialSeed.serialNumber],
      insertSql: `
        INSERT INTO stock_items (
          product_id,
          stock_location_id,
          actual_location_id,
          serial_number,
          quantity_on_hand,
          quantity_allocated,
          hold_status,
          hold_reason,
          linked_purchase_order_id,
          linked_purchase_order_line_id,
          linked_sales_order_id,
          linked_sales_order_line_id,
          customer_id
        ) VALUES (
          (SELECT id FROM products WHERE sku = ?),
          CASE
            WHEN ? IS NULL THEN NULL
            ELSE (SELECT id FROM stock_locations WHERE code = ?)
          END,
          CASE
            WHEN ? IS NULL THEN NULL
            ELSE (SELECT id FROM stock_locations WHERE code = ?)
          END,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          (SELECT id FROM customers WHERE code = ?)
        )
      `,
      insertParams: [
        serialSeed.sku,
        serialSeed.locationCode,
        serialSeed.locationCode,
        serialSeed.locationCode,
        serialSeed.locationCode,
        serialSeed.serialNumber,
        serialSeed.quantityOnHand,
        serialSeed.quantityAllocated,
        serialSeed.holdStatus,
        serialSeed.holdReason,
        serialSeed.purchaseOrderId,
        serialSeed.purchaseOrderLineId,
        serialSeed.salesOrderId,
        serialSeed.salesOrderLineId,
        serialSeed.customerCode,
      ],
    });
  }

  const tillAvailableId = await get("SELECT id FROM stock_items WHERE serial_number = ?", ["TILL-2026-0001"]);
  const tillAllocatedId = await get("SELECT id FROM stock_items WHERE serial_number = ?", ["TILL-2026-0002"]);
  const printerDispatchedId = await get("SELECT id FROM stock_items WHERE serial_number = ?", ["PRN-2026-0001"]);
  const printerReturnedId = await get("SELECT id FROM stock_items WHERE serial_number = ?", ["PRN-2026-0002"]);
  const scannerQuarantinedId = await get("SELECT id FROM stock_items WHERE serial_number = ?", ["SCN-2026-0001"]);

  const movementSeeds = [
    {
      stockItemId: tillAvailableId?.id,
      sku: "TILL-001",
      movementType: "receive",
      sourceCode: null,
      destinationCode: "RECEIVING",
      purchaseOrderId: po1001Id,
      referenceType: "goods_receipt",
      referenceId: gr1001Id,
      notes: "Received on GRN-1001 / DEL-77821",
      createdAt: "2026-04-10T08:42:00.000Z",
    },
    {
      stockItemId: tillAvailableId?.id,
      sku: "TILL-001",
      movementType: "putaway",
      sourceCode: "RECEIVING",
      destinationCode: "RACK-A1",
      purchaseOrderId: po1001Id,
      referenceType: "putaway",
      referenceId: po1001TillLineId,
      notes: "Moved into available rack stock",
      createdAt: "2026-04-10T10:05:00.000Z",
    },
    {
      stockItemId: tillAllocatedId?.id,
      sku: "TILL-001",
      movementType: "receive",
      sourceCode: null,
      destinationCode: "RECEIVING",
      purchaseOrderId: po1001Id,
      referenceType: "goods_receipt",
      referenceId: gr1001Id,
      notes: "Received on GRN-1001 / DEL-77821",
      createdAt: "2026-04-10T08:43:00.000Z",
    },
    {
      stockItemId: tillAllocatedId?.id,
      sku: "TILL-001",
      movementType: "putaway",
      sourceCode: "RECEIVING",
      destinationCode: "RACK-A1",
      purchaseOrderId: po1001Id,
      referenceType: "putaway",
      referenceId: po1001TillLineId,
      notes: "Moved into rack stock",
      createdAt: "2026-04-10T10:06:00.000Z",
    },
    {
      stockItemId: tillAllocatedId?.id,
      sku: "TILL-001",
      movementType: "allocate",
      sourceCode: "RACK-A1",
      destinationCode: "HOLD",
      purchaseOrderId: po1001Id,
      salesOrderId: so2001Id,
      customerCode: "CUST-ALPHA",
      referenceType: "sales_order",
      referenceId: so2001Id,
      notes: "Reserved against SO-2001",
      createdAt: "2026-04-11T13:20:00.000Z",
    },
    {
      stockItemId: printerDispatchedId?.id,
      sku: "PRINTER-001",
      movementType: "receive",
      sourceCode: null,
      destinationCode: "RECEIVING",
      purchaseOrderId: po1002Id,
      referenceType: "goods_receipt",
      referenceId: gr1002Id,
      notes: "Received on GRN-1002 / DEL-77845",
      createdAt: "2026-04-12T09:10:00.000Z",
    },
    {
      stockItemId: printerDispatchedId?.id,
      sku: "PRINTER-001",
      movementType: "putaway",
      sourceCode: "RECEIVING",
      destinationCode: "RACK-A1",
      purchaseOrderId: po1002Id,
      referenceType: "putaway",
      referenceId: po1002PrinterLineId,
      notes: "Moved into rack stock",
      createdAt: "2026-04-12T11:00:00.000Z",
    },
    {
      stockItemId: printerDispatchedId?.id,
      sku: "PRINTER-001",
      movementType: "allocate",
      sourceCode: "RACK-A1",
      destinationCode: "DISPATCH",
      purchaseOrderId: po1002Id,
      salesOrderId: so2002Id,
      customerCode: "CUST-HARBOR",
      referenceType: "sales_order",
      referenceId: so2002Id,
      notes: "Allocated for Harbor Retail order",
      createdAt: "2026-04-14T15:25:00.000Z",
    },
    {
      stockItemId: printerDispatchedId?.id,
      sku: "PRINTER-001",
      movementType: "dispatch",
      sourceCode: "DISPATCH",
      destinationCode: null,
      purchaseOrderId: po1002Id,
      salesOrderId: so2002Id,
      customerCode: "CUST-HARBOR",
      referenceType: "dispatch",
      referenceId: so2002Id,
      notes: "Dispatched on carrier run VAN-12",
      createdAt: "2026-04-15T16:18:00.000Z",
    },
    {
      stockItemId: printerReturnedId?.id,
      sku: "PRINTER-001",
      movementType: "receive",
      sourceCode: null,
      destinationCode: "RECEIVING",
      purchaseOrderId: po1002Id,
      referenceType: "goods_receipt",
      referenceId: gr1002Id,
      notes: "Received on GRN-1002 / DEL-77845",
      createdAt: "2026-04-12T09:12:00.000Z",
    },
    {
      stockItemId: printerReturnedId?.id,
      sku: "PRINTER-001",
      movementType: "putaway",
      sourceCode: "RECEIVING",
      destinationCode: "RACK-A1",
      purchaseOrderId: po1002Id,
      referenceType: "putaway",
      referenceId: po1002PrinterLineId,
      notes: "Moved into rack stock",
      createdAt: "2026-04-12T11:02:00.000Z",
    },
    {
      stockItemId: printerReturnedId?.id,
      sku: "PRINTER-001",
      movementType: "allocate",
      sourceCode: "RACK-A1",
      destinationCode: "DISPATCH",
      purchaseOrderId: po1002Id,
      salesOrderId: so2003Id,
      customerCode: "CUST-ALPHA",
      referenceType: "sales_order",
      referenceId: so2003Id,
      notes: "Allocated for Alpha Veterinary Group",
      createdAt: "2026-04-14T17:05:00.000Z",
    },
    {
      stockItemId: printerReturnedId?.id,
      sku: "PRINTER-001",
      movementType: "dispatch",
      sourceCode: "DISPATCH",
      destinationCode: null,
      purchaseOrderId: po1002Id,
      salesOrderId: so2003Id,
      customerCode: "CUST-ALPHA",
      referenceType: "dispatch",
      referenceId: so2003Id,
      notes: "Dispatched on overnight service",
      createdAt: "2026-04-16T08:42:00.000Z",
    },
    {
      stockItemId: printerReturnedId?.id,
      sku: "PRINTER-001",
      movementType: "return",
      sourceCode: null,
      destinationCode: "HOLD",
      purchaseOrderId: po1002Id,
      salesOrderId: so2003Id,
      customerCode: "CUST-ALPHA",
      referenceType: "return",
      referenceId: so2003Id,
      notes: "Returned by customer and routed to QA hold",
      createdAt: "2026-04-20T11:05:00.000Z",
    },
    {
      stockItemId: scannerQuarantinedId?.id,
      sku: "SCANNER-001",
      movementType: "receive",
      sourceCode: null,
      destinationCode: "RECEIVING",
      purchaseOrderId: po1003Id,
      referenceType: "goods_receipt",
      referenceId: gr1003Id,
      notes: "Received on GRN-1003 / DEL-77867",
      createdAt: "2026-04-14T07:55:00.000Z",
    },
    {
      stockItemId: scannerQuarantinedId?.id,
      sku: "SCANNER-001",
      movementType: "quarantine",
      sourceCode: "RECEIVING",
      destinationCode: "HOLD",
      purchaseOrderId: po1003Id,
      referenceType: "inspection",
      referenceId: po1003ScannerLineId,
      notes: "Moved to quarantine after damaged carton inspection",
      createdAt: "2026-04-14T08:20:00.000Z",
    },
  ];

  for (const movement of movementSeeds) {
    if (!movement.stockItemId) {
      continue;
    }

    await ensureRecord({
      selectSql: `
        SELECT id FROM stock_movements
        WHERE stock_item_id = ? AND movement_type = ? AND created_at = ?
      `,
      selectParams: [movement.stockItemId, movement.movementType, movement.createdAt],
      insertSql: `
        INSERT INTO stock_movements (
          movement_type,
          stock_item_id,
          product_id,
          source_location_id,
          destination_location_id,
          actual_source_location_id,
          actual_destination_location_id,
          quantity,
          linked_purchase_order_id,
          linked_sales_order_id,
          customer_id,
          reference_type,
          reference_id,
          notes,
          created_at
        ) VALUES (
          ?,
          ?,
          (SELECT id FROM products WHERE sku = ?),
          (SELECT id FROM stock_locations WHERE code = ?),
          (SELECT id FROM stock_locations WHERE code = ?),
          (SELECT id FROM stock_locations WHERE code = ?),
          (SELECT id FROM stock_locations WHERE code = ?),
          1,
          ?,
          ?,
          (SELECT id FROM customers WHERE code = ?),
          ?,
          ?,
          ?,
          ?
        )
      `,
      insertParams: [
        movement.movementType,
        movement.stockItemId,
        movement.sku,
        movement.sourceCode,
        movement.destinationCode,
        movement.sourceCode,
        movement.destinationCode,
        movement.purchaseOrderId || null,
        movement.salesOrderId || null,
        movement.customerCode || null,
        movement.referenceType,
        movement.referenceId || null,
        movement.notes,
        movement.createdAt,
      ],
    });
  }

  const activitySeeds = [
    ["TILL-2026-0001", tillAvailableId?.id, "received", "Received from supplier on delivery DEL-77821", "goods_receipt", gr1001Id, "2026-04-10T08:42:00.000Z"],
    ["TILL-2026-0001", tillAvailableId?.id, "putaway", "Put away into Rack A1 as available stock", "putaway", po1001TillLineId, "2026-04-10T10:05:00.000Z"],
    ["TILL-2026-0002", tillAllocatedId?.id, "received", "Received from supplier on delivery DEL-77821", "goods_receipt", gr1001Id, "2026-04-10T08:43:00.000Z"],
    ["TILL-2026-0002", tillAllocatedId?.id, "allocated", "Allocated to Alpha Veterinary Group against SO-2001", "sales_order", so2001Id, "2026-04-11T13:20:00.000Z"],
    ["PRN-2026-0001", printerDispatchedId?.id, "received", "Received from supplier on delivery DEL-77845", "goods_receipt", gr1002Id, "2026-04-12T09:10:00.000Z"],
    ["PRN-2026-0001", printerDispatchedId?.id, "allocated", "Allocated to Harbor Retail Ltd against SO-2002", "sales_order", so2002Id, "2026-04-14T15:25:00.000Z"],
    ["PRN-2026-0001", printerDispatchedId?.id, "dispatched", "Dispatched to Harbor Retail Ltd on carrier run VAN-12", "dispatch", so2002Id, "2026-04-15T16:18:00.000Z"],
    ["PRN-2026-0002", printerReturnedId?.id, "dispatched", "Dispatched to Alpha Veterinary Group against SO-2003", "dispatch", so2003Id, "2026-04-16T08:42:00.000Z"],
    ["PRN-2026-0002", printerReturnedId?.id, "returned", "Returned by Alpha Veterinary Group and moved into QA hold", "return", so2003Id, "2026-04-20T11:05:00.000Z"],
    ["SCN-2026-0001", scannerQuarantinedId?.id, "quarantined", "Quarantined after receiving inspection found external damage", "inspection", po1003ScannerLineId, "2026-04-14T08:20:00.000Z"],
  ];

  for (const [serialNumber, stockItemId, activityType, summary, referenceType, referenceId, createdAt] of activitySeeds) {
    if (!stockItemId) {
      continue;
    }

    await ensureRecord({
      selectSql: `
        SELECT id FROM activity_log
        WHERE serial_number = ? AND activity_type = ? AND created_at = ?
      `,
      selectParams: [serialNumber, activityType, createdAt],
      insertSql: `
        INSERT INTO activity_log (
          stock_item_id,
          serial_number,
          activity_type,
          summary,
          reference_type,
          reference_id,
          payload_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, '', ?)
      `,
      insertParams: [stockItemId, serialNumber, activityType, summary, referenceType, referenceId, createdAt],
    });
  }
}

async function initDatabase() {
  await run("PRAGMA foreign_keys = ON");

  await createCoreTables();
  await applySchemaMigrations();
  await createIndexes();
  await seedReferenceData();
  await seedOperationalData();
}

module.exports = {
  initDatabase,
};

const { all, run } = require("./connection");

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
}

async function initDatabase() {
  await run("PRAGMA foreign_keys = ON");

  await createCoreTables();
  await applySchemaMigrations();
  await createIndexes();
  await seedReferenceData();
}

module.exports = {
  initDatabase,
};

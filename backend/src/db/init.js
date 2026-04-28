const { all, databasePath, get, run } = require("./connection");

const SERIAL_NUMBER_STATUSES = [
  "available",
  "allocated",
  "dispatched",
  "returned",
  "quarantined",
];

const REQUIRED_TABLES = [
  "customers",
  "suppliers",
  "products",
  "purchase_orders",
  "purchase_order_lines",
  "sales_orders",
  "sales_order_lines",
  "received_goods",
  "received_good_lines",
  "serial_numbers",
  "stock_allocations",
  "dispatches",
  "dispatch_lines",
  "activity_log",
];

async function execStatements(statements) {
  for (const statement of statements) {
    await run(statement);
  }
}

async function createTables() {
  await execStatements([
    `CREATE TABLE IF NOT EXISTS customers (
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
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
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
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT '',
      default_supplier_id INTEGER,
      serial_number_required INTEGER NOT NULL DEFAULT 0 CHECK (serial_number_required IN (0, 1)),
      unit_of_measure TEXT NOT NULL DEFAULT 'each',
      cost_price REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (default_supplier_id) REFERENCES suppliers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      ordered_at TEXT,
      expected_at TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      description TEXT DEFAULT '',
      ordered_quantity REAL NOT NULL DEFAULT 0,
      received_quantity REAL NOT NULL DEFAULT 0,
      remaining_quantity REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE (purchase_order_id, line_number)
    )`,
    `CREATE TABLE IF NOT EXISTS sales_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      requested_at TEXT,
      dispatch_due_at TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS sales_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_order_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      description TEXT DEFAULT '',
      ordered_quantity REAL NOT NULL DEFAULT 0,
      allocated_quantity REAL NOT NULL DEFAULT 0,
      remaining_quantity REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE (sales_order_id, line_number)
    )`,
    `CREATE TABLE IF NOT EXISTS received_goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      purchase_order_id INTEGER NOT NULL,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      received_by TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
    )`,
    `CREATE TABLE IF NOT EXISTS received_good_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_goods_id INTEGER NOT NULL,
      purchase_order_line_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity_received REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (received_goods_id) REFERENCES received_goods(id),
      FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )`,
    `CREATE TABLE IF NOT EXISTS serial_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      received_good_line_id INTEGER,
      purchase_order_line_id INTEGER,
      serial_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'available' CHECK (
        status IN ('available', 'allocated', 'dispatched', 'returned', 'quarantined')
      ),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (received_good_line_id) REFERENCES received_good_lines(id),
      FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_order_line_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      received_good_line_id INTEGER,
      serial_number_id INTEGER,
      quantity_allocated REAL NOT NULL DEFAULT 0,
      allocation_status TEXT NOT NULL DEFAULT 'allocated',
      allocated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sales_order_line_id) REFERENCES sales_order_lines(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (received_good_line_id) REFERENCES received_good_lines(id),
      FOREIGN KEY (serial_number_id) REFERENCES serial_numbers(id),
      CHECK (received_good_line_id IS NOT NULL OR serial_number_id IS NOT NULL)
    )`,
    `CREATE TABLE IF NOT EXISTS dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatch_number TEXT NOT NULL UNIQUE,
      sales_order_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      dispatched_at TEXT,
      carrier TEXT DEFAULT '',
      tracking_reference TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS dispatch_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatch_id INTEGER NOT NULL,
      sales_order_line_id INTEGER NOT NULL,
      stock_allocation_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      serial_number_id INTEGER,
      quantity_dispatched REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dispatch_id) REFERENCES dispatches(id),
      FOREIGN KEY (sales_order_line_id) REFERENCES sales_order_lines(id),
      FOREIGN KEY (stock_allocation_id) REFERENCES stock_allocations(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (serial_number_id) REFERENCES serial_numbers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ]);
}

async function createIndexes() {
  await execStatements([
    `CREATE INDEX IF NOT EXISTS idx_products_default_supplier_id ON products(default_supplier_id)`,
    `CREATE INDEX IF NOT EXISTS idx_products_serial_number_required ON products(serial_number_required)`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id)`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_purchase_order_id ON purchase_order_lines(purchase_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_product_id ON purchase_order_lines(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id ON sales_orders(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_order_lines_sales_order_id ON sales_order_lines(sales_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_order_lines_product_id ON sales_order_lines(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_received_goods_purchase_order_id ON received_goods(purchase_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_received_good_lines_received_goods_id ON received_good_lines(received_goods_id)`,
    `CREATE INDEX IF NOT EXISTS idx_received_good_lines_purchase_order_line_id ON received_good_lines(purchase_order_line_id)`,
    `CREATE INDEX IF NOT EXISTS idx_serial_numbers_product_id ON serial_numbers(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_serial_numbers_status ON serial_numbers(status)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_allocations_sales_order_line_id ON stock_allocations(sales_order_line_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_allocations_serial_number_id ON stock_allocations(serial_number_id)`,
    `CREATE INDEX IF NOT EXISTS idx_dispatches_sales_order_id ON dispatches(sales_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_dispatches_customer_id ON dispatches(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_dispatch_lines_dispatch_id ON dispatch_lines(dispatch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC)`,
  ]);
}

async function clearTables() {
  const tablesInDeleteOrder = [
    "dispatch_lines",
    "dispatches",
    "stock_allocations",
    "serial_numbers",
    "received_good_lines",
    "received_goods",
    "sales_order_lines",
    "sales_orders",
    "purchase_order_lines",
    "purchase_orders",
    "products",
    "suppliers",
    "customers",
    "activity_log",
  ];

  for (const tableName of tablesInDeleteOrder) {
    await run(`DELETE FROM ${tableName}`);
  }

  await run("DELETE FROM sqlite_sequence");
}

async function dropTables() {
  const tablesInDropOrder = [
    "dispatch_lines",
    "dispatches",
    "stock_allocations",
    "serial_numbers",
    "received_good_lines",
    "received_goods",
    "sales_order_lines",
    "sales_orders",
    "purchase_order_lines",
    "purchase_orders",
    "products",
    "suppliers",
    "customers",
    "activity_log",
  ];

  for (const tableName of tablesInDropOrder) {
    await run(`DROP TABLE IF EXISTS ${tableName}`);
  }
}

async function seedCustomers() {
  await execStatements([
    `INSERT INTO customers (
      code, name, contact_name, email, phone, address_line1, city, postcode, country
    ) VALUES (
      'CUST-HIGHSTREET',
      'High Street Pharmacy Group',
      'Rachel Evans',
      'purchasing@highstreetpharmacy.example',
      '0207 555 0101',
      '18 Market Street',
      'London',
      'EC2A 3LT',
      'UK'
    )`,
    `INSERT INTO customers (
      code, name, contact_name, email, phone, address_line1, city, postcode, country
    ) VALUES (
      'CUST-NORTHSTAR',
      'Northstar Retail Systems',
      'Michael Hart',
      'ops@northstarretail.example',
      '0161 555 0112',
      '52 Quayside Way',
      'Manchester',
      'M3 4LY',
      'UK'
    )`,
    `INSERT INTO customers (
      code, name, contact_name, email, phone, address_line1, city, postcode, country
    ) VALUES (
      'CUST-GREENLANE',
      'Greenlane Garden Centres',
      'Aisha Khan',
      'stockcontrol@greenlane.example',
      '0117 555 0188',
      '9 Orchard Lane',
      'Bristol',
      'BS1 5TR',
      'UK'
    )`,
  ]);
}

async function seedSuppliers() {
  await execStatements([
    `INSERT INTO suppliers (
      code, name, contact_name, email, phone, address_line1, city, postcode, country, account_reference
    ) VALUES (
      'SUP-AXIOM',
      'Axiom Hardware Distribution',
      'Lauren Cole',
      'trade@axiomhardware.example',
      '0121 555 0201',
      '100 Foundry Park',
      'Birmingham',
      'B5 7AA',
      'UK',
      'AX-2045'
    )`,
    `INSERT INTO suppliers (
      code, name, contact_name, email, phone, address_line1, city, postcode, country, account_reference
    ) VALUES (
      'SUP-MERIDIAN',
      'Meridian Print & Paper',
      'Tom Willis',
      'accounts@meridianprint.example',
      '0113 555 0244',
      '4 Riverside Trade Estate',
      'Leeds',
      'LS10 1AB',
      'UK',
      'MP-8841'
    )`,
    `INSERT INTO suppliers (
      code, name, contact_name, email, phone, address_line1, city, postcode, country, account_reference
    ) VALUES (
      'SUP-LATTICE',
      'Lattice Office Supplies',
      'Sana Mahmood',
      'sales@latticeoffice.example',
      '0141 555 0289',
      '77 Kelvin Way',
      'Glasgow',
      'G2 3NW',
      'UK',
      'LO-3310'
    )`,
  ]);
}

async function seedProducts() {
  await execStatements([
    `INSERT INTO products (
      sku, name, description, category, default_supplier_id, serial_number_required,
      unit_of_measure, cost_price, sell_price
    ) VALUES (
      'POS-TERM-01',
      'Touch POS Terminal',
      '15-inch touchscreen countertop terminal',
      'Hardware',
      (SELECT id FROM suppliers WHERE code = 'SUP-AXIOM'),
      1,
      'each',
      345.00,
      525.00
    )`,
    `INSERT INTO products (
      sku, name, description, category, default_supplier_id, serial_number_required,
      unit_of_measure, cost_price, sell_price
    ) VALUES (
      'RCPT-PRN-01',
      'Thermal Receipt Printer',
      'Compact USB and Ethernet receipt printer',
      'Hardware',
      (SELECT id FROM suppliers WHERE code = 'SUP-AXIOM'),
      1,
      'each',
      118.00,
      189.00
    )`,
    `INSERT INTO products (
      sku, name, description, category, default_supplier_id, serial_number_required,
      unit_of_measure, cost_price, sell_price
    ) VALUES (
      'SCAN-BT-01',
      'Bluetooth Barcode Scanner',
      'Wireless handheld scanner for stock handling',
      'Hardware',
      (SELECT id FROM suppliers WHERE code = 'SUP-AXIOM'),
      1,
      'each',
      64.00,
      99.00
    )`,
    `INSERT INTO products (
      sku, name, description, category, default_supplier_id, serial_number_required,
      unit_of_measure, cost_price, sell_price
    ) VALUES (
      'ROLL-80MM-20',
      '80mm Thermal Till Roll',
      'Box of 20 thermal till rolls',
      'Consumables',
      (SELECT id FROM suppliers WHERE code = 'SUP-MERIDIAN'),
      0,
      'box',
      18.00,
      29.50
    )`,
    `INSERT INTO products (
      sku, name, description, category, default_supplier_id, serial_number_required,
      unit_of_measure, cost_price, sell_price
    ) VALUES (
      'LBL-SHELF-50',
      'Shelf Edge Label Pack',
      'Pack of 50 adhesive shelf labels',
      'Consumables',
      (SELECT id FROM suppliers WHERE code = 'SUP-LATTICE'),
      0,
      'pack',
      5.20,
      9.95
    )`,
    `INSERT INTO products (
      sku, name, description, category, default_supplier_id, serial_number_required,
      unit_of_measure, cost_price, sell_price
    ) VALUES (
      'CABLE-USBC-2M',
      '2m USB-C Power Cable',
      'Replacement power cable for tills and peripherals',
      'Accessories',
      (SELECT id FROM suppliers WHERE code = 'SUP-LATTICE'),
      0,
      'each',
      3.80,
      8.50
    )`,
  ]);
}

async function seedPurchaseOrders() {
  await execStatements([
    `INSERT INTO purchase_orders (order_number, supplier_id, status, ordered_at, expected_at, notes) VALUES (
      'PO-1001',
      (SELECT id FROM suppliers WHERE code = 'SUP-AXIOM'),
      'part_received',
      '2026-04-05T09:15:00Z',
      '2026-04-12T00:00:00Z',
      'Opening hardware replenishment for April rollout.'
    )`,
    `INSERT INTO purchase_orders (order_number, supplier_id, status, ordered_at, expected_at, notes) VALUES (
      'PO-1002',
      (SELECT id FROM suppliers WHERE code = 'SUP-MERIDIAN'),
      'received',
      '2026-04-08T11:40:00Z',
      '2026-04-10T00:00:00Z',
      'Paper goods restock for existing customers.'
    )`,
    `INSERT INTO purchase_orders (order_number, supplier_id, status, ordered_at, expected_at, notes) VALUES (
      'PO-1003',
      (SELECT id FROM suppliers WHERE code = 'SUP-LATTICE'),
      'ordered',
      '2026-04-14T14:05:00Z',
      '2026-04-21T00:00:00Z',
      'General accessory top-up order.'
    )`,
    `INSERT INTO purchase_order_lines (
      purchase_order_id, line_number, product_id, description, ordered_quantity, received_quantity, remaining_quantity, unit_cost
    ) VALUES (
      (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001'),
      1,
      (SELECT id FROM products WHERE sku = 'POS-TERM-01'),
      'Touch POS Terminal',
      4,
      3,
      1,
      345.00
    )`,
    `INSERT INTO purchase_order_lines (
      purchase_order_id, line_number, product_id, description, ordered_quantity, received_quantity, remaining_quantity, unit_cost
    ) VALUES (
      (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001'),
      2,
      (SELECT id FROM products WHERE sku = 'RCPT-PRN-01'),
      'Thermal Receipt Printer',
      4,
      2,
      2,
      118.00
    )`,
    `INSERT INTO purchase_order_lines (
      purchase_order_id, line_number, product_id, description, ordered_quantity, received_quantity, remaining_quantity, unit_cost
    ) VALUES (
      (SELECT id FROM purchase_orders WHERE order_number = 'PO-1002'),
      1,
      (SELECT id FROM products WHERE sku = 'ROLL-80MM-20'),
      '80mm Thermal Till Roll',
      20,
      20,
      0,
      18.00
    )`,
    `INSERT INTO purchase_order_lines (
      purchase_order_id, line_number, product_id, description, ordered_quantity, received_quantity, remaining_quantity, unit_cost
    ) VALUES (
      (SELECT id FROM purchase_orders WHERE order_number = 'PO-1002'),
      2,
      (SELECT id FROM products WHERE sku = 'LBL-SHELF-50'),
      'Shelf Edge Label Pack',
      12,
      12,
      0,
      5.20
    )`,
    `INSERT INTO purchase_order_lines (
      purchase_order_id, line_number, product_id, description, ordered_quantity, received_quantity, remaining_quantity, unit_cost
    ) VALUES (
      (SELECT id FROM purchase_orders WHERE order_number = 'PO-1003'),
      1,
      (SELECT id FROM products WHERE sku = 'SCAN-BT-01'),
      'Bluetooth Barcode Scanner',
      6,
      0,
      6,
      64.00
    )`,
    `INSERT INTO purchase_order_lines (
      purchase_order_id, line_number, product_id, description, ordered_quantity, received_quantity, remaining_quantity, unit_cost
    ) VALUES (
      (SELECT id FROM purchase_orders WHERE order_number = 'PO-1003'),
      2,
      (SELECT id FROM products WHERE sku = 'CABLE-USBC-2M'),
      '2m USB-C Power Cable',
      24,
      0,
      24,
      3.80
    )`,
  ]);
}

async function seedSalesOrders() {
  await execStatements([
    `INSERT INTO sales_orders (order_number, customer_id, status, requested_at, dispatch_due_at, notes) VALUES (
      'SO-2001',
      (SELECT id FROM customers WHERE code = 'CUST-HIGHSTREET'),
      'part_allocated',
      '2026-04-09T08:30:00Z',
      '2026-04-18T00:00:00Z',
      'New site opening kit for Oxford Street branch.'
    )`,
    `INSERT INTO sales_orders (order_number, customer_id, status, requested_at, dispatch_due_at, notes) VALUES (
      'SO-2002',
      (SELECT id FROM customers WHERE code = 'CUST-NORTHSTAR'),
      'ready_to_dispatch',
      '2026-04-11T10:00:00Z',
      '2026-04-19T00:00:00Z',
      'Replacement paper goods and label packs.'
    )`,
    `INSERT INTO sales_orders (order_number, customer_id, status, requested_at, dispatch_due_at, notes) VALUES (
      'SO-2003',
      (SELECT id FROM customers WHERE code = 'CUST-GREENLANE'),
      'draft',
      '2026-04-15T15:20:00Z',
      '2026-04-25T00:00:00Z',
      'Planned rollout for point-of-sale upgrade.'
    )`,
    `INSERT INTO sales_order_lines (
      sales_order_id, line_number, product_id, description, ordered_quantity, allocated_quantity, remaining_quantity, unit_price
    ) VALUES (
      (SELECT id FROM sales_orders WHERE order_number = 'SO-2001'),
      1,
      (SELECT id FROM products WHERE sku = 'POS-TERM-01'),
      'Touch POS Terminal',
      2,
      2,
      0,
      525.00
    )`,
    `INSERT INTO sales_order_lines (
      sales_order_id, line_number, product_id, description, ordered_quantity, allocated_quantity, remaining_quantity, unit_price
    ) VALUES (
      (SELECT id FROM sales_orders WHERE order_number = 'SO-2001'),
      2,
      (SELECT id FROM products WHERE sku = 'RCPT-PRN-01'),
      'Thermal Receipt Printer',
      2,
      1,
      1,
      189.00
    )`,
    `INSERT INTO sales_order_lines (
      sales_order_id, line_number, product_id, description, ordered_quantity, allocated_quantity, remaining_quantity, unit_price
    ) VALUES (
      (SELECT id FROM sales_orders WHERE order_number = 'SO-2002'),
      1,
      (SELECT id FROM products WHERE sku = 'ROLL-80MM-20'),
      '80mm Thermal Till Roll',
      6,
      6,
      0,
      29.50
    )`,
    `INSERT INTO sales_order_lines (
      sales_order_id, line_number, product_id, description, ordered_quantity, allocated_quantity, remaining_quantity, unit_price
    ) VALUES (
      (SELECT id FROM sales_orders WHERE order_number = 'SO-2002'),
      2,
      (SELECT id FROM products WHERE sku = 'LBL-SHELF-50'),
      'Shelf Edge Label Pack',
      4,
      4,
      0,
      9.95
    )`,
    `INSERT INTO sales_order_lines (
      sales_order_id, line_number, product_id, description, ordered_quantity, allocated_quantity, remaining_quantity, unit_price
    ) VALUES (
      (SELECT id FROM sales_orders WHERE order_number = 'SO-2003'),
      1,
      (SELECT id FROM products WHERE sku = 'SCAN-BT-01'),
      'Bluetooth Barcode Scanner',
      3,
      0,
      3,
      99.00
    )`,
  ]);
}

async function seedReceiptsAndSerials() {
  await execStatements([
    `INSERT INTO received_goods (receipt_number, purchase_order_id, received_at, received_by, notes) VALUES (
      'GRN-3001',
      (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001'),
      '2026-04-11T08:45:00Z',
      'Jamie Carter',
      'Partial hardware delivery received in good condition.'
    )`,
    `INSERT INTO received_goods (receipt_number, purchase_order_id, received_at, received_by, notes) VALUES (
      'GRN-3002',
      (SELECT id FROM purchase_orders WHERE order_number = 'PO-1002'),
      '2026-04-10T13:25:00Z',
      'Jamie Carter',
      'Full consumables delivery received and booked in.'
    )`,
    `INSERT INTO received_good_lines (received_goods_id, purchase_order_line_id, product_id, quantity_received) VALUES (
      (SELECT id FROM received_goods WHERE receipt_number = 'GRN-3001'),
      (SELECT id FROM purchase_order_lines WHERE purchase_order_id = (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001') AND line_number = 1),
      (SELECT id FROM products WHERE sku = 'POS-TERM-01'),
      3
    )`,
    `INSERT INTO received_good_lines (received_goods_id, purchase_order_line_id, product_id, quantity_received) VALUES (
      (SELECT id FROM received_goods WHERE receipt_number = 'GRN-3001'),
      (SELECT id FROM purchase_order_lines WHERE purchase_order_id = (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001') AND line_number = 2),
      (SELECT id FROM products WHERE sku = 'RCPT-PRN-01'),
      2
    )`,
    `INSERT INTO received_good_lines (received_goods_id, purchase_order_line_id, product_id, quantity_received) VALUES (
      (SELECT id FROM received_goods WHERE receipt_number = 'GRN-3002'),
      (SELECT id FROM purchase_order_lines WHERE purchase_order_id = (SELECT id FROM purchase_orders WHERE order_number = 'PO-1002') AND line_number = 1),
      (SELECT id FROM products WHERE sku = 'ROLL-80MM-20'),
      20
    )`,
    `INSERT INTO received_good_lines (received_goods_id, purchase_order_line_id, product_id, quantity_received) VALUES (
      (SELECT id FROM received_goods WHERE receipt_number = 'GRN-3002'),
      (SELECT id FROM purchase_order_lines WHERE purchase_order_id = (SELECT id FROM purchase_orders WHERE order_number = 'PO-1002') AND line_number = 2),
      (SELECT id FROM products WHERE sku = 'LBL-SHELF-50'),
      12
    )`,
    `INSERT INTO serial_numbers (product_id, received_good_line_id, purchase_order_line_id, serial_number, status) VALUES
      (
        (SELECT id FROM products WHERE sku = 'POS-TERM-01'),
        (SELECT id FROM received_good_lines WHERE product_id = (SELECT id FROM products WHERE sku = 'POS-TERM-01') LIMIT 1),
        (SELECT id FROM purchase_order_lines WHERE purchase_order_id = (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001') AND line_number = 1),
        'PT-24041001',
        'allocated'
      ),
      (
        (SELECT id FROM products WHERE sku = 'POS-TERM-01'),
        (SELECT id FROM received_good_lines WHERE product_id = (SELECT id FROM products WHERE sku = 'POS-TERM-01') LIMIT 1),
        (SELECT id FROM purchase_order_lines WHERE purchase_order_id = (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001') AND line_number = 1),
        'PT-24041002',
        'dispatched'
      ),
      (
        (SELECT id FROM products WHERE sku = 'POS-TERM-01'),
        (SELECT id FROM received_good_lines WHERE product_id = (SELECT id FROM products WHERE sku = 'POS-TERM-01') LIMIT 1),
        (SELECT id FROM purchase_order_lines WHERE purchase_order_id = (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001') AND line_number = 1),
        'PT-24041003',
        'available'
      ),
      (
        (SELECT id FROM products WHERE sku = 'RCPT-PRN-01'),
        (SELECT id FROM received_good_lines WHERE product_id = (SELECT id FROM products WHERE sku = 'RCPT-PRN-01') LIMIT 1),
        (SELECT id FROM purchase_order_lines WHERE purchase_order_id = (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001') AND line_number = 2),
        'RP-24041001',
        'allocated'
      ),
      (
        (SELECT id FROM products WHERE sku = 'RCPT-PRN-01'),
        (SELECT id FROM received_good_lines WHERE product_id = (SELECT id FROM products WHERE sku = 'RCPT-PRN-01') LIMIT 1),
        (SELECT id FROM purchase_order_lines WHERE purchase_order_id = (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001') AND line_number = 2),
        'RP-24041002',
        'quarantined'
      )`,
  ]);
}

async function seedAllocationsAndDispatches() {
  await execStatements([
    `INSERT INTO stock_allocations (
      sales_order_line_id, product_id, serial_number_id, quantity_allocated, allocation_status, notes
    ) VALUES (
      (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2001') AND line_number = 1),
      (SELECT id FROM products WHERE sku = 'POS-TERM-01'),
      (SELECT id FROM serial_numbers WHERE serial_number = 'PT-24041001'),
      1,
      'allocated',
      'Reserved for High Street Pharmacy rollout.'
    )`,
    `INSERT INTO stock_allocations (
      sales_order_line_id, product_id, serial_number_id, quantity_allocated, allocation_status, notes
    ) VALUES (
      (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2001') AND line_number = 1),
      (SELECT id FROM products WHERE sku = 'POS-TERM-01'),
      (SELECT id FROM serial_numbers WHERE serial_number = 'PT-24041002'),
      1,
      'dispatched',
      'Allocated and dispatched in first shipment.'
    )`,
    `INSERT INTO stock_allocations (
      sales_order_line_id, product_id, serial_number_id, quantity_allocated, allocation_status, notes
    ) VALUES (
      (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2001') AND line_number = 2),
      (SELECT id FROM products WHERE sku = 'RCPT-PRN-01'),
      (SELECT id FROM serial_numbers WHERE serial_number = 'RP-24041001'),
      1,
      'allocated',
      'Printer allocated pending second terminal availability.'
    )`,
    `INSERT INTO stock_allocations (
      sales_order_line_id, product_id, received_good_line_id, quantity_allocated, allocation_status, notes
    ) VALUES (
      (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2002') AND line_number = 1),
      (SELECT id FROM products WHERE sku = 'ROLL-80MM-20'),
      (SELECT id FROM received_good_lines WHERE product_id = (SELECT id FROM products WHERE sku = 'ROLL-80MM-20') LIMIT 1),
      6,
      'allocated',
      'Consumable stock picked from latest delivery.'
    )`,
    `INSERT INTO stock_allocations (
      sales_order_line_id, product_id, received_good_line_id, quantity_allocated, allocation_status, notes
    ) VALUES (
      (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2002') AND line_number = 2),
      (SELECT id FROM products WHERE sku = 'LBL-SHELF-50'),
      (SELECT id FROM received_good_lines WHERE product_id = (SELECT id FROM products WHERE sku = 'LBL-SHELF-50') LIMIT 1),
      4,
      'allocated',
      'Labels held with paper goods for same customer dispatch.'
    )`,
    `INSERT INTO dispatches (
      dispatch_number, sales_order_id, customer_id, status, dispatched_at, carrier, tracking_reference, notes
    ) VALUES (
      'DSP-4001',
      (SELECT id FROM sales_orders WHERE order_number = 'SO-2001'),
      (SELECT id FROM customers WHERE code = 'CUST-HIGHSTREET'),
      'part_dispatched',
      '2026-04-16T16:10:00Z',
      'DPD',
      'DPD-7845123',
      'First shipment sent with one terminal.'
    )`,
    `INSERT INTO dispatches (
      dispatch_number, sales_order_id, customer_id, status, dispatched_at, carrier, tracking_reference, notes
    ) VALUES (
      'DSP-4002',
      (SELECT id FROM sales_orders WHERE order_number = 'SO-2002'),
      (SELECT id FROM customers WHERE code = 'CUST-NORTHSTAR'),
      'dispatched',
      '2026-04-17T09:35:00Z',
      'Royal Mail',
      'RM-55881220',
      'Consumables shipped complete.'
    )`,
    `INSERT INTO dispatch_lines (
      dispatch_id, sales_order_line_id, stock_allocation_id, product_id, serial_number_id, quantity_dispatched
    ) VALUES (
      (SELECT id FROM dispatches WHERE dispatch_number = 'DSP-4001'),
      (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2001') AND line_number = 1),
      (SELECT id FROM stock_allocations WHERE serial_number_id = (SELECT id FROM serial_numbers WHERE serial_number = 'PT-24041002')),
      (SELECT id FROM products WHERE sku = 'POS-TERM-01'),
      (SELECT id FROM serial_numbers WHERE serial_number = 'PT-24041002'),
      1
    )`,
    `INSERT INTO dispatch_lines (
      dispatch_id, sales_order_line_id, stock_allocation_id, product_id, quantity_dispatched
    ) VALUES (
      (SELECT id FROM dispatches WHERE dispatch_number = 'DSP-4002'),
      (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2002') AND line_number = 1),
      (SELECT id FROM stock_allocations WHERE sales_order_line_id = (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2002') AND line_number = 1) LIMIT 1),
      (SELECT id FROM products WHERE sku = 'ROLL-80MM-20'),
      6
    )`,
    `INSERT INTO dispatch_lines (
      dispatch_id, sales_order_line_id, stock_allocation_id, product_id, quantity_dispatched
    ) VALUES (
      (SELECT id FROM dispatches WHERE dispatch_number = 'DSP-4002'),
      (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2002') AND line_number = 2),
      (SELECT id FROM stock_allocations WHERE sales_order_line_id = (SELECT id FROM sales_order_lines WHERE sales_order_id = (SELECT id FROM sales_orders WHERE order_number = 'SO-2002') AND line_number = 2) LIMIT 1),
      (SELECT id FROM products WHERE sku = 'LBL-SHELF-50'),
      4
    )`,
  ]);
}

async function seedActivityLog() {
  await execStatements([
    `INSERT INTO activity_log (entity_type, entity_id, action_type, message, metadata_json) VALUES (
      'purchase_order',
      (SELECT id FROM purchase_orders WHERE order_number = 'PO-1001'),
      'created',
      'Purchase order PO-1001 raised for Axiom Hardware Distribution.',
      '{"order_number":"PO-1001","status":"part_received"}'
    )`,
    `INSERT INTO activity_log (entity_type, entity_id, action_type, message, metadata_json) VALUES (
      'received_goods',
      (SELECT id FROM received_goods WHERE receipt_number = 'GRN-3001'),
      'received',
      'Goods receipt GRN-3001 booked in against purchase order PO-1001.',
      '{"receipt_number":"GRN-3001","supplier_code":"SUP-AXIOM"}'
    )`,
    `INSERT INTO activity_log (entity_type, entity_id, action_type, message, metadata_json) VALUES (
      'sales_order',
      (SELECT id FROM sales_orders WHERE order_number = 'SO-2001'),
      'allocated',
      'Serial-tracked stock allocated to sales order SO-2001.',
      '{"order_number":"SO-2001","allocated_serials":["PT-24041001","PT-24041002","RP-24041001"]}'
    )`,
    `INSERT INTO activity_log (entity_type, entity_id, action_type, message, metadata_json) VALUES (
      'dispatch',
      (SELECT id FROM dispatches WHERE dispatch_number = 'DSP-4002'),
      'dispatched',
      'Dispatch DSP-4002 completed for Northstar Retail Systems.',
      '{"dispatch_number":"DSP-4002","carrier":"Royal Mail"}'
    )`,
    `INSERT INTO activity_log (entity_type, entity_id, action_type, message, metadata_json) VALUES (
      'serial_number',
      (SELECT id FROM serial_numbers WHERE serial_number = 'RP-24041002'),
      'quarantined',
      'Receipt printer serial RP-24041002 moved to quarantine after intake check.',
      '{"serial_number":"RP-24041002","status":"quarantined"}'
    )`,
  ]);
}

async function seedDatabase() {
  await clearTables();
  await seedCustomers();
  await seedSuppliers();
  await seedProducts();
  await seedPurchaseOrders();
  await seedSalesOrders();
  await seedReceiptsAndSerials();
  await seedAllocationsAndDispatches();
  await seedActivityLog();
}

async function initializeDatabase() {
  await run("PRAGMA foreign_keys = ON");
  await createTables();
  await createIndexes();
}

async function resetDatabase({ seed = true } = {}) {
  await run("PRAGMA foreign_keys = OFF");
  await dropTables();
  await run("PRAGMA foreign_keys = ON");
  await initializeDatabase();

  if (seed) {
    await seedDatabase();
  }

  return getDatabaseStatus();
}

async function getDatabaseStatus() {
  const existingTables = await all(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
  );

  const existingTableNames = existingTables.map((row) => row.name);
  const tableCounts = {};

  for (const tableName of REQUIRED_TABLES) {
    if (existingTableNames.includes(tableName)) {
      const row = await get(`SELECT COUNT(*) AS count FROM ${tableName}`);
      tableCounts[tableName] = row.count;
      continue;
    }

    tableCounts[tableName] = null;
  }

  const missingTables = REQUIRED_TABLES.filter((tableName) => !existingTableNames.includes(tableName));
  const serialStatusRows = await all(
    `SELECT status, COUNT(*) AS count FROM serial_numbers GROUP BY status ORDER BY status ASC`,
  ).catch(() => []);

  return {
    databasePath,
    requiredTables: REQUIRED_TABLES,
    existingTables: existingTableNames,
    missingTables,
    tables: tableCounts,
    serialNumberStatuses: SERIAL_NUMBER_STATUSES,
    serialStatusCounts: serialStatusRows,
    ready: missingTables.length === 0,
  };
}

module.exports = {
  REQUIRED_TABLES,
  SERIAL_NUMBER_STATUSES,
  getDatabaseStatus,
  initializeDatabase,
  resetDatabase,
  seedDatabase,
};

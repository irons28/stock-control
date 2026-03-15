const state = {
  dashboard: null,
  products: [],
  suppliers: [],
  customers: [],
  locations: [],
  categories: [],
  purchaseOrders: [],
  salesOrders: [],
  goodsReceipts: [],
  dispatches: [],
  holdingStock: [],
  stockMovements: [],
  adjustments: [],
  importTemplates: [],
  importRuns: [],
  reconciliation: null,
  reports: { stockByLocation: { quantity: [], serialised: [] }, orderSummary: { purchase: [], sales: [] } },
  activity: [],
  poDraftLines: [],
  soDraftLines: [],
  selectedPoId: "",
  activeSection: "overview",
  message: "",
  error: "",
};

const socket = io();
socket.on("stock_control:update", () => loadAll());

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return response.json();
}

function setMessage(message, error = false) {
  state.message = error ? "" : message;
  state.error = error ? message : "";
  render();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function currency(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value || 0));
}

function badgeClass(active) {
  return active ? "badge badge-active" : "badge badge-inactive";
}

function orderStatusClass(status) {
  if (["received", "dispatched"].includes(status)) return "badge badge-active";
  if (["part_received", "part_dispatched", "allocated"].includes(status)) return "badge badge-warn";
  return "badge badge-neutral";
}

function optionList(items, labelFn, placeholder) {
  return [`<option value="">${placeholder}</option>`]
    .concat(items.map((item) => `<option value="${item.id}">${labelFn(item)}</option>`))
    .join("");
}

function currentPo() {
  return state.purchaseOrders.find((order) => String(order.id) === String(state.selectedPoId)) || null;
}

function putawayDestinations() {
  return state.locations.filter((location) => location.code !== "HOLDING" && location.is_active);
}

function navSections() {
  return [
    { key: "overview", label: "Overview" },
    { key: "setup", label: "Setup" },
    { key: "inbound", label: "Inbound" },
    { key: "outbound", label: "Outbound" },
    { key: "control", label: "Control" },
    { key: "reports", label: "Reports" },
    { key: "imports", label: "Imports" },
  ];
}

function renderHero() {
  const totals = state.dashboard?.totals || {};
  return `
    <section class="hero">
      <div>
        <p class="eyebrow">Warehouse Operations Suite</p>
        <h1>Stock Control</h1>
        <p class="hero-copy">Imported orders now drive the warehouse flow. This app is focused on goods in, putaway, allocation, dispatch, and stock traceability.</p>
      </div>
      <div class="hero-panel">
        <div class="hero-stat"><span>${totals.products || 0}</span><small>Products</small></div>
        <div class="hero-stat"><span>${totals.customers || 0}</span><small>Customers</small></div>
        <div class="hero-stat"><span>${totals.openSalesOrders || 0}</span><small>Open sales</small></div>
        <div class="hero-stat"><span>${totals.adjustments || 0}</span><small>Adjustments</small></div>
      </div>
    </section>
  `;
}

function renderMessages() {
  if (!state.message && !state.error) return "";
  return `<div class="${state.error ? "flash flash-error" : "flash flash-success"}">${escapeHtml(state.error || state.message)}</div>`;
}

function renderMilestones() {
  const items = state.dashboard?.nextMilestones || [];
  return `<section class="panel span-12"><div class="panel-header"><div><p class="panel-kicker">Build order</p><h2>Current implementation milestones</h2></div></div><div class="chip-row">${items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div></section>`;
}

function renderSectionNav() {
  return `
    <section class="section-nav">
      ${navSections().map((section) => `<button type="button" class="${section.key === state.activeSection ? "section-tab section-tab-active" : "section-tab"}" data-section="${section.key}">${section.label}</button>`).join("")}
    </section>
  `;
}

function renderSectionHeader(title, copy) {
  return `
    <section class="panel span-12 intro-panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Section focus</p>
          <h2>${title}</h2>
        </div>
      </div>
      <p class="muted">${copy}</p>
    </section>
  `;
}

function renderFormPanel({ id, title, kicker, span = "span-4", fields, button }) {
  return `<section class="panel ${span}"><div class="panel-header"><div><p class="panel-kicker">${kicker}</p><h2>${title}</h2></div></div><form id="${id}" class="stack-form">${fields}<button type="submit">${button}</button></form></section>`;
}

function renderProductForm() {
  return renderFormPanel({
    id: "product-form",
    title: "Add product",
    kicker: "Master data",
    span: "span-5",
    button: "Save product",
    fields: `
      <label>SKU<input name="sku" required /></label>
      <label>Product name<input name="name" required /></label>
      <label>Description<textarea name="description" rows="3"></textarea></label>
      <div class="two-up">
        <label>Category<select name="category_id">${optionList(state.categories, (item) => escapeHtml(item.name), "Select category")}</select></label>
        <label>Supplier<select name="supplier_id">${optionList(state.suppliers, (item) => escapeHtml(item.name), "Select supplier")}</select></label>
      </div>
      <div class="two-up">
        <label>Barcode<input name="barcode" /></label>
        <label>Unit<input name="unit_of_measure" value="each" /></label>
      </div>
      <div class="three-up">
        <label>Cost<input name="cost_price" type="number" min="0" step="0.01" value="0" /></label>
        <label>Price<input name="sell_price" type="number" min="0" step="0.01" value="0" /></label>
        <label>Reorder<input name="reorder_level" type="number" min="0" step="1" value="0" /></label>
      </div>
      <div class="check-row">
        <label><input name="serial_tracking" type="checkbox" /> Serial tracked</label>
        <label><input name="tax_flag" type="checkbox" checked /> Taxable</label>
      </div>
    `,
  });
}

function renderSupplierForm() {
  return renderFormPanel({ id: "supplier-form", title: "Add supplier", kicker: "Purchasing", span: "span-3", button: "Save supplier", fields: `<label>Name<input name="name" required /></label><label>Contact<input name="contact_name" /></label><label>Phone<input name="phone" /></label><label>Email<input name="email" type="email" /></label><label>Account ref<input name="account_reference" /></label><label>Address<textarea name="address" rows="3"></textarea></label>` });
}

function renderCustomerForm() {
  return renderFormPanel({ id: "customer-form", title: "Add customer", kicker: "Sales", span: "span-3", button: "Save customer", fields: `<label>Name<input name="name" required /></label><label>Contact<input name="contact_name" /></label><label>Phone<input name="phone" /></label><label>Email<input name="email" type="email" /></label><label>Address<textarea name="address" rows="3"></textarea></label>` });
}

function renderLocationForm() {
  return renderFormPanel({ id: "location-form", title: "Add location", kicker: "Storage", span: "span-4", button: "Save location", fields: `<label>Code<input name="code" required /></label><label>Name<input name="name" required /></label><label>Type<select name="type"><option value="holding">Holding</option><option value="shelf">Shelf</option><option value="bin">Bin</option><option value="dispatch">Dispatch</option><option value="damaged">Damaged</option><option value="vehicle">Vehicle</option></select></label><label>Notes<textarea name="notes" rows="3"></textarea></label>` });
}

function renderAdjustmentForm() {
  return renderFormPanel({
    id: "adjustment-form",
    title: "Stock adjustment",
    kicker: "Control",
    span: "span-5",
    button: "Save adjustment",
    fields: `
      <label>Product<select name="product_id" required>${optionList(state.products, (item) => `${escapeHtml(item.sku)} · ${escapeHtml(item.name)}`, "Select product")}</select></label>
      <div class="two-up">
        <label>Location<select name="location_id">${optionList(state.locations, (item) => `${escapeHtml(item.code)} · ${escapeHtml(item.name)}`, "Select location")}</select></label>
        <label>Type<select name="adjustment_type"><option value="increase">Increase</option><option value="decrease">Decrease</option><option value="damage">Damage</option><option value="write_off">Write off</option><option value="found">Found</option></select></label>
      </div>
      <div class="two-up">
        <label>Qty<input name="qty" type="number" min="1" step="1" value="1" /></label>
        <label>Adjusted by<input name="adjusted_by" value="Adjustment" /></label>
      </div>
      <label>Serial numbers<textarea name="serial_numbers" rows="3" placeholder="Required for serial-tracked adjustments"></textarea></label>
      <label>Reason<input name="reason" required placeholder="Damaged in transit, stock take correction, found stock" /></label>
      <label>Notes<textarea name="notes" rows="2"></textarea></label>
    `,
  });
}

function renderProductsTable() {
  return `<section class="panel span-7"><div class="panel-header"><div><p class="panel-kicker">Catalogue</p><h2>Products</h2></div><span class="count-pill">${state.products.length} items</span></div><div class="table-wrap"><table><thead><tr><th>SKU</th><th>Product</th><th>Type</th><th>On hand</th><th>Available</th><th>Allocated</th></tr></thead><tbody>${state.products.map((item) => `<tr><td>${escapeHtml(item.sku)}</td><td><strong>${escapeHtml(item.name)}</strong><div class="muted">${escapeHtml(item.category_name || "-")}</div></td><td>${item.serial_tracking ? "Serialised" : "Quantity"}</td><td>${item.qty_on_hand || 0}</td><td>${item.qty_available || 0}</td><td>${item.qty_allocated || 0}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">No products yet</td></tr>'}</tbody></table></div></section>`;
}

function renderOverviewCards() {
  const totals = state.dashboard?.totals || {};
  const cards = [
    { label: "Products", value: totals.products || 0, note: "Active catalogue lines" },
    { label: "Suppliers", value: totals.suppliers || 0, note: "Purchasing accounts" },
    { label: "Open purchase orders", value: totals.openPurchaseOrders || 0, note: "Still expected in" },
    { label: "Open sales orders", value: totals.openSalesOrders || 0, note: "Still to ship" },
    { label: "Holding items", value: totals.holdingItems || 0, note: "Waiting for putaway" },
    { label: "Adjustments", value: totals.adjustments || 0, note: "Control actions logged" },
  ];
  return `<section class="panel span-12"><div class="panel-header"><div><p class="panel-kicker">Snapshot</p><h2>Current operating picture</h2></div></div><div class="summary-grid">${cards.map((card) => `<article class="summary-card"><strong>${card.value}</strong><span>${card.label}</span><small>${card.note}</small></article>`).join("")}</div></section>`;
}

function renderListPanel(title, kicker, items, renderItem, span = "span-6") {
  return `<section class="panel ${span}"><div class="panel-header"><div><p class="panel-kicker">${kicker}</p><h2>${title}</h2></div></div><div class="list-grid">${items.map(renderItem).join("") || '<p class="empty">Nothing to show</p>'}</div></section>`;
}

function renderSuppliersList() {
  return renderListPanel("Suppliers", "Supply base", state.suppliers, (item) => `<article class="list-card"><div class="list-card-top"><h3>${escapeHtml(item.name)}</h3><span class="${badgeClass(item.is_active)}">${item.is_active ? "Active" : "Inactive"}</span></div><p>${escapeHtml(item.contact_name || "No contact set")}</p><p class="muted">${escapeHtml(item.email || item.phone || "No contact details")}</p></article>`);
}

function renderCustomersList() {
  return renderListPanel("Customers", "Accounts", state.customers, (item) => `<article class="list-card"><div class="list-card-top"><h3>${escapeHtml(item.name)}</h3><span class="${badgeClass(item.is_active)}">${item.is_active ? "Active" : "Inactive"}</span></div><p>${escapeHtml(item.contact_name || "No contact set")}</p><p class="muted">${escapeHtml(item.email || item.phone || "No contact details")}</p></article>`);
}

function renderLocationsList() {
  return `<section class="panel span-6"><div class="panel-header"><div><p class="panel-kicker">Storage map</p><h2>Locations</h2></div></div><div class="table-wrap compact"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Status</th></tr></thead><tbody>${state.locations.map((item) => `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.type)}</td><td><span class="${badgeClass(item.is_active)}">${item.is_active ? "Active" : "Inactive"}</span></td></tr>`).join("") || '<tr><td colspan="4" class="empty">No locations yet</td></tr>'}</tbody></table></div></section>`;
}

function renderDraftLines(lines, attr, priceKey) {
  return `<div class="draft-lines">${lines.length ? lines.map((line, index) => `<div class="draft-line"><div><strong>${escapeHtml(line.product_label)}</strong><p class="muted">Qty ${line.qty_ordered} at ${currency(line[priceKey])}</p></div><button type="button" class="ghost-button" data-${attr}="${index}">Remove</button></div>`).join("") : '<p class="empty">Add one or more lines before saving</p>'}</div>`;
}

function renderPurchaseOrderForm() {
  return `<section class="panel span-5"><div class="panel-header"><div><p class="panel-kicker">Purchasing workflow</p><h2>Create purchase order</h2></div></div><form id="purchase-order-form" class="stack-form"><div class="two-up"><label>PO number<input name="po_number" required /></label><label>Supplier<select name="supplier_id" required>${optionList(state.suppliers, (item) => escapeHtml(item.name), "Select supplier")}</select></label></div><div class="two-up"><label>Expected date<input name="expected_at" type="date" /></label><label>Notes<input name="notes" /></label></div><div class="line-builder"><div class="line-builder-grid"><label>Product<select id="po-line-product">${optionList(state.products, (item) => `${escapeHtml(item.sku)} · ${escapeHtml(item.name)}`, "Select product")}</select></label><label>Qty ordered<input id="po-line-qty" type="number" min="1" step="1" value="1" /></label><label>Unit cost<input id="po-line-cost" type="number" min="0" step="0.01" value="0" /></label><label>Line notes<input id="po-line-notes" /></label></div><button type="button" id="add-po-line" class="secondary-button">Add line</button></div>${renderDraftLines(state.poDraftLines, "remove-po-line", "unit_cost")}<button type="submit">Save purchase order</button></form></section>`;
}

function renderPurchaseOrdersList() {
  return renderListPanel("Imported purchase orders", "Inbound queue", state.purchaseOrders, (order) => `<article class="list-card"><div class="list-card-top"><div><h3>${escapeHtml(order.po_number)}</h3><p class="muted">${escapeHtml(order.supplier_name)} · ${order.total_received}/${order.total_ordered} received</p></div><span class="${orderStatusClass(order.status)}">${escapeHtml(order.status)}</span></div><div class="line-pill-row">${(order.lines || []).map((line) => `<span class="chip">${escapeHtml(line.sku)} · ${line.qty_received}/${line.qty_ordered}</span>`).join("")}</div></article>`, "span-7");
}

function renderGoodsInForm() {
  const order = currentPo();
  const pendingLines = (order?.lines || []).filter((line) => Number(line.qty_remaining || 0) > 0);
  return `<section class="panel span-5"><div class="panel-header"><div><p class="panel-kicker">Goods in</p><h2>Receive into holding</h2></div></div><form id="goods-in-form" class="stack-form"><label>Purchase order<select id="goods-in-po" name="purchase_order_id" required>${['<option value="">Select PO</option>'].concat(state.purchaseOrders.map((item) => `<option value="${item.id}" ${String(item.id) === String(state.selectedPoId) ? 'selected' : ''}>${escapeHtml(item.po_number)} · ${escapeHtml(item.supplier_name)}</option>`)).join("")}</select></label><label>PO line<select name="purchase_order_line_id" required>${['<option value="">Select PO line</option>'].concat(pendingLines.map((line) => `<option value="${line.id}">${escapeHtml(line.sku)} · ${escapeHtml(line.product_name)} · ${line.qty_remaining} remaining</option>`)).join("")}</select></label><div class="two-up"><label>Qty received<input name="qty_received" type="number" min="1" step="1" value="1" required /></label><label>Received by<input name="received_by" value="Goods In" /></label></div><label>Serial numbers<textarea name="serial_numbers" rows="3"></textarea></label><label>Notes<textarea name="notes" rows="2"></textarea></label><button type="submit">Receive stock</button></form></section>`;
}

function renderGoodsReceiptsList() {
  return `<section class="panel span-7"><div class="panel-header"><div><p class="panel-kicker">Holding feed</p><h2>Recent goods receipts</h2></div></div><div class="table-wrap"><table><thead><tr><th>Receipt</th><th>PO</th><th>Product</th><th>Qty</th><th>Target</th></tr></thead><tbody>${state.goodsReceipts.map((item) => `<tr><td>${escapeHtml(item.receipt_number)}</td><td><strong>${escapeHtml(item.po_number)}</strong><div class="muted">${escapeHtml(item.supplier_name)}</div></td><td>${escapeHtml(item.sku)} · ${escapeHtml(item.product_name)}</td><td>${item.qty_received}</td><td>${escapeHtml(item.target_location_code)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">No goods received yet</td></tr>'}</tbody></table></div></section>`;
}

function renderHoldingStock() {
  return renderListPanel("Stock waiting for putaway", "Holding", state.holdingStock, (item) => `<article class="list-card"><div class="list-card-top"><div><h3>${escapeHtml(item.sku)} · ${escapeHtml(item.name)}</h3><p class="muted">${item.qty_in_holding} in ${escapeHtml(item.location_code)}</p></div><span class="${item.serial_tracking ? 'badge badge-neutral' : 'badge badge-active'}">${item.serial_tracking ? 'Serialised' : 'Quantity'}</span></div>${item.serial_numbers.length ? `<p class="muted serial-list">${escapeHtml(item.serial_numbers.join(', '))}</p>` : '<p class="muted">No serials required</p>'}</article>`, "span-7");
}

function renderPutawayForm() {
  return `<section class="panel span-5"><div class="panel-header"><div><p class="panel-kicker">Putaway</p><h2>Move stock out of holding</h2></div></div><form id="putaway-form" class="stack-form"><label>Holding item<select name="product_id" required>${optionList(state.holdingStock, (item) => `${escapeHtml(item.sku)} · ${escapeHtml(item.name)} · ${item.qty_in_holding} in holding`, "Select item from holding")}</select></label><div class="two-up"><label>Destination<select name="destination_location_id" required>${optionList(putawayDestinations(), (item) => `${escapeHtml(item.code)} · ${escapeHtml(item.name)}`, "Select destination")}</select></label><label>Qty<input name="qty" type="number" min="1" step="1" value="1" required /></label></div><label>Serial numbers<textarea name="serial_numbers" rows="3"></textarea></label><div class="two-up"><label>Moved by<input name="moved_by" value="Putaway" /></label><label>Notes<input name="notes" /></label></div><button type="submit">Complete putaway</button></form></section>`;
}

function renderSalesOrderForm() {
  return `<section class="panel span-5"><div class="panel-header"><div><p class="panel-kicker">Outbound workflow</p><h2>Create sales order</h2></div></div><form id="sales-order-form" class="stack-form"><div class="two-up"><label>Order number<input name="order_number" required /></label><label>Customer<select name="customer_id" required>${optionList(state.customers, (item) => escapeHtml(item.name), "Select customer")}</select></label></div><label>Notes<input name="notes" /></label><div class="line-builder"><div class="line-builder-grid"><label>Product<select id="so-line-product">${optionList(state.products, (item) => `${escapeHtml(item.sku)} · ${escapeHtml(item.name)} · ${item.qty_available} available`, "Select product")}</select></label><label>Qty ordered<input id="so-line-qty" type="number" min="1" step="1" value="1" /></label><label>Unit price<input id="so-line-price" type="number" min="0" step="0.01" value="0" /></label><label>Line notes<input id="so-line-notes" /></label></div><button type="button" id="add-so-line" class="secondary-button">Add line</button></div>${renderDraftLines(state.soDraftLines, "remove-so-line", "unit_price")}<button type="submit">Save sales order</button></form></section>`;
}

function renderSalesOrdersList() {
  return `<section class="panel span-7"><div class="panel-header"><div><p class="panel-kicker">Dispatch queue</p><h2>Imported sales orders</h2></div><span class="count-pill">${state.salesOrders.length} orders</span></div><div class="list-grid">${state.salesOrders.map((order) => `<article class="list-card"><div class="list-card-top"><div><h3>${escapeHtml(order.order_number)}</h3><p class="muted">${escapeHtml(order.customer_name)} · ${order.total_dispatched}/${order.total_ordered} dispatched</p></div><span class="${orderStatusClass(order.status)}">${escapeHtml(order.status)}</span></div><div class="line-pill-row">${(order.lines || []).map((line) => `<span class="chip">${escapeHtml(line.sku)} · ${line.qty_dispatched}/${line.qty_ordered}${line.allocations?.length ? ` · ${line.allocations.length} alloc` : ''}</span>`).join("")}</div><div class="action-row"><button type="button" class="secondary-button" data-allocate-order="${order.id}">Allocate</button><button type="button" data-dispatch-order="${order.id}">Dispatch</button></div></article>`).join("") || '<p class="empty">No imported sales orders yet</p>'}</div></section>`;
}

function renderDispatchesList() {
  return `<section class="panel span-12"><div class="panel-header"><div><p class="panel-kicker">Outbound feed</p><h2>Recent dispatches</h2></div></div><div class="table-wrap"><table><thead><tr><th>Dispatch</th><th>Order</th><th>Customer</th><th>Product</th><th>Qty</th></tr></thead><tbody>${state.dispatches.map((item) => `<tr><td>${escapeHtml(item.dispatch_number)}</td><td>${escapeHtml(item.order_number)}</td><td>${escapeHtml(item.customer_name)}</td><td>${escapeHtml(item.sku)} · ${escapeHtml(item.product_name)}</td><td>${item.qty_dispatched}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">No dispatches yet</td></tr>'}</tbody></table></div></section>`;
}
function renderImportedOrderHint(title, copy, templateType, commandType) {
  const template = state.importTemplates.find((item) => item.type === templateType);
  return `
    <section class="panel span-5">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Imported documents</p>
          <h2>${title}</h2>
        </div>
      </div>
      <p class="muted">${copy}</p>
      <div class="stack-note">
        <p><strong>Template:</strong> ${template ? escapeHtml(template.filename) : 'Not available yet'}</p>
        <p><strong>Action:</strong> import the external order file, then process the operational steps here.</p>
      </div>
      ${template ? `<a class="ghost-link" href="${template.download_path}" target="_blank" rel="noreferrer">Download ${escapeHtml(template.type)} template</a>` : ''}
      <pre class="code-block">node scripts/import-data.js ${commandType} ./migration/phase-1-live-pack/csv/${templateType === 'purchase-orders' ? '07-purchase-orders.csv' : '08-sales-orders.csv'} --apply</pre>
    </section>
  `;
}


function renderAdjustmentsList() {
  return `<section class="panel span-7"><div class="panel-header"><div><p class="panel-kicker">Control log</p><h2>Recent adjustments</h2></div></div><div class="table-wrap"><table><thead><tr><th>Type</th><th>Product</th><th>Qty</th><th>Location</th><th>Reason</th></tr></thead><tbody>${state.adjustments.map((item) => `<tr><td>${escapeHtml(item.adjustment_type)}</td><td>${escapeHtml(item.sku)} · ${escapeHtml(item.product_name)}</td><td>${item.qty}</td><td>${escapeHtml(item.location_code || '-')}</td><td>${escapeHtml(item.reason)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">No adjustments yet</td></tr>'}</tbody></table></div></section>`;
}

function renderStockByLocationReport() {
  const report = state.reports.stockByLocation;
  const quantityRows = report.quantity.map((item) => `<tr><td>${escapeHtml(item.location_code)}</td><td>${escapeHtml(item.sku)} · ${escapeHtml(item.product_name)}</td><td>${item.qty_on_hand}</td><td>${item.qty_allocated}</td><td>${item.qty_available}</td><td>-</td></tr>`).join("");
  const serialRows = report.serialised.map((item) => `<tr><td>${escapeHtml(item.location_code)}</td><td>${escapeHtml(item.sku)} · ${escapeHtml(item.product_name)}</td><td>${item.qty_on_hand}</td><td>${item.qty_allocated}</td><td>${item.qty_available}</td><td>${escapeHtml(item.serial_number)}</td></tr>`).join("");
  return `<section class="panel span-12"><div class="panel-header"><div><p class="panel-kicker">Reporting</p><h2>Stock by location</h2></div></div><div class="table-wrap"><table><thead><tr><th>Location</th><th>Product</th><th>On hand</th><th>Allocated</th><th>Available</th><th>Serial</th></tr></thead><tbody>${quantityRows}${serialRows || '<tr><td colspan="6" class="empty">No stock report rows yet</td></tr>'}</tbody></table></div></section>`;
}

function renderOrderSummaryReport() {
  const report = state.reports.orderSummary;
  return `<section class="panel span-12"><div class="panel-header"><div><p class="panel-kicker">Reporting</p><h2>Order summary</h2></div></div><div class="two-column-report"><div><h3>Purchase orders</h3><div class="table-wrap compact"><table><thead><tr><th>Ref</th><th>Status</th><th>Party</th><th>Progress</th></tr></thead><tbody>${report.purchase.map((item) => `<tr><td>${escapeHtml(item.reference)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.party_name)}</td><td>${item.qty_progress}/${item.qty_ordered}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">No purchase orders</td></tr>'}</tbody></table></div></div><div><h3>Sales orders</h3><div class="table-wrap compact"><table><thead><tr><th>Ref</th><th>Status</th><th>Party</th><th>Progress</th></tr></thead><tbody>${report.sales.map((item) => `<tr><td>${escapeHtml(item.reference)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.party_name)}</td><td>${item.qty_progress}/${item.qty_ordered}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">No sales orders</td></tr>'}</tbody></table></div></div></div></section>`;
}

function renderStockMovements() {
  return `<section class="panel span-12"><div class="panel-header"><div><p class="panel-kicker">Movements</p><h2>Recent stock movements</h2></div></div><div class="table-wrap"><table><thead><tr><th>Type</th><th>Product</th><th>Qty</th><th>From</th><th>To</th><th>Serial</th></tr></thead><tbody>${state.stockMovements.map((item) => `<tr><td>${escapeHtml(item.movement_type)}</td><td>${escapeHtml(item.sku)} · ${escapeHtml(item.product_name)}</td><td>${item.qty}</td><td>${escapeHtml(item.from_location_code || '-')}</td><td>${escapeHtml(item.to_location_code || '-')}</td><td>${escapeHtml(item.serial_number || '-')}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">No stock movements yet</td></tr>'}</tbody></table></div></section>`;
}

function renderLowStock() {
  const items = state.dashboard?.lowStock || [];
  return `<section class="panel span-12"><div class="panel-header"><div><p class="panel-kicker">Attention</p><h2>Low stock watch</h2></div></div><div class="chip-row">${items.map((item) => `<span class="chip chip-alert">${escapeHtml(item.sku)} · ${item.available_qty} left</span>`).join("") || '<span class="chip">No low stock items yet</span>'}</div></section>`;
}

function renderActivity() {
  return `<section class="panel span-12"><div class="panel-header"><div><p class="panel-kicker">Audit</p><h2>Recent activity</h2></div></div><div class="timeline">${state.activity.map((item) => `<div class="timeline-row"><span class="timeline-tag">${escapeHtml(item.entity_type)}</span><div><strong>${escapeHtml(item.action)}</strong><p class="muted">${escapeHtml(item.entity_type)} #${escapeHtml(item.entity_id)}</p></div><time>${new Date(item.created_at).toLocaleString()}</time></div>`).join("") || '<p class="empty">No activity yet</p>'}</div></section>`;
}

function renderMigrationReadiness() {
  const data = state.reconciliation;
  if (!data) return `<section class="panel span-12"><p class="empty">Migration reconciliation is loading</p></section>`;
  const readinessClass = data.go_live_ready ? "badge badge-active" : "badge badge-warn";
  const totals = data.totals || {};
  return `
    <section class="panel span-12">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Migration checkpoint</p>
          <h2>Go-live reconciliation</h2>
        </div>
        <span class="${readinessClass}">${data.go_live_ready ? "Ready to review" : "Needs attention"}</span>
      </div>
      <div class="summary-grid">
        <article class="summary-card"><strong>${totals.products || 0}</strong><span>Products</span><small>Active catalogue lines</small></article>
        <article class="summary-card"><strong>${totals.suppliers || 0}</strong><span>Suppliers</span><small>Accounts imported</small></article>
        <article class="summary-card"><strong>${totals.customers || 0}</strong><span>Customers</span><small>Customer accounts loaded</small></article>
        <article class="summary-card"><strong>${totals.quantity_stock_on_hand || 0}</strong><span>Qty stock</span><small>Non-serial units on hand</small></article>
        <article class="summary-card"><strong>${totals.serial_stock_on_hand || 0}</strong><span>Serial stock</span><small>Tracked units on hand</small></article>
        <article class="summary-card"><strong>${totals.open_purchase_orders || 0}</strong><span>Open POs</span><small>Still expected after import</small></article>
        <article class="summary-card"><strong>${totals.open_sales_orders || 0}</strong><span>Open sales orders</span><small>Still to fulfil after import</small></article>
      </div>
      <div class="two-column-report migration-columns">
        <div>
          <h3>Warnings</h3>
          <div class="list-grid">${(data.warnings || []).map((warning) => `<article class="list-card"><p>${escapeHtml(warning)}</p></article>`).join("") || '<p class="empty">No migration warnings</p>'}</div>
        </div>
        <div>
          <h3>Required locations</h3>
          <div class="chip-row">${(data.required_locations || []).map((location) => `<span class="${location.present ? 'chip' : 'chip chip-alert'}">${escapeHtml(location.code)} ${location.present ? 'ready' : 'missing'}</span>`).join("")}</div>
          <h3>Location types</h3>
          <div class="chip-row">${(data.location_types || []).map((row) => `<span class="chip">${escapeHtml(row.type)} · ${row.count}</span>`).join("") || '<span class="chip">No location types yet</span>'}</div>
        </div>
      </div>
    </section>
  `;
}

function renderImportsPanel() {
  return `
    <section class="panel span-7">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Import tooling</p>
          <h2>Templates and validation rules</h2>
        </div>
      </div>
      <div class="list-grid">
        ${state.importTemplates.map((template) => `
          <article class="list-card">
            <div class="list-card-top">
              <div>
                <h3>${escapeHtml(template.type)}</h3>
                <p class="muted">${escapeHtml(template.description)}</p>
              </div>
              <a class="ghost-link" href="${template.download_path}" target="_blank" rel="noreferrer">Download CSV</a>
            </div>
            <div class="rule-list">${template.rules.map((rule) => `<span class="chip">${escapeHtml(rule)}</span>`).join("")}</div>
          </article>
        `).join("") || '<p class="empty">No import templates available</p>'}
      </div>
    </section>
  `;
}

function renderImportRuns() {
  return `
    <section class="panel span-12">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Audit trail</p>
          <h2>Recent import runs</h2>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Type</th><th>Mode</th><th>Status</th><th>Rows</th><th>Created</th><th>Updated</th><th>Issue</th></tr></thead>
          <tbody>${state.importRuns.map((run) => `<tr><td>${new Date(run.created_at).toLocaleString()}</td><td>${escapeHtml(run.import_type)}</td><td>${escapeHtml(run.mode)}</td><td><span class="${run.status === 'success' ? 'badge badge-active' : run.status === 'warning' ? 'badge badge-warn' : 'badge badge-inactive'}">${escapeHtml(run.status)}</span></td><td>${run.valid_rows}/${run.total_rows}</td><td>${run.created_count}</td><td>${run.updated_count}</td><td>${escapeHtml(run.error_message || '-')}</td></tr>`).join("") || '<tr><td colspan="8" class="empty">No import runs logged yet</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderImportGuide() {
  return `
    <section class="panel span-5">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Migration path</p>
          <h2>How to load live data</h2>
        </div>
      </div>
      <div class="stack-note">
        <p><strong>Step 1:</strong> load suppliers, customers, locations, and products first.</p>
        <p><strong>Step 2:</strong> import opening stock and serial stock only after the locations and products exist.</p>
        <p><strong>Step 3:</strong> import open purchase orders and open sales orders after master data and stock are in place.</p>
      </div>
      <pre class="code-block">node scripts/import-data.js products ./my-products.csv
node scripts/import-data.js products ./my-products.csv --apply
node scripts/import-data.js purchase-orders ./open-pos.csv --apply
node scripts/import-data.js sales-orders ./open-sales.csv --apply</pre>
      <div class="stack-note">
        <p><strong>Validation rules:</strong> stock imports require known products and locations, serial imports require unique serial numbers, and imported purchase or sales order numbers are rejected if they already exist.</p>
      </div>
    </section>
  `;
}

function renderSectionContent() {
  if (state.activeSection === "overview") {
    return `
      ${renderSectionHeader("Overview", "Use this as the landing page for the current position. Detailed workflows now live behind focused tabs so the home screen stays readable.")}
      ${renderOverviewCards()}
      ${renderMilestones()}
      ${renderLowStock()}
      ${renderActivity()}
    `;
  }

  if (state.activeSection === "setup") {
    return `
      ${renderSectionHeader("Setup", "Create and maintain the master data that the rest of the application depends on.")}
      ${renderProductForm()}
      ${renderProductsTable()}
      ${renderSupplierForm()}
      ${renderCustomerForm()}
      ${renderLocationForm()}
      ${renderSuppliersList()}
      ${renderCustomersList()}
      ${renderLocationsList()}
    `;
  }

  if (state.activeSection === "inbound") {
    return `
      ${renderSectionHeader("Inbound", "Use imported purchase orders as the inbound workload, then receive stock into HOLDING and complete putaway into live shelf or bin locations.")}
      ${renderImportedOrderHint("Import purchase orders", "Purchase orders should be created elsewhere and imported here for warehouse receiving.", "purchase-orders", "purchase-orders")}
      ${renderPurchaseOrdersList()}
      ${renderGoodsInForm()}
      ${renderGoodsReceiptsList()}
      ${renderHoldingStock()}
      ${renderPutawayForm()}
    `;
  }

  if (state.activeSection === "outbound") {
    return `
      ${renderSectionHeader("Outbound", "Use imported sales orders as the outbound workload, then allocate, build, and dispatch picked items.")}
      ${renderImportedOrderHint("Import sales orders", "Sales orders should be created elsewhere and imported here for warehouse fulfilment.", "sales-orders", "sales-orders")}
      ${renderSalesOrdersList()}
      ${renderDispatchesList()}
    `;
  }

  if (state.activeSection === "control") {
    return `
      ${renderSectionHeader("Control", "Use this area for corrections, damage handling, and movement history when you need to explain stock changes.")}
      ${renderAdjustmentForm()}
      ${renderAdjustmentsList()}
      ${renderStockMovements()}
    `;
  }

  if (state.activeSection === "reports") {
    return `
      ${renderSectionHeader("Reports", "Review stock position and order progress without the transaction forms getting in the way.")}
      ${renderStockByLocationReport()}
      ${renderOrderSummaryReport()}
    `;
  }

  return `
    ${renderSectionHeader("Imports", "Bring current live data into the system in a controlled order with validation first and apply second.")}
    ${renderMigrationReadiness()}
    ${renderImportsPanel()}
    ${renderImportGuide()}
    ${renderImportRuns()}
  `;
}

function render() {
  document.getElementById("app").innerHTML = `
    <main class="shell">
      ${renderHero()}
      ${renderMessages()}
      ${renderSectionNav()}
      <section class="grid">
        ${renderSectionContent()}
      </section>
    </main>`;
  bindForms();
}

function formDataToObject(form) {
  const data = new FormData(form);
  const result = {};
  for (const [key, value] of data.entries()) result[key] = value;
  Array.from(form.querySelectorAll('input[type="checkbox"]')).forEach((field) => { result[field.name] = field.checked; });
  return result;
}

function buildDraftLine({ productSelectId, qtyId, priceId, notesId, priceKey }) {
  const product = state.products.find((item) => String(item.id) === String(document.getElementById(productSelectId)?.value));
  const qty = Number(document.getElementById(qtyId)?.value || 0);
  if (!product || qty <= 0) throw new Error("Choose a product and quantity first");
  return { product_id: product.id, product_label: `${product.sku} · ${product.name}`, qty_ordered: qty, [priceKey]: Number(document.getElementById(priceId)?.value || 0), notes: document.getElementById(notesId)?.value || "" };
}

function bindForms() {
  const productForm = document.getElementById("product-form");
  const supplierForm = document.getElementById("supplier-form");
  const customerForm = document.getElementById("customer-form");
  const locationForm = document.getElementById("location-form");
  const purchaseOrderForm = document.getElementById("purchase-order-form");
  const goodsInForm = document.getElementById("goods-in-form");
  const putawayForm = document.getElementById("putaway-form");
  const salesOrderForm = document.getElementById("sales-order-form");
  const adjustmentForm = document.getElementById("adjustment-form");

  document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", () => {
    state.activeSection = button.getAttribute("data-section");
    render();
  }));

  productForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await api("/api/products", { method: "POST", body: JSON.stringify(formDataToObject(productForm)) }); productForm.reset(); productForm.unit_of_measure.value = "each"; productForm.tax_flag.checked = true; setMessage("Product saved"); await loadAll(); } catch (error) { setMessage(error.message, true); }
  });
  supplierForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await api("/api/suppliers", { method: "POST", body: JSON.stringify(formDataToObject(supplierForm)) }); supplierForm.reset(); setMessage("Supplier saved"); await loadAll(); } catch (error) { setMessage(error.message, true); }
  });
  customerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await api("/api/customers", { method: "POST", body: JSON.stringify(formDataToObject(customerForm)) }); customerForm.reset(); setMessage("Customer saved"); await loadAll(); } catch (error) { setMessage(error.message, true); }
  });
  locationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await api("/api/locations", { method: "POST", body: JSON.stringify(formDataToObject(locationForm)) }); locationForm.reset(); setMessage("Location saved"); await loadAll(); } catch (error) { setMessage(error.message, true); }
  });

  document.getElementById("add-po-line")?.addEventListener("click", () => {
    try { state.poDraftLines = state.poDraftLines.concat(buildDraftLine({ productSelectId: "po-line-product", qtyId: "po-line-qty", priceId: "po-line-cost", notesId: "po-line-notes", priceKey: "unit_cost" })); render(); } catch (error) { setMessage(error.message, true); }
  });
  document.getElementById("add-so-line")?.addEventListener("click", () => {
    try { state.soDraftLines = state.soDraftLines.concat(buildDraftLine({ productSelectId: "so-line-product", qtyId: "so-line-qty", priceId: "so-line-price", notesId: "so-line-notes", priceKey: "unit_price" })); render(); } catch (error) { setMessage(error.message, true); }
  });

  document.querySelectorAll("[data-remove-po-line]").forEach((button) => button.addEventListener("click", () => { state.poDraftLines = state.poDraftLines.filter((_, index) => index !== Number(button.getAttribute("data-remove-po-line"))); render(); }));
  document.querySelectorAll("[data-remove-so-line]").forEach((button) => button.addEventListener("click", () => { state.soDraftLines = state.soDraftLines.filter((_, index) => index !== Number(button.getAttribute("data-remove-so-line"))); render(); }));

  purchaseOrderForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (!state.poDraftLines.length) state.poDraftLines = [buildDraftLine({ productSelectId: "po-line-product", qtyId: "po-line-qty", priceId: "po-line-cost", notesId: "po-line-notes", priceKey: "unit_cost" })];
      const payload = formDataToObject(purchaseOrderForm);
      payload.lines = state.poDraftLines.map(({ product_id, qty_ordered, unit_cost, notes }) => ({ product_id, qty_ordered, unit_cost, notes }));
      await api("/api/purchase-orders", { method: "POST", body: JSON.stringify(payload) });
      state.poDraftLines = [];
      purchaseOrderForm.reset();
      setMessage("Purchase order created");
      await loadAll();
    } catch (error) { setMessage(error.message, true); }
  });

  document.getElementById("goods-in-po")?.addEventListener("change", (event) => { state.selectedPoId = event.target.value; render(); });
  goodsInForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = formDataToObject(goodsInForm);
      await api(`/api/purchase-orders/${encodeURIComponent(payload.purchase_order_id)}/receive`, { method: "POST", body: JSON.stringify(payload) });
      goodsInForm.reset();
      setMessage("Goods received into HOLDING");
      await loadAll();
    } catch (error) { setMessage(error.message, true); }
  });

  putawayForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await api("/api/putaway", { method: "POST", body: JSON.stringify(formDataToObject(putawayForm)) }); putawayForm.reset(); setMessage("Putaway completed"); await loadAll(); } catch (error) { setMessage(error.message, true); }
  });

  salesOrderForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (!state.soDraftLines.length) state.soDraftLines = [buildDraftLine({ productSelectId: "so-line-product", qtyId: "so-line-qty", priceId: "so-line-price", notesId: "so-line-notes", priceKey: "unit_price" })];
      const payload = formDataToObject(salesOrderForm);
      payload.lines = state.soDraftLines.map(({ product_id, qty_ordered, unit_price, notes }) => ({ product_id, qty_ordered, unit_price, notes }));
      await api("/api/sales-orders", { method: "POST", body: JSON.stringify(payload) });
      state.soDraftLines = [];
      salesOrderForm.reset();
      setMessage("Sales order created");
      await loadAll();
    } catch (error) { setMessage(error.message, true); }
  });

  adjustmentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await api("/api/adjustments", { method: "POST", body: JSON.stringify(formDataToObject(adjustmentForm)) }); adjustmentForm.reset(); adjustmentForm.adjusted_by.value = "Adjustment"; setMessage("Adjustment saved"); await loadAll(); } catch (error) { setMessage(error.message, true); }
  });

  document.querySelectorAll("[data-allocate-order]").forEach((button) => button.addEventListener("click", async () => {
    try { await api(`/api/sales-orders/${button.getAttribute("data-allocate-order")}/allocate`, { method: "POST", body: JSON.stringify({ allocated_by: "Allocation" }) }); setMessage("Order allocated"); await loadAll(); } catch (error) { setMessage(error.message, true); }
  }));
  document.querySelectorAll("[data-dispatch-order]").forEach((button) => button.addEventListener("click", async () => {
    try { await api(`/api/sales-orders/${button.getAttribute("data-dispatch-order")}/dispatch`, { method: "POST", body: JSON.stringify({ dispatched_by: "Dispatch" }) }); setMessage("Order dispatched"); await loadAll(); } catch (error) { setMessage(error.message, true); }
  }));
}

async function loadAll() {
  try {
    const [dashboard, products, suppliers, customers, locations, categories, purchaseOrders, salesOrders, goodsReceipts, dispatches, holdingStock, stockMovements, adjustments, stockByLocation, orderSummary, activity, importTemplates, importRuns, reconciliation] = await Promise.all([
      api("/api/dashboard"),
      api("/api/products"),
      api("/api/suppliers"),
      api("/api/customers"),
      api("/api/locations"),
      api("/api/categories"),
      api("/api/purchase-orders"),
      api("/api/sales-orders"),
      api("/api/goods-receipts"),
      api("/api/dispatches"),
      api("/api/holding-stock"),
      api("/api/stock-movements"),
      api("/api/adjustments"),
      api("/api/reports/stock-by-location"),
      api("/api/reports/order-summary"),
      api("/api/activity"),
      api("/api/import/templates"),
      api("/api/migration/import-runs"),
      api("/api/migration/reconciliation"),
    ]);
    Object.assign(state, { dashboard, products, suppliers, customers, locations, categories, purchaseOrders, salesOrders, goodsReceipts, dispatches, holdingStock, stockMovements, adjustments, importTemplates, importRuns, reconciliation, reports: { stockByLocation, orderSummary }, activity });
    if (!state.selectedPoId && purchaseOrders.length) state.selectedPoId = String(purchaseOrders[0].id);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

render();
loadAll();

import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";
import { formatCurrency, formatDate, formatNumber } from "../lib/formatters";

function createEmptyLine(nextId) {
  return {
    id: nextId,
    productId: "",
    quantityOrdered: "",
    unitCost: "",
  };
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function createInitialFormState() {
  return {
    supplierSearch: "",
    supplierId: "",
    orderDate: getTodayDate(),
    expectedDeliveryDate: "",
    supplierReference: "",
    notes: "",
    linkedSalesOrderSearch: "",
    linkedSalesOrders: [],
    lines: [createEmptyLine(1)],
  };
}

function formatSupplierOption(supplier) {
  return `${supplier.supplierCode} · ${supplier.name}`;
}

function formatSalesOrderOption(order) {
  return `${order.orderNumber} · ${order.customerName}`;
}

function buildValidationErrors({ supplierId, orderDate, lines, products }) {
  const errors = [];
  const productMap = new Map((products || []).map((product) => [String(product.id), product]));

  if (!supplierId) {
    errors.push("Select a supplier before creating the purchase order.");
  }

  if (!orderDate) {
    errors.push("Order date is required.");
  }

  if (!lines.length) {
    errors.push("Add at least one purchase order line.");
  }

  lines.forEach((line, index) => {
    const label = `Line ${index + 1}`;
    const quantity = Number(line.quantityOrdered);
    const unitCost = Number(line.unitCost);

    if (!line.productId || !productMap.has(String(line.productId))) {
      errors.push(`${label}: choose a product.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`${label}: quantity must be greater than 0.`);
    }

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      errors.push(`${label}: unit cost cannot be negative.`);
    }
  });

  return errors;
}

function NewPurchaseOrderPage({ onNavigate }) {
  const suppliers = useApiResource("/suppliers?active=true");
  const products = useApiResource("/products?active=true");
  const salesOrders = useApiResource("/sales-orders");

  const supplierItems = suppliers.data?.items || [];
  const productItems = products.data?.items || [];
  const salesOrderItems = salesOrders.data?.items || [];

  const [nextLineId, setNextLineId] = useState(2);
  const [formState, setFormState] = useState(createInitialFormState);
  const [submitState, setSubmitState] = useState({
    status: "idle",
    error: "",
    success: null,
  });
  const [showValidation, setShowValidation] = useState(false);

  const supplierLookup = useMemo(() => {
    return new Map(
      supplierItems.flatMap((supplier) => [
        [formatSupplierOption(supplier).toLowerCase(), supplier],
        [supplier.name.toLowerCase(), supplier],
        [supplier.supplierCode.toLowerCase(), supplier],
      ]),
    );
  }, [supplierItems]);

  const productLookup = useMemo(
    () => new Map(productItems.map((product) => [String(product.id), product])),
    [productItems],
  );

  const linkedSalesOrderLookup = useMemo(
    () => new Map(salesOrderItems.map((order) => [String(order.id), order])),
    [salesOrderItems],
  );

  useEffect(() => {
    if (!formState.supplierId && supplierItems.length === 1) {
      const supplier = supplierItems[0];
      setFormState((current) => ({
        ...current,
        supplierId: String(supplier.id),
        supplierSearch: formatSupplierOption(supplier),
      }));
    }
  }, [formState.supplierId, supplierItems]);

  const filteredSalesOrders = useMemo(() => {
    const search = formState.linkedSalesOrderSearch.trim().toLowerCase();

    if (!search) {
      return salesOrderItems.slice(0, 8);
    }

    return salesOrderItems
      .filter((order) => {
        return (
          order.orderNumber.toLowerCase().includes(search) ||
          order.customerName.toLowerCase().includes(search)
        );
      })
      .slice(0, 8);
  }, [formState.linkedSalesOrderSearch, salesOrderItems]);

  const enrichedLines = useMemo(() => {
    return formState.lines.map((line) => {
      const product = productLookup.get(String(line.productId));
      const quantity = Number(line.quantityOrdered);
      const unitCost = Number(line.unitCost);
      const lineTotal =
        Number.isFinite(quantity) && Number.isFinite(unitCost)
          ? Number((quantity * unitCost).toFixed(2))
          : 0;

      return {
        ...line,
        product,
        quantity,
        unitCostNumber: unitCost,
        lineTotal,
      };
    });
  }, [formState.lines, productLookup]);

  const validationErrors = useMemo(
    () =>
      buildValidationErrors({
        supplierId: formState.supplierId,
        orderDate: formState.orderDate,
        lines: formState.lines,
        products: productItems,
      }),
    [formState.lines, formState.orderDate, formState.supplierId, productItems],
  );

  const selectedSupplier = supplierItems.find(
    (supplier) => String(supplier.id) === String(formState.supplierId),
  );
  const selectedSalesOrders = formState.linkedSalesOrders
    .map((id) => linkedSalesOrderLookup.get(String(id)))
    .filter(Boolean);
  const totals = useMemo(() => {
    return enrichedLines.reduce(
      (summary, line) => {
        summary.lineCount += line.product ? 1 : 0;
        summary.totalQuantity += Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 0;
        summary.totalValue += line.lineTotal || 0;
        summary.serialLineCount += line.product?.serialRequired ? 1 : 0;
        return summary;
      },
      {
        lineCount: 0,
        totalQuantity: 0,
        totalValue: 0,
        serialLineCount: 0,
      },
    );
  }, [enrichedLines]);

  function updateForm(field, value) {
    setShowValidation(false);
    setSubmitState((current) => ({ ...current, error: "" }));
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSupplierSearch(value) {
    const match = supplierLookup.get(value.trim().toLowerCase());
    setShowValidation(false);
    setSubmitState((current) => ({ ...current, error: "" }));
    setFormState((current) => ({
      ...current,
      supplierSearch: value,
      supplierId: match ? String(match.id) : "",
    }));
  }

  function updateLine(lineId, field, value) {
    setShowValidation(false);
    setSubmitState((current) => ({ ...current, error: "" }));
    setFormState((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        if (line.id !== lineId) {
          return line;
        }

        const nextLine = {
          ...line,
          [field]: value,
        };

        if (field === "productId") {
          const product = productLookup.get(String(value));
          if (product && (line.unitCost === "" || Number(line.unitCost) === 0)) {
            nextLine.unitCost = String(product.defaultUnitCost ?? 0);
          }
        }

        return nextLine;
      }),
    }));
  }

  function addLine() {
    setShowValidation(false);
    setFormState((current) => ({
      ...current,
      lines: [...current.lines, createEmptyLine(nextLineId)],
    }));
    setNextLineId((current) => current + 1);
  }

  function removeLine(lineId) {
    setShowValidation(false);
    setFormState((current) => {
      if (current.lines.length === 1) {
        return {
          ...current,
          lines: [createEmptyLine(lineId)],
        };
      }

      return {
        ...current,
        lines: current.lines.filter((line) => line.id !== lineId),
      };
    });
  }

  function toggleLinkedSalesOrder(orderId) {
    const key = String(orderId);
    setShowValidation(false);
    setFormState((current) => {
      const exists = current.linkedSalesOrders.includes(key);
      return {
        ...current,
        linkedSalesOrders: exists
          ? current.linkedSalesOrders.filter((item) => item !== key)
          : [...current.linkedSalesOrders, key],
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setShowValidation(true);
    setSubmitState((current) => ({ ...current, error: "" }));

    if (validationErrors.length) {
      return;
    }

    setSubmitState({
      status: "submitting",
      error: "",
      success: null,
    });

    try {
      const payload = await apiFetch("/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplierId: Number(formState.supplierId),
          orderDate: formState.orderDate,
          expectedDeliveryDate: formState.expectedDeliveryDate || null,
          supplierReference: formState.supplierReference,
          notes: formState.notes,
          linkedSalesOrders: formState.linkedSalesOrders.map((id) => Number(id)),
          lines: enrichedLines.map((line) => ({
            productId: Number(line.productId),
            quantityOrdered: Number(line.quantity),
            unitCost: Number(line.unitCostNumber),
          })),
        }),
      });

      setSubmitState({
        status: "success",
        error: "",
        success: payload.item,
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        error: error.message || "Unable to create purchase order.",
        success: null,
      });
    }
  }

  function resetForm() {
    setNextLineId(2);
    setShowValidation(false);
    setSubmitState({
      status: "idle",
      error: "",
      success: null,
    });
    setFormState(createInitialFormState());
  }

  if (submitState.success) {
    const created = submitState.success;

    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Inbound"
          title="Purchase Order Created"
          description="The new purchase order is now ready for supplier confirmation and goods-in processing."
        />

        <Card title={created.poNumber} subtitle="Creation Complete">
          <div className="po-success-layout">
            <div className="po-success-hero">
              <span className="po-success-badge">Open</span>
              <h3>{created.poNumber}</h3>
              <p>
                {created.supplier.name} · {created.lines.length} line{created.lines.length === 1 ? "" : "s"} ·{" "}
                {formatCurrency(created.totals.totalValue)}
              </p>
            </div>

            <dl className="po-success-grid">
              <div>
                <dt>Order date</dt>
                <dd>{formatDate(created.orderDate)}</dd>
              </div>
              <div>
                <dt>Expected delivery</dt>
                <dd>{formatDate(created.expectedDeliveryDate)}</dd>
              </div>
              <div>
                <dt>Supplier reference</dt>
                <dd>{created.supplierReference || "—"}</dd>
              </div>
              <div>
                <dt>Linked sales orders</dt>
                <dd>
                  {created.linkedSalesOrders.length
                    ? created.linkedSalesOrders.map((order) => order.orderNumber).join(", ")
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="po-success-actions">
              <Button
                onClick={() =>
                  onNavigate?.(`/purchase-orders?po=${encodeURIComponent(created.poNumber)}`)
                }
              >
                View Purchase Order
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  onNavigate?.(`/receive-goods?po=${encodeURIComponent(created.poNumber)}`)
                }
              >
                Receive Goods Against PO
              </Button>
              <Button variant="secondary" onClick={resetForm}>
                Create Another PO
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const loadingState =
    suppliers.status === "loading" || products.status === "loading" || salesOrders.status === "loading";
  const loadError =
    suppliers.error || products.error || salesOrders.error || submitState.error;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inbound"
        title="New Purchase Order"
        description="Raise supplier orders inside the platform with live line validation, linked demand context, and a review-first submission flow."
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate?.("/purchase-orders")}>
              Back to Purchase Orders
            </Button>
            <Button variant="secondary" onClick={() => onNavigate?.("/receive-goods")}>
              Open Receive Goods
            </Button>
          </>
        }
      />

      {loadError ? (
        <div className="notice error">
          <strong>Unable to prepare the purchase order workspace.</strong>
          <span>{loadError}</span>
        </div>
      ) : null}

      <form className="po-create-layout" onSubmit={handleSubmit}>
        <div className="po-create-main">
          <Card title="Order Header" subtitle="Supplier and Schedule">
            {loadingState ? (
              <div className="detail-state">
                <strong>Loading purchasing data</strong>
                <p>Preparing suppliers, products, and sales orders for the new purchase order.</p>
              </div>
            ) : (
              <div className="master-data-form-grid">
                <label className="master-data-field">
                  <span className="master-data-field-label">
                    Supplier <span className="master-data-required">*</span>
                  </span>
                  <input
                    list="po-supplier-options"
                    value={formState.supplierSearch}
                    onChange={(event) => handleSupplierSearch(event.target.value)}
                    placeholder="Search supplier by code or name"
                  />
                  <datalist id="po-supplier-options">
                    {supplierItems.map((supplier) => (
                      <option key={supplier.id} value={formatSupplierOption(supplier)} />
                    ))}
                  </datalist>
                </label>

                <label className="master-data-field">
                  <span className="master-data-field-label">
                    Order date <span className="master-data-required">*</span>
                  </span>
                  <input
                    type="date"
                    value={formState.orderDate}
                    onChange={(event) => updateForm("orderDate", event.target.value)}
                  />
                </label>

                <label className="master-data-field">
                  <span className="master-data-field-label">Expected delivery</span>
                  <input
                    type="date"
                    value={formState.expectedDeliveryDate}
                    onChange={(event) => updateForm("expectedDeliveryDate", event.target.value)}
                  />
                </label>

                <label className="master-data-field">
                  <span className="master-data-field-label">Supplier reference</span>
                  <input
                    value={formState.supplierReference}
                    onChange={(event) => updateForm("supplierReference", event.target.value)}
                    placeholder="QUOTE-12345"
                  />
                </label>

                <label className="master-data-field full-width">
                  <span className="master-data-field-label">Notes</span>
                  <textarea
                    value={formState.notes}
                    onChange={(event) => updateForm("notes", event.target.value)}
                    placeholder="Add any instructions for purchasing, supplier coordination, or receiving."
                  />
                </label>
              </div>
            )}
          </Card>

          <Card title="Linked Sales Orders" subtitle="Optional Demand Context">
            {salesOrderItems.length ? (
              <div className="po-sales-order-picker">
                <label className="master-data-field full-width">
                  <span className="master-data-field-label">Search sales orders</span>
                  <input
                    value={formState.linkedSalesOrderSearch}
                    onChange={(event) => updateForm("linkedSalesOrderSearch", event.target.value)}
                    placeholder="Search SO number or customer"
                  />
                </label>

                <div className="po-sales-order-results">
                  {filteredSalesOrders.length ? (
                    filteredSalesOrders.map((order) => {
                      const checked = formState.linkedSalesOrders.includes(String(order.id));
                      return (
                        <label key={order.id} className={checked ? "po-sales-order-card selected" : "po-sales-order-card"}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLinkedSalesOrder(order.id)}
                          />
                          <div>
                            <strong>{formatSalesOrderOption(order)}</strong>
                            <span>{order.summary?.allocationStatus || order.status}</span>
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <div className="po-inline-empty">No sales orders match the current search.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="po-inline-empty">
                There are no sales orders available to link yet. You can still raise the purchase order.
              </div>
            )}
          </Card>

          <Card title="Purchase Order Lines" subtitle="Product, Quantity, and Cost">
            <div className="po-lines-toolbar">
              <div>
                <strong>{formState.lines.length} line{formState.lines.length === 1 ? "" : "s"}</strong>
                <p>Use the live line table below to build the order before you submit it.</p>
              </div>
              <Button type="button" variant="secondary" onClick={addLine}>
                Add Line
              </Button>
            </div>

            {productItems.length ? (
              <div className="po-lines-table-wrap">
                <table className="po-lines-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Unit Cost</th>
                      <th>Serial</th>
                      <th>Line Total</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedLines.map((line, index) => (
                      <tr key={line.id}>
                        <td>
                          <label className="po-line-field">
                            <span className="po-line-index">Line {index + 1}</span>
                            <select
                              value={line.productId}
                              onChange={(event) => updateLine(line.id, "productId", event.target.value)}
                            >
                              <option value="">Select a product</option>
                              {productItems.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.sku} · {product.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.quantityOrdered}
                            onChange={(event) => updateLine(line.id, "quantityOrdered", event.target.value)}
                            placeholder="0"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitCost}
                            onChange={(event) => updateLine(line.id, "unitCost", event.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td>
                          <span className={line.product?.serialRequired ? "pill serial-required" : "pill subtle"}>
                            {line.product?.serialRequired ? "Required" : "No"}
                          </span>
                        </td>
                        <td>
                          <strong>{formatCurrency(line.lineTotal)}</strong>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="po-line-remove"
                            onClick={() => removeLine(line.id)}
                            aria-label={`Remove line ${index + 1}`}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="po-inline-empty">
                No active products are available. Add or reactivate products before raising a purchase order.
              </div>
            )}
          </Card>
        </div>

        <aside className="po-create-side">
          <Card title="Review and Submit" subtitle="Live Summary" className="po-review-card">
            <div className="po-review-stack">
              <div className="po-review-hero">
                <strong>{selectedSupplier?.name || "Supplier not selected"}</strong>
                <span>
                  {formState.orderDate ? `Ordered ${formatDate(formState.orderDate)}` : "Choose an order date"}
                </span>
              </div>

              <dl className="po-review-metrics">
                <div>
                  <dt>Lines</dt>
                  <dd>{totals.lineCount}</dd>
                </div>
                <div>
                  <dt>Total qty</dt>
                  <dd>{formatNumber(totals.totalQuantity)}</dd>
                </div>
                <div>
                  <dt>Serial lines</dt>
                  <dd>{totals.serialLineCount}</dd>
                </div>
                <div>
                  <dt>PO total</dt>
                  <dd>{formatCurrency(totals.totalValue)}</dd>
                </div>
              </dl>

              <div className="po-review-section">
                <h4>Linked demand</h4>
                {selectedSalesOrders.length ? (
                  <div className="po-chip-list">
                    {selectedSalesOrders.map((order) => (
                      <span key={order.id} className="po-chip">
                        {order.orderNumber}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>No sales orders linked.</p>
                )}
              </div>

              <div className="po-review-section">
                <h4>Line review</h4>
                {enrichedLines.some((line) => line.product) ? (
                  <div className="po-review-lines">
                    {enrichedLines
                      .filter((line) => line.product)
                      .map((line) => (
                        <article key={line.id} className="po-review-line">
                          <div>
                            <strong>
                              {line.product.sku} · {line.product.name}
                            </strong>
                            <span>
                              {formatNumber(line.quantity || 0)} @ {formatCurrency(line.unitCostNumber || 0)}
                            </span>
                          </div>
                          <strong>{formatCurrency(line.lineTotal)}</strong>
                        </article>
                      ))}
                  </div>
                ) : (
                  <p>Add a product line to review the order.</p>
                )}
              </div>

              {showValidation && validationErrors.length ? (
                <div className="notice error">
                  <strong>Resolve these items before submitting.</strong>
                  <ul className="po-validation-list">
                    {validationErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="notice">
                  <strong>Ready for review</strong>
                  <span>Use this panel to confirm supplier, quantities, cost, and linked demand before you submit.</span>
                </div>
              )}

              <div className="po-submit-actions">
                <Button
                  type="submit"
                  disabled={loadingState || submitState.status === "submitting" || !productItems.length}
                >
                  {submitState.status === "submitting" ? "Creating Purchase Order..." : "Create Purchase Order"}
                </Button>
              </div>
            </div>
          </Card>
        </aside>
      </form>
    </div>
  );
}

export default NewPurchaseOrderPage;

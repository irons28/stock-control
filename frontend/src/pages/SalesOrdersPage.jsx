import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";
import { formatDate, formatLabel, formatNumber } from "../lib/formatters";

const BADGE_CLASS_BY_STATUS = {
  "Awaiting Stock": "badge-awaiting",
  "Part Allocated": "badge-partial",
  "Fully Allocated": "badge-full",
  "Ready to Dispatch": "badge-ready",
  Dispatched: "badge-dispatched",
};

function StatusBadge({ value }) {
  const className = BADGE_CLASS_BY_STATUS[value] || "";
  return <span className={`pill status-pill ${className}`}>{value}</span>;
}

function formatQuantity(value, unitOfMeasure = "") {
  const formatted = formatNumber(value);
  return unitOfMeasure ? `${formatted} ${unitOfMeasure}` : formatted;
}

function toNumericMap(values = {}) {
  return Object.entries(values).reduce((accumulator, [key, rawValue]) => {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      accumulator[key] = parsed;
    }
    return accumulator;
  }, {});
}

function buildAllocationDraft(orderDetail, stockByProduct, serialSelections, quantitySelections) {
  if (!orderDetail) {
    return {
      allocations: [],
      summaryItems: [],
      errors: [],
    };
  }

  const allocations = [];
  const summaryItems = [];
  const errors = [];
  const duplicateSerialTracker = new Set();
  const quantityByStockItem = new Map();

  for (const line of orderDetail.lines) {
    if (line.remainingQuantity <= 0) {
      continue;
    }

    const stock = stockByProduct[line.productId];
    const availableItems = new Map((stock?.items || []).map((item) => [item.stockItemId, item]));

    if (line.product.isSerialTracked) {
      const selectedIds = (serialSelections[line.id] || []).map(Number).filter(Number.isFinite);
      if (!selectedIds.length) {
        continue;
      }

      if (selectedIds.length > line.remainingQuantity) {
        errors.push(`${line.product.name}: selected serials exceed the remaining quantity.`);
      }

      const serialNumbers = [];

      for (const stockItemId of selectedIds) {
        if (duplicateSerialTracker.has(stockItemId)) {
          errors.push(`${line.product.name}: duplicate serial selection is not allowed.`);
          continue;
        }

        duplicateSerialTracker.add(stockItemId);
        const item = availableItems.get(stockItemId);

        if (!item) {
          errors.push(`${line.product.name}: one or more selected serials are no longer available.`);
          continue;
        }

        serialNumbers.push(item.serialNumber || `Stock ${stockItemId}`);
      }

      allocations.push({
        salesOrderLineId: line.id,
        serialStockItemIds: selectedIds,
      });

      summaryItems.push({
        lineId: line.id,
        productName: line.product.name,
        mode: "serial",
        quantity: selectedIds.length,
        unitOfMeasure: line.product.unitOfMeasure,
        serialNumbers,
      });

      continue;
    }

    const quantityMap = toNumericMap(quantitySelections[line.id]);
    const quantityAllocations = Object.entries(quantityMap).map(([stockItemId, quantity]) => ({
      stockItemId: Number(stockItemId),
      quantity,
    }));

    if (!quantityAllocations.length) {
      continue;
    }

    let lineQuantity = 0;

    for (const entry of quantityAllocations) {
      const item = availableItems.get(entry.stockItemId);
      if (!item) {
        errors.push(`${line.product.name}: selected stock is no longer available.`);
        continue;
      }

      const existingRequested = Number(quantityByStockItem.get(entry.stockItemId) || 0);
      if (existingRequested + entry.quantity > Number(item.availableQuantity || 0)) {
        errors.push(`${line.product.name}: insufficient stock for the requested quantity.`);
      }

      quantityByStockItem.set(entry.stockItemId, existingRequested + entry.quantity);
      lineQuantity += entry.quantity;
    }

    if (lineQuantity > line.remainingQuantity) {
      errors.push(`${line.product.name}: entered quantity exceeds the remaining quantity.`);
    }

    allocations.push({
      salesOrderLineId: line.id,
      quantityAllocations,
    });

    summaryItems.push({
      lineId: line.id,
      productName: line.product.name,
      mode: "quantity",
      quantity: lineQuantity,
      unitOfMeasure: line.product.unitOfMeasure,
    });
  }

  if (!allocations.length) {
    errors.push("Add at least one allocation before confirming.");
  }

  return {
    allocations,
    summaryItems,
    errors,
  };
}

function SalesOrdersPage() {
  const salesOrders = useApiResource("/sales-orders");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("");
  const [orderDetail, setOrderDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [detailError, setDetailError] = useState("");
  const [stockByProduct, setStockByProduct] = useState({});
  const [stockStatus, setStockStatus] = useState("idle");
  const [stockError, setStockError] = useState("");
  const [serialSelections, setSerialSelections] = useState({});
  const [quantitySelections, setQuantitySelections] = useState({});
  const [submitState, setSubmitState] = useState({
    status: "idle",
    error: "",
    success: "",
  });

  const allOrders = salesOrders.data?.items || [];
  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return allOrders;
    }

    return allOrders.filter((order) => {
      return (
        order.orderNumber.toLowerCase().includes(normalizedSearch) ||
        order.customerName.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [allOrders, searchTerm]);

  useEffect(() => {
    if (!filteredOrders.length) {
      setSelectedOrderNumber("");
      return;
    }

    const hasSelectedOrder = filteredOrders.some(
      (order) => order.orderNumber === selectedOrderNumber,
    );

    if (!selectedOrderNumber || !hasSelectedOrder) {
      setSelectedOrderNumber(filteredOrders[0].orderNumber);
    }
  }, [filteredOrders, selectedOrderNumber]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrderDetail() {
      if (!selectedOrderNumber) {
        setOrderDetail(null);
        return;
      }

      setDetailStatus("loading");
      setDetailError("");
      setSubmitState((current) => ({ ...current, error: "" }));

      try {
        const detail = await apiFetch(`/sales-orders/${selectedOrderNumber}`);
        if (cancelled) {
          return;
        }

        setOrderDetail(detail);
        setDetailStatus("success");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setOrderDetail(null);
        setDetailStatus("error");
        setDetailError(error.message || "Unable to load the selected sales order.");
      }
    }

    void loadOrderDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedOrderNumber]);

  useEffect(() => {
    let cancelled = false;

    async function loadAvailableStock() {
      if (!orderDetail) {
        setStockByProduct({});
        return;
      }

      const productIds = Array.from(
        new Set(
          orderDetail.lines
            .filter((line) => line.remainingQuantity > 0)
            .map((line) => line.productId),
        ),
      );

      if (!productIds.length) {
        setStockByProduct({});
        setStockStatus("success");
        setStockError("");
        return;
      }

      setStockStatus("loading");
      setStockError("");

      try {
        const stockResponses = await Promise.all(
          productIds.map((productId) =>
            apiFetch(`/allocation/available-stock/${productId}`),
          ),
        );

        if (cancelled) {
          return;
        }

        const nextStockByProduct = stockResponses.reduce((accumulator, stockResponse) => {
          accumulator[stockResponse.product.id] = stockResponse;
          return accumulator;
        }, {});

        setStockByProduct(nextStockByProduct);
        setStockStatus("success");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStockByProduct({});
        setStockStatus("error");
        setStockError(error.message || "Unable to load available stock.");
      }
    }

    void loadAvailableStock();

    return () => {
      cancelled = true;
    };
  }, [orderDetail]);

  useEffect(() => {
    setSerialSelections({});
    setQuantitySelections({});
    setSubmitState({
      status: "idle",
      error: "",
      success: "",
    });
  }, [selectedOrderNumber]);

  const allocationDraft = useMemo(
    () => buildAllocationDraft(orderDetail, stockByProduct, serialSelections, quantitySelections),
    [orderDetail, stockByProduct, serialSelections, quantitySelections],
  );

  async function refreshSelection(orderNumber) {
    salesOrders.reload();
    const detail = await apiFetch(`/sales-orders/${orderNumber}`);
    setOrderDetail(detail);

    const productIds = Array.from(
      new Set(detail.lines.filter((line) => line.remainingQuantity > 0).map((line) => line.productId)),
    );

    const stockResponses = await Promise.all(
      productIds.map((productId) => apiFetch(`/allocation/available-stock/${productId}`)),
    );

    setStockByProduct(
      stockResponses.reduce((accumulator, stockResponse) => {
        accumulator[stockResponse.product.id] = stockResponse;
        return accumulator;
      }, {}),
    );
  }

  function handleSerialToggle(lineId, stockItemId, checked) {
    setSerialSelections((current) => {
      const existing = new Set(current[lineId] || []);
      if (checked) {
        existing.add(stockItemId);
      } else {
        existing.delete(stockItemId);
      }

      return {
        ...current,
        [lineId]: Array.from(existing),
      };
    });
  }

  function handleQuantityChange(lineId, stockItemId, value) {
    setQuantitySelections((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] || {}),
        [stockItemId]: value,
      },
    }));
  }

  async function handleConfirmAllocation() {
    if (!orderDetail) {
      return;
    }

    if (allocationDraft.errors.length) {
      setSubmitState({
        status: "error",
        error: allocationDraft.errors[0],
        success: "",
      });
      return;
    }

    setSubmitState({
      status: "submitting",
      error: "",
      success: "",
    });

    try {
      const response = await apiFetch(`/sales-orders/${orderDetail.order.orderNumber}/allocate`, {
        method: "POST",
        body: {
          allocations: allocationDraft.allocations,
        },
      });

      setSerialSelections({});
      setQuantitySelections({});
      setSubmitState({
        status: "success",
        error: "",
        success: response.message || "Allocation completed successfully.",
      });
      await refreshSelection(orderDetail.order.orderNumber);
    } catch (error) {
      setSubmitState({
        status: "error",
        error: error.message || "Unable to save allocation.",
        success: "",
      });
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Outbound"
        title="Sales Orders"
        description="Search customer orders, review open demand, and allocate available stock with a single confirmation step."
        actions={
          <Button variant="secondary" onClick={salesOrders.reload}>
            Refresh Orders
          </Button>
        }
      />

      <div className="sales-order-layout">
        <Card title="Order Queue" subtitle="Search">
          <div className="sales-order-search">
            <label className="field-label" htmlFor="sales-order-search">
              Search by SO number or customer
            </label>
            <input
              id="sales-order-search"
              className="text-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="SO-1001 or Alpha Veterinary"
            />
          </div>

          {salesOrders.status === "loading" ? (
            <div className="table-state">
              <strong>Loading orders</strong>
              <p>Fetching live sales orders from the API.</p>
            </div>
          ) : null}

          {salesOrders.status === "error" ? (
            <div className="table-state error">
              <strong>Unable to load orders</strong>
              <p>{salesOrders.error}</p>
            </div>
          ) : null}

          {salesOrders.status === "success" ? (
            <div className="order-list">
              {filteredOrders.length ? (
                filteredOrders.map((order) => (
                  <button
                    key={order.orderNumber}
                    type="button"
                    className={`order-list-item ${
                      selectedOrderNumber === order.orderNumber ? "active" : ""
                    }`}
                    onClick={() => setSelectedOrderNumber(order.orderNumber)}
                  >
                    <div className="order-list-head">
                      <strong>{order.orderNumber}</strong>
                      <StatusBadge value={order.summary.allocationStatus} />
                    </div>
                    <p>{order.customerName}</p>
                    <div className="order-list-meta">
                      <span>Due {formatDate(order.dispatchDueAt)}</span>
                      <span>{formatQuantity(order.summary.quantityRemaining)} remaining</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="table-state">
                  <strong>No matching sales orders</strong>
                  <p>Try a different SO number or customer search.</p>
                </div>
              )}
            </div>
          ) : null}
        </Card>

        <div className="sales-order-detail-stack">
          <Card title="Allocation Workspace" subtitle="Selected Order">
            {detailStatus === "loading" ? (
              <div className="table-state">
                <strong>Loading order detail</strong>
                <p>Pulling lines, remaining quantities, and allocation status.</p>
              </div>
            ) : null}

            {detailStatus === "error" ? (
              <div className="table-state error">
                <strong>Unable to load order detail</strong>
                <p>{detailError}</p>
              </div>
            ) : null}

            {detailStatus === "success" && orderDetail ? (
              <div className="detail-stack">
                <div className="detail-summary">
                  <div>
                    <p className="eyebrow">Sales Order</p>
                    <h3>{orderDetail.order.orderNumber}</h3>
                    <p className="page-description">
                      {orderDetail.order.customerName} · Requested {formatDate(orderDetail.order.requestedAt)} ·
                      Dispatch due {formatDate(orderDetail.order.dispatchDueAt)}
                    </p>
                  </div>
                  <StatusBadge value={orderDetail.order.summary.allocationStatus} />
                </div>

                <div className="summary-grid allocation-summary-grid">
                  <article className="card summary-card">
                    <div className="card-body">
                      <p className="summary-label">Lines</p>
                      <strong className="summary-value">{orderDetail.order.summary.lineCount}</strong>
                      <p className="summary-detail">Open products on this order.</p>
                    </div>
                  </article>
                  <article className="card summary-card">
                    <div className="card-body">
                      <p className="summary-label">Ordered</p>
                      <strong className="summary-value">
                        {formatNumber(orderDetail.order.summary.quantityOrdered)}
                      </strong>
                      <p className="summary-detail">Total requested quantity.</p>
                    </div>
                  </article>
                  <article className="card summary-card">
                    <div className="card-body">
                      <p className="summary-label">Allocated</p>
                      <strong className="summary-value">
                        {formatNumber(orderDetail.order.summary.quantityAllocated)}
                      </strong>
                      <p className="summary-detail">Reserved against stock.</p>
                    </div>
                  </article>
                  <article className="card summary-card">
                    <div className="card-body">
                      <p className="summary-label">Remaining</p>
                      <strong className="summary-value">
                        {formatNumber(orderDetail.order.summary.quantityRemaining)}
                      </strong>
                      <p className="summary-detail">Still waiting on allocation.</p>
                    </div>
                  </article>
                </div>

                <div className="line-stack">
                  {orderDetail.lines.map((line) => {
                    const availableStock = stockByProduct[line.productId];
                    const availableItems = availableStock?.items || [];

                    return (
                      <article key={line.id} className="allocation-line-card">
                        <div className="allocation-line-head">
                          <div>
                            <h4>
                              {line.product.name} <span className="line-sku">({line.product.sku})</span>
                            </h4>
                            <p>
                              Ordered {formatQuantity(line.quantityOrdered, line.product.unitOfMeasure)} · Allocated{" "}
                              {formatQuantity(line.quantityAllocated, line.product.unitOfMeasure)} · Remaining{" "}
                              {formatQuantity(line.remainingQuantity, line.product.unitOfMeasure)}
                            </p>
                          </div>
                          <StatusBadge value={line.allocationStatus} />
                        </div>

                        <div className="allocation-line-meta">
                          <span className="pill subtle">{formatLabel(line.product.trackingMode)}</span>
                          <span className="pill subtle">
                            Source PO {line.purchaseOrderNumber || "Unlinked"}
                          </span>
                          <span className="pill subtle">
                            Available {formatQuantity(availableStock?.totalAvailableQuantity || 0, line.product.unitOfMeasure)}
                          </span>
                        </div>

                        {line.remainingQuantity <= 0 ? (
                          <div className="table-state">
                            <strong>Line already fully allocated</strong>
                            <p>No further stock selection is needed for this product.</p>
                          </div>
                        ) : null}

                        {line.remainingQuantity > 0 && stockStatus === "loading" ? (
                          <div className="table-state">
                            <strong>Loading available stock</strong>
                            <p>Checking live stock records for this product.</p>
                          </div>
                        ) : null}

                        {line.remainingQuantity > 0 && stockStatus === "error" ? (
                          <div className="table-state error">
                            <strong>Unable to load stock</strong>
                            <p>{stockError}</p>
                          </div>
                        ) : null}

                        {line.remainingQuantity > 0 && stockStatus === "success" ? (
                          <>
                            {availableItems.length ? (
                              <div className="stock-option-list">
                                {availableItems.map((item) => (
                                  <div key={item.stockItemId} className="stock-option-card">
                                    <div>
                                      <strong>
                                        {line.product.isSerialTracked
                                          ? item.serialNumber
                                          : `${formatQuantity(item.availableQuantity, line.product.unitOfMeasure)} available`}
                                      </strong>
                                      <p>
                                        {item.actualLocationCode || item.stockLocationCode || "Unknown location"} ·{" "}
                                        {item.purchaseOrderNumber || "No PO"}
                                      </p>
                                    </div>

                                    {line.product.isSerialTracked ? (
                                      <label className="checkbox-field">
                                        <input
                                          type="checkbox"
                                          checked={(serialSelections[line.id] || []).includes(item.stockItemId)}
                                          onChange={(event) =>
                                            handleSerialToggle(
                                              line.id,
                                              item.stockItemId,
                                              event.target.checked,
                                            )
                                          }
                                        />
                                        <span>Select serial</span>
                                      </label>
                                    ) : (
                                      <div className="quantity-field">
                                        <label className="field-label" htmlFor={`qty-${line.id}-${item.stockItemId}`}>
                                          Allocate quantity
                                        </label>
                                        <input
                                          id={`qty-${line.id}-${item.stockItemId}`}
                                          className="text-input quantity-input"
                                          type="number"
                                          min="0"
                                          step="1"
                                          max={item.availableQuantity}
                                          value={quantitySelections[line.id]?.[item.stockItemId] || ""}
                                          onChange={(event) =>
                                            handleQuantityChange(
                                              line.id,
                                              item.stockItemId,
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="table-state">
                                <strong>No available stock</strong>
                                <p>This line is still awaiting stock before it can be allocated.</p>
                              </div>
                            )}
                          </>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </Card>

          <Card title="Allocation Summary" subtitle="Review Before Confirm">
            {submitState.success ? <div className="alert success">{submitState.success}</div> : null}
            {submitState.error ? <div className="alert error">{submitState.error}</div> : null}
            {allocationDraft.errors.length && !submitState.error ? (
              <div className="alert warning">{allocationDraft.errors[0]}</div>
            ) : null}

            {allocationDraft.summaryItems.length ? (
              <div className="draft-summary-list">
                {allocationDraft.summaryItems.map((item) => (
                  <div key={item.lineId} className="draft-summary-item">
                    <div>
                      <strong>{item.productName}</strong>
                      <p>
                        {item.mode === "serial"
                          ? `${item.quantity} serial number${item.quantity === 1 ? "" : "s"} selected`
                          : `${formatQuantity(item.quantity, item.unitOfMeasure)} selected`}
                      </p>
                      {item.mode === "serial" && item.serialNumbers.length ? (
                        <p className="serial-chip-row">{item.serialNumbers.join(", ")}</p>
                      ) : null}
                    </div>
                    <span className="pill subtle">{formatLabel(item.mode)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="table-state">
                <strong>No draft allocation yet</strong>
                <p>Select serials or enter quantities above to build the confirmation summary.</p>
              </div>
            )}

            <div className="allocation-actions">
              <Button
                onClick={handleConfirmAllocation}
                disabled={submitState.status === "submitting" || detailStatus !== "success"}
              >
                {submitState.status === "submitting" ? "Saving Allocation..." : "Confirm Allocation"}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default SalesOrdersPage;

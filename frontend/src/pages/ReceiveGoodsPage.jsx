import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";
import { formatDate, formatDateTime, formatLabel, formatNumber } from "../lib/formatters";

function parseSerialText(value) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildInitialLineState(lines) {
  return Object.fromEntries(
    lines.map((line) => [
      line.id,
      {
        quantityReceived: "",
        serialText: "",
      },
    ])
  );
}

function ReceiveGoodsPage() {
  const purchaseOrders = useApiResource("/purchase-orders");
  const [selectedPoNumber, setSelectedPoNumber] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("po") || "";
  });
  const [detailState, setDetailState] = useState({
    status: "idle",
    data: null,
    error: "",
  });
  const [detailRequestKey, setDetailRequestKey] = useState(0);
  const [formState, setFormState] = useState({
    deliveryNumber: "",
    receivedBy: "",
    lines: {},
  });
  const [validationMessage, setValidationMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successSummary, setSuccessSummary] = useState(null);

  const purchaseOrderOptions = purchaseOrders.data?.items || [];

  useEffect(() => {
    if (!purchaseOrderOptions.length || selectedPoNumber) {
      return;
    }

    setSelectedPoNumber(purchaseOrderOptions[0].order_number);
  }, [purchaseOrderOptions, selectedPoNumber]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!selectedPoNumber) {
        setDetailState({
          status: "idle",
          data: null,
          error: "",
        });
        return;
      }

      setDetailState({
        status: "loading",
        data: null,
        error: "",
      });

      try {
        const payload = await apiFetch(`/purchase-orders/${encodeURIComponent(selectedPoNumber)}`);
        if (cancelled) {
          return;
        }

        setDetailState({
          status: "success",
          data: payload,
          error: "",
        });
        setFormState((current) => ({
          deliveryNumber:
            current.deliveryNumber && payload.order.order_number === selectedPoNumber
              ? current.deliveryNumber
              : "",
          receivedBy:
            current.receivedBy && payload.order.order_number === selectedPoNumber
              ? current.receivedBy
              : "",
          lines: buildInitialLineState(payload.lines),
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setDetailState({
          status: "error",
          data: null,
          error: error.message || "Unable to load purchase order detail.",
        });
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedPoNumber, detailRequestKey]);

  const liveLineSummary = useMemo(() => {
    const lines = detailState.data?.lines || [];
    return lines.map((line) => {
      const draftValue = formState.lines[line.id]?.quantityReceived;
      const quantityNow = draftValue === "" ? 0 : Number(draftValue);
      return {
        ...line,
        quantity_now: Number.isFinite(quantityNow) && quantityNow > 0 ? quantityNow : 0,
        quantity_after: Math.max(0, Number(line.quantity_remaining) - (Number.isFinite(quantityNow) ? quantityNow : 0)),
        serial_count: parseSerialText(formState.lines[line.id]?.serialText || "").length,
      };
    });
  }, [detailState.data, formState.lines]);

  function updateLine(lineId, field, value) {
    setValidationMessage("");
    setSuccessSummary(null);
    setFormState((current) => ({
      ...current,
      lines: {
        ...current.lines,
        [lineId]: {
          ...(current.lines[lineId] || { quantityReceived: "", serialText: "" }),
          [field]: value,
        },
      },
    }));
  }

  function handleHeaderField(field, value) {
    setValidationMessage("");
    setSuccessSummary(null);
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setValidationMessage("");
    setSuccessSummary(null);

    if (!selectedPoNumber) {
      setValidationMessage("Select a purchase order before receiving goods.");
      return;
    }

    if (!formState.deliveryNumber.trim()) {
      setValidationMessage("Enter the supplier delivery number.");
      return;
    }

    if (!formState.receivedBy.trim()) {
      setValidationMessage("Enter who received the delivery.");
      return;
    }

    const submissionLines = liveLineSummary
      .filter((line) => line.quantity_now > 0)
      .map((line) => ({
        purchaseOrderLineId: line.id,
        quantityReceived: line.quantity_now,
        serialNumbers: parseSerialText(formState.lines[line.id]?.serialText || ""),
      }));

    if (!submissionLines.length) {
      setValidationMessage("Enter at least one quantity to receive.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = await apiFetch(`/purchase-orders/${encodeURIComponent(selectedPoNumber)}/receive`, {
        method: "POST",
        body: JSON.stringify({
          deliveryNumber: formState.deliveryNumber.trim(),
          receivedBy: formState.receivedBy.trim(),
          lines: submissionLines,
        }),
      });

      setSuccessSummary(payload);
      purchaseOrders.reload();
      setDetailRequestKey((current) => current + 1);
    } catch (error) {
      setValidationMessage(error.message || "Unable to receive goods.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Goods In"
        title="Receive Goods"
        description="Book partial or full deliveries against open purchase orders, capture serial numbers, and make stock immediately available."
        actions={
          <Button variant="secondary" onClick={purchaseOrders.reload}>
            Refresh Orders
          </Button>
        }
      />

      <Card title="Select Purchase Order" subtitle="Inbound Queue">
        <div className="form-grid">
          <label className="field">
            <span>Purchase order</span>
            <select
              value={selectedPoNumber}
              onChange={(event) => {
                setSelectedPoNumber(event.target.value);
                setSuccessSummary(null);
                setValidationMessage("");
              }}
            >
              <option value="">Select a purchase order</option>
              {purchaseOrderOptions.map((item) => (
                <option key={item.order_number} value={item.order_number}>
                  {item.order_number} · {item.supplier_name} · {formatLabel(item.status)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card title="Receive Delivery" subtitle="Receipt Entry">
        {detailState.status === "loading" ? (
          <div className="table-state">
            <strong>Loading purchase order</strong>
            <p>Preparing lines for receipt entry.</p>
          </div>
        ) : null}

        {detailState.status === "error" ? (
          <div className="table-state error">
            <strong>Unable to load purchase order</strong>
            <p>{detailState.error}</p>
            <div className="table-state-actions">
              <Button variant="secondary" onClick={() => setDetailRequestKey((current) => current + 1)}>
                Try Again
              </Button>
            </div>
          </div>
        ) : null}

        {detailState.status === "success" ? (
          <form className="receive-form" onSubmit={handleSubmit}>
            <section className="po-detail-grid">
              <div className="po-summary">
                <p className="eyebrow">Receiving Against</p>
                <h3>{detailState.data.order.order_number}</h3>
                <p className="po-summary-copy">
                  {detailState.data.order.supplier_name} · Ordered {formatDate(detailState.data.order.ordered_at)} ·
                  Expected {formatDate(detailState.data.order.expected_at)}
                </p>
                <dl className="po-line-metrics">
                  <div>
                    <dt>Status</dt>
                    <dd>{formatLabel(detailState.data.order.status)}</dd>
                  </div>
                  <div>
                    <dt>Total ordered</dt>
                    <dd>{formatNumber(detailState.data.order.total_ordered)}</dd>
                  </div>
                  <div>
                    <dt>Previously received</dt>
                    <dd>{formatNumber(detailState.data.order.total_received)}</dd>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd>{formatNumber(detailState.data.order.total_remaining)}</dd>
                  </div>
                </dl>
              </div>

              <div className="form-grid tight">
                <label className="field">
                  <span>Delivery number</span>
                  <input
                    value={formState.deliveryNumber}
                    onChange={(event) => handleHeaderField("deliveryNumber", event.target.value)}
                    placeholder="DN-001"
                  />
                </label>
                <label className="field">
                  <span>Received by</span>
                  <input
                    value={formState.receivedBy}
                    onChange={(event) => handleHeaderField("receivedBy", event.target.value)}
                    placeholder="Warehouse Team"
                  />
                </label>
              </div>
            </section>

            {validationMessage ? (
              <div className="notice error">
                <strong>Validation error</strong>
                <p>{validationMessage}</p>
              </div>
            ) : null}

            {successSummary ? (
              <div className="notice success">
                <strong>Receipt saved</strong>
                <p>
                  {successSummary.deliveryNumber} booked as {successSummary.receiptNumber}. Purchase
                  order is now {formatLabel(successSummary.status)} and stock is available in{" "}
                  {successSummary.holdingLocation}.
                </p>
              </div>
            ) : null}

            <div className="receive-line-list">
              {liveLineSummary.map((line) => (
                <article key={line.id} className="receive-line-card">
                  <div className="po-line-card-header">
                    <div>
                      <strong>
                        {line.sku} · {line.product_name}
                      </strong>
                      <p>{line.is_serial_tracked ? "Serial tracked" : "Quantity tracked"}</p>
                    </div>
                    <span className="pill subtle">{formatLabel(line.quantity_remaining > 0 ? "pending" : "complete")}</span>
                  </div>

                  <dl className="po-line-metrics">
                    <div>
                      <dt>Ordered</dt>
                      <dd>{formatNumber(line.quantity_ordered)}</dd>
                    </div>
                    <div>
                      <dt>Previously received</dt>
                      <dd>{formatNumber(line.quantity_received)}</dd>
                    </div>
                    <div>
                      <dt>Receiving now</dt>
                      <dd>{formatNumber(line.quantity_now)}</dd>
                    </div>
                    <div>
                      <dt>Remaining after receipt</dt>
                      <dd>{formatNumber(line.quantity_after)}</dd>
                    </div>
                  </dl>

                  <div className="form-grid tight">
                    <label className="field">
                      <span>Quantity received</span>
                      <input
                        type="number"
                        min="0"
                        step={line.is_serial_tracked ? "1" : "0.01"}
                        value={formState.lines[line.id]?.quantityReceived || ""}
                        onChange={(event) => updateLine(line.id, "quantityReceived", event.target.value)}
                        placeholder="0"
                      />
                    </label>

                    {line.is_serial_tracked ? (
                      <label className="field field-span-2">
                        <span>Serial numbers</span>
                        <textarea
                          rows="4"
                          value={formState.lines[line.id]?.serialText || ""}
                          onChange={(event) => updateLine(line.id, "serialText", event.target.value)}
                          placeholder="One serial per line or comma-separated"
                        />
                        <small>{line.serial_count} captured</small>
                      </label>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="form-actions">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving Receipt..." : "Submit Receipt"}
              </Button>
            </div>

            {successSummary ? (
              <section>
                <h4 className="section-title">Success Summary</h4>
                <div className="receipt-history-list">
                  {successSummary.lines.map((line) => (
                    <article key={line.purchase_order_line_id} className="receipt-history-card">
                      <strong>
                        {line.sku} · {line.product_name}
                      </strong>
                      <p>
                        Ordered {formatNumber(line.quantity_ordered)} · Previously received{" "}
                        {formatNumber(line.previously_received)}
                      </p>
                      <small>
                        Receiving now {formatNumber(line.quantity_received_now)} · Remaining{" "}
                        {formatNumber(line.quantity_remaining_after_receipt)}
                      </small>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h4 className="section-title">Recent Receipts</h4>
              {detailState.data.receipts.length ? (
                <div className="receipt-history-list">
                  {detailState.data.receipts.map((receipt) => (
                    <article key={receipt.id} className="receipt-history-card">
                      <strong>{receipt.delivery_number || receipt.receipt_number}</strong>
                      <p>
                        {formatDateTime(receipt.received_at)} · {receipt.received_by}
                      </p>
                      <small>{formatNumber(receipt.total_received)} units received</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="table-state">
                  <strong>No receipts yet</strong>
                  <p>This purchase order has not been received before.</p>
                </div>
              )}
            </section>
          </form>
        ) : null}

        {detailState.status === "idle" ? (
          <div className="table-state">
            <strong>No purchase order selected</strong>
            <p>Choose an order from the inbound queue to start receiving goods.</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default ReceiveGoodsPage;

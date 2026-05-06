import { useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import GuidedHelpPanel from "../components/GuidedHelpPanel";
import PageHeader from "../components/PageHeader";
import { HELP_CONTENT } from "../config/helpContent";
import { useApiResource } from "../hooks/useApiResource";
import { apiFetch } from "../lib/api";
import { formatDate, formatDateTime, formatNumber } from "../lib/formatters";

function normalizeSerial(value = "") {
  return String(value).trim().toUpperCase();
}

function formatQuantity(value, unitOfMeasure = "") {
  const formatted = formatNumber(value);
  return unitOfMeasure ? `${formatted} ${unitOfMeasure}` : formatted;
}

function DispatchPage() {
  const dispatchReady = useApiResource("/dispatch/ready");
  const [dispatchReferenceByOrder, setDispatchReferenceByOrder] = useState({});
  const [dispatchedByByOrder, setDispatchedByByOrder] = useState({});
  const [scanInputByOrder, setScanInputByOrder] = useState({});
  const [verifiedSerialsByOrder, setVerifiedSerialsByOrder] = useState({});
  const [messageByOrder, setMessageByOrder] = useState({});
  const [submittingOrderId, setSubmittingOrderId] = useState(null);
  const [lastSuccess, setLastSuccess] = useState(null);

  const orders = dispatchReady.data?.items || [];

  function setOrderMessage(orderId, type, text) {
    setMessageByOrder((current) => ({
      ...current,
      [orderId]: text ? { type, text } : null,
    }));
  }

  function handleScanSubmit(order, event) {
    event.preventDefault();

    const nextValue = normalizeSerial(scanInputByOrder[order.salesOrderId] || "");
    if (!nextValue) {
      return;
    }

    if (!order.allocatedSerialNumbers.includes(nextValue)) {
      setOrderMessage(order.salesOrderId, "error", `${nextValue} is not allocated to ${order.orderNumber}.`);
      return;
    }

    const currentSerials = verifiedSerialsByOrder[order.salesOrderId] || [];
    if (currentSerials.includes(nextValue)) {
      setOrderMessage(order.salesOrderId, "warning", `${nextValue} has already been checked.`);
      setScanInputByOrder((current) => ({ ...current, [order.salesOrderId]: "" }));
      return;
    }

    const verifiedSerials = [...currentSerials, nextValue];

    setVerifiedSerialsByOrder((current) => ({
      ...current,
      [order.salesOrderId]: verifiedSerials,
    }));
    setScanInputByOrder((current) => ({ ...current, [order.salesOrderId]: "" }));
    setOrderMessage(
      order.salesOrderId,
      "success",
      `${verifiedSerials.length} of ${order.allocatedSerialNumbers.length} serials confirmed.`,
    );
  }

  async function handleDispatch(order) {
    const dispatchedBy = String(dispatchedByByOrder[order.salesOrderId] || "").trim();
    const dispatchReference = String(dispatchReferenceByOrder[order.salesOrderId] || "").trim();
    const verifiedSerials = verifiedSerialsByOrder[order.salesOrderId] || [];

    if (!dispatchedBy) {
      setOrderMessage(order.salesOrderId, "error", "Enter who is dispatching this order.");
      return;
    }

    if (!dispatchReference) {
      setOrderMessage(order.salesOrderId, "error", "Enter a dispatch reference before confirming.");
      return;
    }

    if (order.allocatedSerialNumbers.length && verifiedSerials.length !== order.allocatedSerialNumbers.length) {
      setOrderMessage(order.salesOrderId, "error", "Confirm all allocated serials before dispatch.");
      return;
    }

    setSubmittingOrderId(order.salesOrderId);
    setOrderMessage(order.salesOrderId, null, "");

    try {
      const payload = await apiFetch("/dispatch", {
        method: "POST",
        body: {
          salesOrderId: order.salesOrderId,
          dispatchedBy,
          dispatchReference,
          serialNumbers: order.allocatedSerialNumbers.length ? verifiedSerials : undefined,
        },
      });

      setLastSuccess(payload);
      setDispatchReferenceByOrder((current) => ({ ...current, [order.salesOrderId]: "" }));
      setDispatchedByByOrder((current) => ({ ...current, [order.salesOrderId]: "" }));
      setScanInputByOrder((current) => ({ ...current, [order.salesOrderId]: "" }));
      setVerifiedSerialsByOrder((current) => ({ ...current, [order.salesOrderId]: [] }));
      setOrderMessage(order.salesOrderId, "success", `${order.orderNumber} dispatched successfully.`);
      dispatchReady.reload();
    } catch (error) {
      setOrderMessage(
        order.salesOrderId,
        "error",
        error.message || `Unable to dispatch ${order.orderNumber}.`,
      );
    } finally {
      setSubmittingOrderId(null);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Outbound"
        title="Dispatch Ready"
        description="Review fully allocated sales orders, verify serials with a scanner-friendly check step, and confirm dispatch with a reference."
        help={HELP_CONTENT.dispatch}
        actions={
          <Button variant="secondary" onClick={dispatchReady.reload}>
            Refresh
          </Button>
        }
      />

      <GuidedHelpPanel
        intro={HELP_CONTENT.dispatch.summary}
        steps={HELP_CONTENT.dispatch.steps}
        warnings={HELP_CONTENT.dispatch.warnings}
      />

      {lastSuccess ? (
        <Card title={`Dispatch Confirmed: ${lastSuccess.orderNumber}`} subtitle="Success">
          <div className="dispatch-success-grid">
            <div>
              <span className="detail-label">Reference</span>
              <strong>{lastSuccess.dispatchReference}</strong>
            </div>
            <div>
              <span className="detail-label">Dispatched By</span>
              <strong>{lastSuccess.dispatchedBy}</strong>
            </div>
            <div>
              <span className="detail-label">Dispatched At</span>
              <strong>{formatDateTime(lastSuccess.dispatchedAt)}</strong>
            </div>
            <div>
              <span className="detail-label">Summary</span>
              <strong>
                {lastSuccess.summary.lineCount} lines, {lastSuccess.summary.serialCount} serials
              </strong>
            </div>
          </div>
        </Card>
      ) : null}

      {dispatchReady.status === "loading" ? (
        <Card title="Loading Dispatch Queue" subtitle="Outbound">
          <div className="table-state">
            <strong>Checking ready-to-dispatch orders</strong>
            <p>Reviewing sales orders where all required stock has already been allocated.</p>
          </div>
        </Card>
      ) : null}

      {dispatchReady.status === "error" ? (
        <Card title="Dispatch Queue Error" subtitle="Outbound">
          <div className="table-state error">
            <strong>Unable to load dispatch-ready orders</strong>
            <p>{dispatchReady.error}</p>
          </div>
        </Card>
      ) : null}

      {dispatchReady.status === "success" && !orders.length ? (
        <Card title="No Orders Ready" subtitle="Outbound">
          <div className="table-state">
            <strong>Nothing is ready to dispatch</strong>
            <p>Orders will appear here once every line is fully allocated.</p>
          </div>
        </Card>
      ) : null}

      {orders.length ? (
        <div className="dispatch-order-list">
          {orders.map((order) => {
            const verifiedSerials = verifiedSerialsByOrder[order.salesOrderId] || [];
            const orderMessage = messageByOrder[order.salesOrderId];
            const isSubmitting = submittingOrderId === order.salesOrderId;

            return (
              <Card
                key={order.salesOrderId}
                title={order.orderNumber}
                subtitle={order.customerName}
                className="dispatch-order-card"
              >
                <div className="dispatch-order-meta">
                  <span>Requested {formatDate(order.requestedAt)}</span>
                  <span>Dispatch due {formatDate(order.dispatchDueAt)}</span>
                  <span>{order.summary.lineCount} lines</span>
                  <span>{formatNumber(order.summary.quantityAllocated)} units allocated</span>
                </div>

                <div className="dispatch-line-list">
                  {order.lines.map((line) => (
                    <article key={line.salesOrderLineId} className="dispatch-line-card">
                      <div className="dispatch-line-head">
                        <div>
                          <strong>{line.product.name}</strong>
                          <p>{line.product.sku}</p>
                        </div>
                        <span className="pill status-pill badge-ready">Allocated</span>
                      </div>
                      <div className="dispatch-line-meta">
                        <span>
                          Ordered {formatQuantity(line.quantityOrdered, line.product.unitOfMeasure)}
                        </span>
                        <span>
                          Allocated {formatQuantity(line.allocatedQuantityFromStock, line.product.unitOfMeasure)}
                        </span>
                        <span>
                          Remaining {formatQuantity(line.remainingToDispatch, line.product.unitOfMeasure)}
                        </span>
                      </div>

                      {line.allocatedItems.length ? (
                        <div className="dispatch-allocated-list">
                          {line.allocatedItems.map((item) => (
                            <div
                              key={`${line.salesOrderLineId}-${item.stockItemId}`}
                              className="dispatch-allocated-item"
                            >
                              <strong>{item.serialNumber || formatQuantity(item.quantityAllocated, line.product.unitOfMeasure)}</strong>
                              <span>
                                {item.actualLocationCode || item.stockLocationCode || "Warehouse"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>

                {order.allocatedSerialNumbers.length ? (
                  <div className="dispatch-serial-check">
                    <div className="dispatch-serial-head">
                      <div>
                        <span className="detail-label">Serial Check</span>
                        <strong>
                          {verifiedSerials.length} of {order.allocatedSerialNumbers.length} confirmed
                        </strong>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setVerifiedSerialsByOrder((current) => ({
                            ...current,
                            [order.salesOrderId]: [],
                          }));
                          setOrderMessage(order.salesOrderId, null, "");
                        }}
                      >
                        Clear Checked
                      </Button>
                    </div>

                    <form
                      className="dispatch-scan-form"
                      onSubmit={(event) => handleScanSubmit(order, event)}
                    >
                      <input
                        className="serial-search-input"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        placeholder="Scan serial and press Enter"
                        value={scanInputByOrder[order.salesOrderId] || ""}
                        onChange={(event) =>
                          setScanInputByOrder((current) => ({
                            ...current,
                            [order.salesOrderId]: event.target.value.toUpperCase(),
                          }))
                        }
                      />
                      <Button type="submit">Check Serial</Button>
                    </form>

                    <div className="dispatch-serial-chip-list">
                      {order.allocatedSerialNumbers.map((serialNumber) => {
                        const isVerified = verifiedSerials.includes(serialNumber);

                        return (
                          <span
                            key={serialNumber}
                            className={`dispatch-serial-chip${isVerified ? " verified" : ""}`}
                          >
                            {serialNumber}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="dispatch-form-grid">
                  <label className="dispatch-form-field">
                    <span className="field-label">Dispatch Reference</span>
                    <input
                      className="text-input"
                      type="text"
                      placeholder="e.g. VAN-12 / DPD-42881"
                      value={dispatchReferenceByOrder[order.salesOrderId] || ""}
                      onChange={(event) =>
                        setDispatchReferenceByOrder((current) => ({
                          ...current,
                          [order.salesOrderId]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="dispatch-form-field">
                    <span className="field-label">Dispatched By</span>
                    <input
                      className="text-input"
                      type="text"
                      placeholder="Warehouse operator name"
                      value={dispatchedByByOrder[order.salesOrderId] || ""}
                      onChange={(event) =>
                        setDispatchedByByOrder((current) => ({
                          ...current,
                          [order.salesOrderId]: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                {orderMessage?.text ? (
                  <div className={`alert ${orderMessage.type}`}>{orderMessage.text}</div>
                ) : null}

                <div className="dispatch-actions">
                  <Button
                    onClick={() => handleDispatch(order)}
                    disabled={
                      isSubmitting ||
                      (order.allocatedSerialNumbers.length &&
                        verifiedSerials.length !== order.allocatedSerialNumbers.length)
                    }
                  >
                    {isSubmitting ? "Dispatching…" : "Confirm Dispatch"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default DispatchPage;

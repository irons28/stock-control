export const HELP_CONTENT = {
  receiveGoods: {
    title: "Receive Goods",
    summary: "Use this page to book supplier deliveries against an existing purchase order and move the stock into the holding area safely.",
    steps: [
      "Select or search for the purchase order you are receiving today.",
      "Check the expected lines and compare the remaining quantities before you book anything in.",
      "Enter the quantities that physically arrived on this delivery.",
      "Scan or type serial numbers for any serial-tracked items before saving.",
      "Confirm the receipt once the lines and serials match the delivery paperwork.",
    ],
    warnings: [
      "Partial deliveries are allowed, so only book what has really arrived.",
      "Do not receive more than the remaining quantity on the purchase order line.",
    ],
  },
  purchaseOrders: {
    title: "Purchase Orders",
    summary: "Review inbound demand, supplier commitments, and which lines are still outstanding before stock reaches the warehouse.",
    steps: [
      "Search by PO number or supplier to narrow the list.",
      "Open a purchase order to review line-level progress and linked sales demand.",
      "Use Receive Goods when the delivery is physically on site.",
    ],
    warnings: [
      "A partially received order can still have open lines waiting for future deliveries.",
    ],
  },
  salesOrders: {
    title: "Sales Orders",
    summary: "Follow customer demand from order entry through allocation and readiness for dispatch.",
    steps: [
      "Review due dates and priorities first so urgent orders are handled before routine work.",
      "Open an order to compare ordered, allocated, and dispatched quantities line by line.",
      "Allocate available stock only when the correct SKU and serials are confirmed.",
    ],
    warnings: [
      "If a line requires serial numbers, make sure the chosen serials belong to the correct customer order before saving.",
    ],
  },
  allocation: {
    title: "Allocation",
    summary: "Allocation matches available stock to customer sales orders so the dispatch team knows what is reserved.",
    steps: [
      "Check the order line still has a remaining quantity to allocate.",
      "Choose the correct stock or serial numbers from the available list.",
      "Confirm the allocation and review the order status after saving.",
    ],
    warnings: [
      "Awaiting allocation means stock has not yet been reserved against that customer demand.",
      "Serial-tracked items must have the correct serial numbers selected before they can be dispatched.",
    ],
  },
  dispatch: {
    title: "Dispatch",
    summary: "Dispatch is the final outbound confirmation step after stock has been allocated and checked.",
    steps: [
      "Open a dispatch-ready order and verify the customer and order reference.",
      "Check the serial numbers or quantities one final time before confirming.",
      "Confirm dispatch only when the goods have actually left the warehouse.",
    ],
    warnings: [
      "Dispatch should only happen after allocation and stock checks are complete.",
    ],
  },
  stock: {
    title: "Current Stock",
    summary: "Use this view to understand what is on hand, where it is held, and what has already been reserved.",
    steps: [
      "Review available versus allocated stock before promising items to customers.",
      "Use serial search when you need to trace one specific unit.",
      "Use movement history to understand how stock reached its current location.",
    ],
    warnings: [
      "If stock appears short, check whether it is allocated or still sitting in a holding location.",
    ],
  },
  serialSearch: {
    title: "Serial Number Search",
    summary: "Trace one specific serial number through receiving, allocation, dispatch, and returns activity.",
    steps: [
      "Enter or scan the full serial number.",
      "Review the current location and the lifecycle timeline returned.",
      "Use the order references to confirm the right customer or purchase history.",
    ],
    warnings: [
      "If no result is found, confirm the serial was entered exactly as scanned.",
    ],
  },
  importData: {
    title: "Import Data",
    summary: "Imports are designed for structured bulk loads with validation before anything is written into live data.",
    steps: [
      "Choose the correct entity type before you upload a file.",
      "Map every required column and review the validation preview carefully.",
      "Only run the import once the preview shows the rows you expect.",
    ],
    warnings: [
      "Import the right template for the right entity to avoid avoidable errors.",
      "Validation warnings should be reviewed before you continue into the live import step.",
    ],
  },
};

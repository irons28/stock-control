const moduleDefinitions = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Operational overview for inventory, orders, and exceptions.",
    path: "/",
  },
  {
    key: "customers",
    label: "Customers",
    description: "Manage customer accounts for sales orders and dispatch.",
    path: "/customers",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    description: "Manage supplier records and purchasing contacts.",
    path: "/suppliers",
  },
  {
    key: "products",
    label: "Products",
    description: "Maintain SKUs, pricing, tracking mode, and supplier defaults.",
    path: "/products",
  },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    description: "Raise, receive, and reconcile purchase orders from suppliers.",
    path: "/purchase-orders",
  },
  {
    key: "sales-orders",
    label: "Sales Orders",
    description: "Create customer orders, allocate stock, and dispatch goods.",
    path: "/sales-orders",
  },
  {
    key: "stock-locations",
    label: "Stock Locations",
    description: "Define holding, shelf, bin, dispatch, and damaged locations.",
    path: "/stock-locations",
  },
  {
    key: "stock-movements",
    label: "Stock Movements",
    description: "Track goods in, putaway, dispatch, and adjustment activity.",
    path: "/stock-movements",
  },
  {
    key: "goods-receiving",
    label: "Goods Receiving",
    description: "Receive stock against purchase orders into holding locations.",
    path: "/goods-receiving",
  },
  {
    key: "order-linking",
    label: "PO to SO Linking",
    description: "Link inbound purchase orders to outbound sales orders.",
    path: "/order-linking",
  },
];

module.exports = {
  moduleDefinitions,
};

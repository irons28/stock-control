import MasterDataPage, {
  createActionColumn,
  createActiveStatusColumn,
} from "../components/MasterDataPage";
import { formatCurrency } from "../lib/formatters";

const fields = [
  { name: "sku", label: "SKU", required: true, placeholder: "SKU-1001" },
  { name: "name", label: "Product name", required: true, placeholder: "Industrial Sensor Kit" },
  { name: "category", label: "Category", placeholder: "Sensors" },
  { name: "defaultUnitCost", label: "Default unit cost", type: "number", min: "0", step: "0.01", placeholder: "0.00" },
  { name: "description", label: "Description", type: "textarea", fullWidth: true, rows: 4, placeholder: "Short purchasing or warehouse note for this SKU." },
  { name: "serialRequired", label: "Serial required", type: "toggle", onLabel: "Each unit must capture a serial number", offLabel: "Quantity-based receiving is allowed" },
  { name: "active", label: "Active product", type: "toggle", onLabel: "Available in purchasing flows", offLabel: "Hidden from new purchasing activity" },
];

function createEmptyRecord() {
  return {
    sku: "",
    name: "",
    category: "",
    description: "",
    serialRequired: false,
    defaultUnitCost: "0.00",
    active: true,
  };
}

function validateRecord(record) {
  const errors = {};

  if (!record.sku.trim()) {
    errors.sku = "SKU is required.";
  }

  if (!record.name.trim()) {
    errors.name = "Product name is required.";
  }

  const parsedCost = Number(record.defaultUnitCost);
  if (!Number.isFinite(parsedCost) || parsedCost < 0) {
    errors.defaultUnitCost = "Enter a valid non-negative unit cost.";
  }

  return errors;
}

function getColumns({ canManage, onEdit }) {
  return [
    {
      key: "sku",
      header: "SKU",
      render: (row) => (
        <div className="master-data-primary-cell">
          <strong>{row.sku}</strong>
          <span>{row.category || "Uncategorised"}</span>
        </div>
      ),
    },
    {
      key: "name",
      header: "Product",
      render: (row) => (
        <div className="master-data-primary-cell">
          <strong>{row.name}</strong>
          <span>{row.description || "No description added yet"}</span>
        </div>
      ),
    },
    {
      key: "serialRequired",
      header: "Serial Tracking",
      render: (row) => (
        <span className={row.serialRequired ? "pill info" : "pill neutral"}>
          {row.serialRequired ? "Required" : "Not required"}
        </span>
      ),
    },
    {
      key: "defaultUnitCost",
      header: "Default Unit Cost",
      render: (row) => formatCurrency(row.defaultUnitCost),
    },
    createActiveStatusColumn(),
    createActionColumn(onEdit, canManage, "Product"),
  ];
}

function ProductsPage() {
  return (
    <MasterDataPage
      title="Products"
      description="Maintain the product catalogue purchasing depends on, including SKU identity, serial handling rules, and the unit cost baseline used when new orders are raised."
      singularLabel="Product"
      pluralLabel="Products"
      endpoint="/products"
      emptyMessage="No products match the current search and filter selection."
      searchPlaceholder="Search SKU, name, category, or description"
      fields={fields}
      createEmptyRecord={createEmptyRecord}
      validateRecord={validateRecord}
      getColumns={getColumns}
    />
  );
}

export default ProductsPage;

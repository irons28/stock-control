import MasterDataPage, {
  createActionColumn,
  createActiveStatusColumn,
} from "../components/MasterDataPage";
import StatusPill from "../components/StatusPill";

const fields = [
  { name: "supplierCode", label: "Supplier code", required: true, placeholder: "SUP-1001" },
  { name: "name", label: "Supplier name", required: true, placeholder: "Nexus Components Ltd" },
  { name: "contactName", label: "Contact name", placeholder: "Priya Shah" },
  { name: "email", label: "Email", type: "email", placeholder: "buyer@supplier.example" },
  { name: "phone", label: "Phone", placeholder: "+44 20 1234 5678" },
  { name: "address", label: "Address", type: "textarea", fullWidth: true, rows: 3, placeholder: "Units 4-5, Wharf Estate, Bristol" },
  { name: "notes", label: "Notes", type: "textarea", fullWidth: true, rows: 4, placeholder: "Preferred order cut-off, SLA notes, account references..." },
  { name: "active", label: "Active supplier", type: "toggle", onLabel: "Visible in purchasing flows", offLabel: "Hidden from purchasing flows" },
];

function createEmptyRecord() {
  return {
    supplierCode: "",
    name: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    active: true,
  };
}

function validateRecord(record) {
  const errors = {};

  if (!record.supplierCode.trim()) {
    errors.supplierCode = "Supplier code is required.";
  }

  if (!record.name.trim()) {
    errors.name = "Supplier name is required.";
  }

  if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
    errors.email = "Enter a valid email address.";
  }

  return errors;
}

function getColumns({ canManage, onEdit }) {
  return [
    {
      key: "supplierCode",
      header: "Code",
      render: (row) => (
        <div className="master-data-primary-cell">
          <strong>{row.supplierCode}</strong>
          <span>{row.contactName || "No contact set"}</span>
        </div>
      ),
    },
    {
      key: "name",
      header: "Supplier",
      render: (row) => (
        <div className="master-data-primary-cell">
          <strong>{row.name}</strong>
          <span>{row.email || row.phone || "No contact channels on file"}</span>
        </div>
      ),
    },
    {
      key: "address",
      header: "Address",
      render: (row) => row.address || "—",
    },
    {
      key: "notes",
      header: "Notes",
      render: (row) =>
        row.notes ? <span className="master-data-notes-preview">{row.notes}</span> : <StatusPill value="No notes" subtle />,
    },
    createActiveStatusColumn(),
    createActionColumn(onEdit, canManage, "Supplier"),
  ];
}

function SuppliersPage() {
  return (
    <MasterDataPage
      title="Suppliers"
      description="Build and maintain the supplier directory your purchasing team needs before raising purchase orders, with clear contact details and active buying controls."
      singularLabel="Supplier"
      pluralLabel="Suppliers"
      endpoint="/suppliers"
      emptyMessage="No suppliers match the current search and filter selection."
      searchPlaceholder="Search supplier code, name, contact, email, phone, or notes"
      fields={fields}
      createEmptyRecord={createEmptyRecord}
      validateRecord={validateRecord}
      getColumns={getColumns}
    />
  );
}

export default SuppliersPage;

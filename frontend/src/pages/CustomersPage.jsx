import MasterDataPage, {
  createActionColumn,
  createActiveStatusColumn,
} from "../components/MasterDataPage";

const fields = [
  { name: "name", label: "Customer name", required: true, placeholder: "Acme Stores Ltd" },
  { name: "contactName", label: "Contact name", placeholder: "Jordan Smith" },
  { name: "email", label: "Email", type: "email", placeholder: "ops@customer.example" },
  { name: "phone", label: "Phone", placeholder: "+44 20 1234 5678" },
  { name: "active", label: "Active customer", type: "toggle", onLabel: "Available for new sales orders", offLabel: "Hidden from new sales activity" },
];

function createEmptyRecord() {
  return {
    name: "",
    contactName: "",
    email: "",
    phone: "",
    active: true,
  };
}

function validateRecord(record) {
  const errors = {};

  if (!record.name.trim()) {
    errors.name = "Customer name is required.";
  }

  if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
    errors.email = "Enter a valid email address.";
  }

  return errors;
}

function getColumns({ canManage, onEdit }) {
  return [
    {
      key: "code",
      header: "Code",
      render: (row) => row.code || "—",
    },
    {
      key: "name",
      header: "Customer",
      render: (row) => (
        <div className="master-data-primary-cell">
          <strong>{row.name}</strong>
          <span>{row.contactName || "No contact set"}</span>
        </div>
      ),
    },
    {
      key: "email",
      header: "Contact",
      render: (row) => row.email || row.phone || "No contact details",
    },
    createActiveStatusColumn(),
    createActionColumn(onEdit, canManage, "Customer"),
  ];
}

function CustomersPage() {
  return (
    <MasterDataPage
      title="Customers"
      description="Maintain customer accounts used by sales order entry, allocation, and dispatch planning."
      singularLabel="Customer"
      pluralLabel="Customers"
      endpoint="/customers"
      emptyMessage="No customers match the current search and filter selection."
      searchPlaceholder="Search customer code, name, contact, email, or phone"
      fields={fields}
      createEmptyRecord={createEmptyRecord}
      validateRecord={validateRecord}
      getColumns={getColumns}
    />
  );
}

export default CustomersPage;

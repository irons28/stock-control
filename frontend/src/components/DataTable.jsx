import Button from "./Button";

function DataTable({
  columns,
  rows,
  loading,
  error,
  emptyMessage,
  onRetry,
  getRowKey,
}) {
  if (loading) {
    return (
      <div className="table-state">
        <strong>Loading data</strong>
        <p>Fetching live records from the API.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="table-state error">
        <strong>Unable to load data</strong>
        <p>{error}</p>
        {onRetry ? (
          <div className="table-state-actions">
            <Button variant="secondary" onClick={onRetry}>
              Try Again
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="table-state">
        <strong>No records found</strong>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={getRowKey ? getRowKey(row, rowIndex) : row.id || rowIndex}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : row[column.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;

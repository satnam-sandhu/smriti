interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function Pagination({
  page,
  pageSize,
  total,
  pageSizeOptions = [10, 25, 50],
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div className="pagination">
      <div className="pagination-meta">
        <span>
          {total === 0
            ? "No rows"
            : `${start}-${end} of ${total}`}
        </span>
        <label className="pagination-size">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn btn-ghost pagination-btn"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
        >
          First
        </button>
        <button
          type="button"
          className="btn btn-ghost pagination-btn"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          Prev
        </button>
        <span className="pagination-page">
          Page {safePage} of {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-ghost pagination-btn"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </button>
        <button
          type="button"
          className="btn btn-ghost pagination-btn"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          Last
        </button>
      </div>
    </div>
  );
}

export type PagingProps = {
  total: number;
  page: number;
  pageSize: number;
  onChange: (page: number) => void;
};

export default function Paging({ total, page, pageSize, onChange }: PagingProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  const nums: number[] = [];
  for (let i = start; i <= end; i++) nums.push(i);

  return (
    <div className="paging">
      <button className="paging-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>
        ← Trước
      </button>

      <div className="paging-pages">
        {nums.map((n) => (
          <button
            key={n}
            className={`paging-num ${n === page ? "active" : ""}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
        {end < pages && <span className="paging-ellipsis">…</span>}
        {pages > 1 && (
          <button className="paging-num" onClick={() => onChange(pages)}>
            {pages}
          </button>
        )}
      </div>

      <div className="paging-right">
        <span>Trang</span>
        <span className="paging-select">{page}</span>
        <span>/</span>
        <span>{pages}</span>
        <button className="paging-btn" disabled={page === pages} onClick={() => onChange(page + 1)}>
          Sau →
        </button>
      </div>
    </div>
  );
}

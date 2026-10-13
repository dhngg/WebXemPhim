import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../lib/health-api';

export function HealthStatus() {
  const query = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => getHealth(signal) });

  return (
    <section className="health-panel" id="system-status" aria-labelledby="health-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">KẾT NỐI</span>
          <h2 id="health-heading">Trạng thái hệ thống</h2>
        </div>
        <span className="small-label">LIVE CHECK</span>
      </div>
      {query.isPending ? (
        <div className="health-message" role="status">
          <span className="loading-dot" /> Đang kiểm tra kết nối API…
        </div>
      ) : query.isError ? (
        <div className="health-error" role="alert">
          <div>
            <strong>Chưa kết nối được API</strong>
            <p>Hãy kiểm tra dịch vụ backend rồi thử lại.</p>
          </div>
          <button
            className="button-secondary"
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? 'Đang thử lại…' : 'Thử lại'}
          </button>
        </div>
      ) : (
        <div className="health-success" role="status">
          <span className="health-icon" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>API đang hoạt động</strong>
            <p>Kết nối với dịch vụ {query.data.service} thành công.</p>
          </div>
          <span className="success-pill">Đã kết nối</span>
        </div>
      )}
      <div className="panel-footnote">
        Kiểm tra kết nối dịch vụ; dữ liệu nhà cho thuê sẽ được bổ sung ở các giai đoạn tiếp theo.
      </div>
    </section>
  );
}

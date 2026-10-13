import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="not-found">
      <span className="eyebrow">404 · KHÔNG TÌM THẤY</span>
      <h1>Trang này chưa có ở đây.</h1>
      <p>Hãy quay về tổng quan để tiếp tục.</p>
      <Link className="button-primary" to="/">
        Về trang chủ <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}

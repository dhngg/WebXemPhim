import { Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Brand({ subtitle, to = '/' }: { subtitle?: string; to?: string }) {
  return (
    <Link to={to} className="brand" aria-label="Rental Platform – về trang chủ">
      <span className="brand__logo">
        <Home size={18} aria-hidden="true" />
      </span>
      <span>
        <span className="brand__name">Rental Platform</span>
        {subtitle && <span className="brand__sub">{subtitle}</span>}
      </span>
    </Link>
  );
}

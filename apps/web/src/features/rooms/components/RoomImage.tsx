import { useState } from 'react';
import { ImageOff } from 'lucide-react';

/** Ảnh phòng có fallback khi lỗi tải (ảnh mock lấy từ CDN bên ngoài). */
export function RoomImage({ src, alt, loading = 'lazy' }: { src?: string; alt: string; loading?: 'lazy' | 'eager' }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="img-fallback" role="img" aria-label={alt}>
        <ImageOff size={28} aria-hidden="true" />
      </div>
    );
  }
  return <img src={src} alt={alt} loading={loading} onError={() => setFailed(true)} />;
}

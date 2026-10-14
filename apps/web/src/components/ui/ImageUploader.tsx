import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_MB = 5;

export function validateImageFile(file: File, maxMb = MAX_IMAGE_MB): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return `"${file.name}" không đúng định dạng (chỉ JPG, PNG, WEBP).`;
  if (file.size > maxMb * 1024 * 1024) return `"${file.name}" vượt quá ${maxMb}MB.`;
  return null;
}

/**
 * Chọn ảnh + xem trước. Ảnh chỉ tồn tại cục bộ dạng object URL —
 * CHƯA upload lên object storage (chờ backend chốt cơ chế upload).
 * `value` là danh sách URL (ảnh có sẵn hoặc object URL mới chọn).
 */
export function ImageUploader({
  value,
  onChange,
  max = 8,
  label = 'Ảnh',
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const created = useRef<string[]>([]);

  useEffect(
    () => () => {
      created.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const nextErrors: string[] = [];
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const err = validateImageFile(file);
      if (err) nextErrors.push(err);
      else if (value.length + urls.length < max) {
        const url = URL.createObjectURL(file);
        created.current.push(url);
        urls.push(url);
      } else nextErrors.push(`Tối đa ${max} ảnh.`);
    }
    setErrors([...new Set(nextErrors)]);
    if (urls.length) onChange([...value, ...urls]);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="uploader">
        {value.map((url, i) => (
          <div key={url} className="uploader__item">
            <img src={url} alt={`Ảnh ${i + 1}`} />
            <button
              type="button"
              className="uploader__remove"
              aria-label={`Xóa ảnh ${i + 1}`}
              onClick={() => onChange(value.filter((u) => u !== url))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {value.length < max && (
          <label htmlFor={inputId} className="uploader__add">
            <ImagePlus size={22} aria-hidden="true" />
            <span>Thêm ảnh</span>
          </label>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      <span className="field__hint">
        JPG/PNG/WEBP, tối đa {MAX_IMAGE_MB}MB/ảnh, {max} ảnh. Ảnh chỉ xem trước cục bộ — chưa upload (chờ API).
      </span>
      {errors.map((e) => (
        <span key={e} className="field__error" role="alert">
          {e}
        </span>
      ))}
    </div>
  );
}

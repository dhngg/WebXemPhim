import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ApiError } from '@/services/http/ApiError';
import { CurrencyInput } from './Inputs';
import { DataTable } from './DataTable';
import { ErrorState } from './States';
import { FormField } from './FormField';
import { StatusBadge } from './StatusBadge';

describe('UI components', () => {
  it('FormField gắn label + aria-invalid + thông báo lỗi', () => {
    render(
      <FormField label="Họ tên" required error="Bắt buộc">
        <input />
      </FormField>,
    );
    const input = screen.getByLabelText(/Họ tên/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Bắt buộc');
  });

  it('StatusBadge luôn hiển thị chữ (không chỉ màu)', () => {
    render(<StatusBadge status="OVERDUE" map={{ OVERDUE: { label: 'Quá hạn', tone: 'danger' } }} />);
    expect(screen.getByText('Quá hạn')).toBeInTheDocument();
  });

  it('ErrorState: 403 không có nút thử lại; 500 có', async () => {
    const retry = vi.fn();
    const { rerender } = render(<ErrorState error={new ApiError({ statusCode: 403, message: 'cấm' })} onRetry={retry} />);
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    rerender(<ErrorState error={new ApiError({ statusCode: 500, message: 'lỗi' })} onRetry={retry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalled();
  });

  it('DataTable hiển thị empty state khi không có dữ liệu', () => {
    render(<DataTable columns={[{ key: 'a', header: 'A', render: () => 'x' }]} rows={[]} rowKey={() => 'k'} />);
    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
  });

  it('CurrencyInput định dạng hàng nghìn và trả về số', async () => {
    function Wrapper() {
      const [v, setV] = useState<number | undefined>();
      return (
        <>
          <CurrencyInput aria-label="Tiền" value={v} onChange={setV} />
          <output>{v ?? ''}</output>
        </>
      );
    }
    render(<Wrapper />);
    await userEvent.type(screen.getByLabelText('Tiền'), '3500000');
    expect(screen.getByLabelText('Tiền')).toHaveValue('3.500.000');
    expect(screen.getByText('3500000')).toBeInTheDocument();
  });
});

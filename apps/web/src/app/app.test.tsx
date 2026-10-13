import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from './app';
import { getHealth } from '../lib/health-api';

vi.mock('../lib/health-api', () => ({ getHealth: vi.fn() }));
const mockedHealth = vi.mocked(getHealth);

function renderApp(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('foundation app', () => {
  it('shows the home placeholder and live health result', async () => {
    mockedHealth.mockResolvedValue({
      status: 'ok',
      service: 'rental-api',
      timestamp: '2026-10-13T00:00:00.000Z',
    });
    renderApp();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Không gian cho một khởi đầu mới.',
    );
    expect(await screen.findByText('API đang hoạt động')).toBeInTheDocument();
    expect(screen.getAllByText('Sắp phát triển')).toHaveLength(3);
  });

  it('exposes a loading state accessibly', () => {
    mockedHealth.mockReturnValue(new Promise(() => {}));
    renderApp();
    expect(screen.getByRole('status')).toHaveTextContent('Đang kiểm tra kết nối API');
  });

  it('allows recovery from a network failure', async () => {
    mockedHealth.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce({
      status: 'ok',
      service: 'rental-api',
      timestamp: '2026-10-13T00:00:00.000Z',
    });
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa kết nối được API');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('API đang hoạt động')).toBeInTheDocument();
  });

  it('renders unknown routes and navigates back home', async () => {
    mockedHealth.mockResolvedValue({
      status: 'ok',
      service: 'rental-api',
      timestamp: '2026-10-13T00:00:00.000Z',
    });
    renderApp('/unknown-route');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Trang này chưa có ở đây.');
    await userEvent.click(screen.getByRole('link', { name: /Về trang chủ/ }));
    expect(await screen.findByText('API đang hoạt động')).toBeInTheDocument();
  });
});

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning';

/** Form giả: `dirty` = có thay đổi chưa lưu; "Lưu" gọi markSaved() rồi điều hướng như các form thật. */
function FormPage({ initiallyDirty = true }: { initiallyDirty?: boolean }) {
  const [dirty, setDirty] = useState(initiallyDirty);
  const unsaved = useUnsavedChangesWarning(dirty);
  const navigate = useNavigate();
  return (
    <div>
      <h1>form</h1>
      <button onClick={() => setDirty(true)}>edit</button>
      <button
        onClick={() => {
          unsaved.markSaved();
          navigate('/done');
        }}
      >
        save
      </button>
      <button onClick={() => navigate('/done')}>leave</button>
    </div>
  );
}

function setup(initiallyDirty = true) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <FormPage initiallyDirty={initiallyDirty} /> },
      { path: '/done', element: <h1>done</h1> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => vi.restoreAllMocks());

describe('useUnsavedChangesWarning', () => {
  it('does NOT warn after a successful save (markSaved before navigate)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const router = setup();
    await userEvent.click(screen.getByText('save'));
    expect(await screen.findByText('done')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/done');
  });

  it('still warns when leaving with unsaved changes, and stays if the user declines', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const router = setup();
    await userEvent.click(screen.getByText('leave'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByText('form')).toBeInTheDocument();
  });

  it('leaves when the user confirms the warning', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup();
    await userEvent.click(screen.getByText('leave'));
    expect(await screen.findByText('done')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('does not warn when nothing is dirty', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup(false);
    await userEvent.click(screen.getByText('leave'));
    expect(await screen.findByText('done')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('re-arms the warning when the user edits again after a save was marked', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const router = setup(false);
    // đã "lưu" nhưng vẫn ở lại trang rồi sửa tiếp: phải cảnh báo trở lại
    await userEvent.click(screen.getByText('edit'));
    await userEvent.click(screen.getByText('leave'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/');
  });
});

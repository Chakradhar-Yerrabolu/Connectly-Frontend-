import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, ThemeProvider, ToastProvider } from '../providers';
import { AuthScreen } from './AuthScreen';

function renderAuth() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AuthScreen />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthScreen', () => {
  it('submits login credentials and reports success', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accessToken: 'access-token', user: { id: 'u1', username: 'alex', displayName: 'Alex Rivera' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAuth();

    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'alex');
    await user.type(screen.getByLabelText('Password'), 'Connectly123!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/auth/login');
    expect(JSON.parse(String(init?.body))).toMatchObject({ username: 'alex', password: 'Connectly123!' });
    expect(await screen.findByText('Signed in')).toBeInTheDocument();
    expect(await screen.findByText(/Welcome back, Alex Rivera/)).toBeInTheDocument();
  });

  it('switches to registration and shows the required profile fields', async () => {
    const user = userEvent.setup();
    renderAuth();

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create an account' }));

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Display name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Email/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '10');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});

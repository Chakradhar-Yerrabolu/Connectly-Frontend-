import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, ToastProvider, useTheme, useToast } from './providers';
import { ThemeSelector } from './components/ui';

function ThemeProbe() {
  const { theme } = useTheme();
  return <output data-testid="current-theme">{theme}</output>;
}

function ToastHarness() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.success('Profile saved.', 'profile-saved', 'Saved')}>
        Add success
      </button>
      <button type="button" onClick={() => toast.error('Could not connect.', 'connection-error')}>
        Add error
      </button>
    </>
  );
}

describe('theme provider', () => {
  it('applies and persists a selected theme', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeSelector />
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('current-theme')).toHaveTextContent('light'));
    await user.click(screen.getByRole('radio', { name: /github/i }));

    expect(screen.getByTestId('current-theme')).toHaveTextContent('github');
    expect(window.localStorage.getItem('connectly-theme')).toBe('github');
    expect(document.documentElement.dataset.theme).toBe('github');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    await user.click(screen.getByRole('radio', { name: /light/i }));
    expect(window.localStorage.getItem('connectly-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('restores a saved theme on mount', async () => {
    window.localStorage.setItem('connectly-theme', 'dark');
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('current-theme')).toHaveTextContent('dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('toast provider', () => {
  it('shows, de-duplicates and dismisses notifications', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Add success' }));
    expect(screen.getByText('Profile saved.')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add success' }));
    expect(screen.getAllByText('Profile saved.')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Add error' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not connect.');

    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss notification' });
    await user.click(dismissButtons[dismissButtons.length - 1]);
    await waitFor(() => expect(screen.queryByText('Could not connect.')).not.toBeInTheDocument());
    expect(screen.getByText('Profile saved.')).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest, beforeEach */
import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { Button, buttonClassName } from '@app/ui/components/ui/button';
import { showSuccessWithAction, showWarning } from '@app/ui';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() },
}));

describe('Button asChild', () => {
  it('renders the child element with the button look, so a navigating action stays a real link', () => {
    render(
      <Button asChild variant="outline" size="sm">
        <a href="/settings">Settings</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Settings' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/settings');
    expect(screen.queryByRole('button')).toBeNull();
    for (const cls of buttonClassName('outline', 'sm').split(' ')) {
      expect(link.className).toContain(cls);
    }
  });

  it('is still a button without asChild, and loading disables it', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('toast helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('showSuccessWithAction offers one action that runs the handler', () => {
    const undo = jest.fn();
    showSuccessWithAction('Archived', 'Undo', undo);
    expect(toast.success).toHaveBeenCalledTimes(1);
    const [message, options] = (toast.success as jest.Mock).mock.calls[0];
    expect(message).toBe('Archived');
    expect(options.action.label).toBe('Undo');
    options.action.onClick();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('showWarning is a warning toast, never a success or an error', () => {
    showWarning('Saved', 'Two rows were skipped.');
    expect(toast.warning).toHaveBeenCalledWith(
      'Saved',
      expect.objectContaining({ description: 'Two rows were skipped.' }),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

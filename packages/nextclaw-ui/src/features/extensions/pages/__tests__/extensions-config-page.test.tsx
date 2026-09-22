import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ExtensionsConfigPage } from '@/features/extensions/pages/extensions-config-page';

vi.mock('@/features/extensions/hooks/use-extensions', () => ({
  useExtensions: () => ({
    data: {
      extensions: [{
        id: 'nextclaw-world-extension',
        name: 'NextClaw World Extension',
        version: '1.2.0',
        state: 'running',
        leaseCount: 1,
        observations: { context: true, events: true },
        channels: [{ id: 'world', name: 'World channel' }],
      }],
      counts: { total: 1, running: 1, withObservations: 1, withChannels: 1 },
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

it('shows branded extension metadata with runtime and capability information', () => {
  render(<ExtensionsConfigPage />);

  expect(screen.getByText('Extension Management')).toBeTruthy();
  expect(screen.getByText('上海移动西格玛 World Extension')).toBeTruthy();
  expect(screen.queryByText('nextclaw-world-extension')).toBeNull();
  expect(screen.getByText('Continuous-attention capabilities')).toBeTruthy();
  expect(screen.getByText('State · Events')).toBeTruthy();
  expect(screen.getByText('World channel')).toBeTruthy();
});

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { clearRegistry, registerDataSource } from '@gonogo/core';
import type { DataSource, DataSourceStatus } from '@gonogo/core';
import { DataSourceStatusComponent } from './index';

function makeFixtureSource(
  id: string,
  name: string,
): DataSource & { simulateStatusChange: (s: DataSourceStatus) => void } {
  const listeners = new Set<(s: DataSourceStatus) => void>();
  const source = {
    id,
    name,
    status: 'disconnected' as DataSourceStatus,
    connect: async () => {},
    disconnect: () => {},
    schema: () => [],
    subscribe: () => () => {},
    onStatusChange(cb: (s: DataSourceStatus) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    simulateStatusChange(s: DataSourceStatus) {
      source.status = s;
      listeners.forEach((cb) => cb(s));
    },
  };
  return source;
}

beforeEach(() => {
  clearRegistry();
});

describe('DataSourceStatus', () => {
  it('shows empty state when no sources are registered', () => {
    render(<DataSourceStatusComponent />);
    expect(screen.getByText('No data sources registered')).toBeInTheDocument();
  });

  it('renders each registered source by name', () => {
    registerDataSource(makeFixtureSource('telemachus', 'Telemachus Reborn'));
    registerDataSource(makeFixtureSource('kos', 'kOS'));

    render(<DataSourceStatusComponent />);

    expect(screen.getByText('Telemachus Reborn')).toBeInTheDocument();
    expect(screen.getByText('kOS')).toBeInTheDocument();
  });

  it('displays the status label for each source', () => {
    registerDataSource(makeFixtureSource('telemachus', 'Telemachus Reborn'));

    render(<DataSourceStatusComponent />);

    expect(screen.getByText('disconnected')).toBeInTheDocument();
  });

  it('updates the status label when a source status changes', () => {
    const source = makeFixtureSource('telemachus', 'Telemachus Reborn');
    registerDataSource(source);

    render(<DataSourceStatusComponent />);
    expect(screen.getByText('disconnected')).toBeInTheDocument();

    act(() => source.simulateStatusChange('connected'));

    expect(screen.getByText('connected')).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { clearRegistry, registerDataSource } from '@gonogo/core';
import type { DataSource, DataSourceStatus, ConfigField } from '@gonogo/core';
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
    execute: async () => {},
    configSchema: () => [],
    getConfig: () => ({}),
    configure: () => {},
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

function makeConfigurableSource() {
  const listeners = new Set<(s: DataSourceStatus) => void>();
  const configureSpy = vi.fn();
  const source: DataSource = {
    id: 'test-source',
    name: 'Test Source',
    status: 'disconnected' as DataSourceStatus,
    connect: async () => {},
    disconnect: () => {},
    schema: () => [],
    subscribe: () => () => {},
    execute: async () => {},
    configSchema: (): ConfigField[] => [
      { key: 'host', label: 'Host', type: 'text', placeholder: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', placeholder: '8085' },
    ],
    getConfig: () => ({ host: 'myhost', port: 9000 }),
    configure: configureSpy,
    onStatusChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return { source, configureSpy };
}

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

describe('DataSourceStatus config form', () => {
  it('shows config button when source has configSchema fields', () => {
    const { source } = makeConfigurableSource();
    registerDataSource(source);
    render(<DataSourceStatusComponent />);
    expect(screen.getByRole('button', { name: /configure test source/i })).toBeInTheDocument();
  });

  it('does not show config button when configSchema is empty', () => {
    registerDataSource(makeFixtureSource('no-config', 'No Config Source'));
    render(<DataSourceStatusComponent />);
    expect(screen.queryByRole('button', { name: /configure/i })).not.toBeInTheDocument();
  });

  it('opens config form when config button is clicked', () => {
    const { source } = makeConfigurableSource();
    registerDataSource(source);
    render(<DataSourceStatusComponent />);
    fireEvent.click(screen.getByRole('button', { name: /configure test source/i }));
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('pre-fills inputs with current values from getConfig()', () => {
    const { source } = makeConfigurableSource();
    registerDataSource(source);
    render(<DataSourceStatusComponent />);
    fireEvent.click(screen.getByRole('button', { name: /configure test source/i }));
    expect(screen.getByLabelText('Host')).toHaveValue('myhost');
    expect(screen.getByLabelText('Port')).toHaveValue(9000);
  });

  it('calls configure() with updated values on save', () => {
    const { source, configureSpy } = makeConfigurableSource();
    registerDataSource(source);
    render(<DataSourceStatusComponent />);
    fireEvent.click(screen.getByRole('button', { name: /configure test source/i }));
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '7777' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(configureSpy).toHaveBeenCalledWith({ host: 'myhost', port: 7777 });
  });

  it('closes form after saving', () => {
    const { source } = makeConfigurableSource();
    registerDataSource(source);
    render(<DataSourceStatusComponent />);
    fireEvent.click(screen.getByRole('button', { name: /configure test source/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('closes form on cancel without calling configure()', () => {
    const { source, configureSpy } = makeConfigurableSource();
    registerDataSource(source);
    render(<DataSourceStatusComponent />);
    fireEvent.click(screen.getByRole('button', { name: /configure test source/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(configureSpy).not.toHaveBeenCalled();
  });

  it('clicking config button again closes the form', () => {
    const { source } = makeConfigurableSource();
    registerDataSource(source);
    render(<DataSourceStatusComponent />);
    fireEvent.click(screen.getByRole('button', { name: /configure test source/i }));
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /configure test source/i }));
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });
});

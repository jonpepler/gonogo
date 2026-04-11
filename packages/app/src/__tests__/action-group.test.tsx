import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse, ws } from 'msw';
import { clearRegistry, registerDataSource } from '@gonogo/core';
import { ActionGroupComponent } from '@gonogo/components';
import { telemachusSource } from '../dataSources/telemachus';

const telemachusWs = ws.link('ws://localhost:8085/datalink');
const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  cleanup(); // unmount before disconnect to avoid out-of-act state updates
  server.resetHandlers();
  telemachusSource.disconnect();
});
afterAll(() => server.close());

beforeEach(() => {
  clearRegistry();
  registerDataSource(telemachusSource);
});

/**
 * Sets up MSW to accept the WebSocket connection and handle HTTP datalink requests.
 * The `state` object is mutated by toggle requests so tests can assert on it.
 */
function setupTelemachus(initialState: Record<string, boolean> = {}) {
  const state = { ...initialState };

  server.use(
    telemachusWs.addEventListener('connection', () => {}),
    http.get('http://localhost:8085/telemachus/datalink', ({ request }) => {
      const params = new URL(request.url).searchParams;
      const valueKey = params.get('v');
      const actionKey = params.get('a');

      if (valueKey !== null) {
        return HttpResponse.json({ v: state[valueKey] ?? false });
      }
      if (actionKey !== null) {
        // Telemachus action keys are like 'f.ag1' — map to the corresponding value key
        const valueEquiv = actionKey.replace('f.', 'v.') + 'Value';
        state[valueEquiv] = !state[valueEquiv];
        return HttpResponse.json({ a: null });
      }
      return new HttpResponse(null, { status: 404 });
    }),
  );

  return state;
}

describe('ActionGroup component', () => {
  it('shows placeholder when no action group is configured', () => {
    render(<ActionGroupComponent />);
    expect(screen.getByText('No action group configured')).toBeInTheDocument();
  });

  it('shows group name and OFF state on initial connect', async () => {
    setupTelemachus({ 'v.ag1Value': false });
    await telemachusSource.connect();
    render(<ActionGroupComponent config={{ actionGroupId: 'AG1' }} />);

    await waitFor(() => expect(screen.getByText('AG1')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('OFF')).toBeInTheDocument());
  });

  it('shows ON when the action group is already active', async () => {
    setupTelemachus({ 'v.ag1Value': true });
    await telemachusSource.connect();
    render(<ActionGroupComponent config={{ actionGroupId: 'AG1' }} />);

    await waitFor(() => expect(screen.getByText('ON')).toBeInTheDocument());
  });

  it('sends a toggle request and reflects the updated state', async () => {
    setupTelemachus({ 'v.ag1Value': false });
    await telemachusSource.connect();
    render(<ActionGroupComponent config={{ actionGroupId: 'AG1' }} />);

    await waitFor(() => expect(screen.getByText('OFF')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /toggle ag1/i }));

    await waitFor(() => expect(screen.getByText('ON')).toBeInTheDocument());
  });

  it('shows no toggle button for a read-only group (Precision Control)', async () => {
    setupTelemachus({ 'v.precisionControlValue': false });
    await telemachusSource.connect();
    render(<ActionGroupComponent config={{ actionGroupId: 'Precision Control' }} />);

    await waitFor(() => expect(screen.getByText('Precision Control')).toBeInTheDocument());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('toggles SAS independently from AG1', async () => {
    setupTelemachus({ 'v.sasValue': false });
    await telemachusSource.connect();
    render(<ActionGroupComponent config={{ actionGroupId: 'SAS' }} />);

    await waitFor(() => expect(screen.getByText('OFF')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /toggle sas/i }));

    await waitFor(() => expect(screen.getByText('ON')).toBeInTheDocument());
  });
});

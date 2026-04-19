import { getDataSource } from "@gonogo/core";
import { useEffect, useState } from "react";
import styled from "styled-components";
import type { BufferedDataSource } from "../BufferedDataSource";
import { useFlight } from "../hooks/useFlight";
import type { FlightRecord } from "../types";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

function formatDuration(launchedAt: number, lastSampleAt: number): string {
  const s = Math.floor((lastSampleAt - launchedAt) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min}m`;
}

function getSource(): BufferedDataSource | undefined {
  return getDataSource("data") as BufferedDataSource | undefined;
}

export function FlightsManager() {
  const currentFlight = useFlight();
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const reload = async () => {
    const src = getSource();
    if (!src) return;
    const list = await src.listFlights();
    setFlights(list.sort((a, b) => b.launchedAt - a.launchedAt));
  };

  useEffect(() => {
    void reload();
  }, [currentFlight]);

  const handleDelete = async (id: string) => {
    const src = getSource();
    if (!src) return;
    await src.deleteFlight(id);
    setConfirmDeleteId(null);
    await reload();
  };

  const handleClearAll = async () => {
    const src = getSource();
    if (!src) return;
    await src.clearAllFlights();
    setConfirmClearAll(false);
    await reload();
  };

  if (flights.length === 0) {
    return <EmptyState>No flight history recorded yet.</EmptyState>;
  }

  return (
    <Container>
      <Table>
        <thead>
          <tr>
            <Th>Vessel</Th>
            <Th>Launched</Th>
            <Th>Duration</Th>
            <Th>Samples</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {flights.map((f) => {
            const isCurrent = f.id === currentFlight?.id;
            return (
              <Tr key={f.id} $current={isCurrent}>
                <Td>
                  {f.vesselName || "—"}
                  {isCurrent && <CurrentBadge>current</CurrentBadge>}
                </Td>
                <Td>{formatDate(f.launchedAt)}</Td>
                <Td>{formatDuration(f.launchedAt, f.lastSampleAt)}</Td>
                <Td>{f.sampleCount.toLocaleString()}</Td>
                <Td>
                  {confirmDeleteId === f.id ? (
                    <ConfirmRow>
                      <DangerButton onClick={() => void handleDelete(f.id)}>
                        Delete
                      </DangerButton>
                      <CancelButton onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </CancelButton>
                    </ConfirmRow>
                  ) : (
                    <DeleteButton onClick={() => setConfirmDeleteId(f.id)}>
                      ×
                    </DeleteButton>
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <Footer>
        {confirmClearAll ? (
          <ConfirmRow>
            <span style={{ fontSize: 12, color: "#888" }}>
              Delete all flight history?
            </span>
            <DangerButton onClick={() => void handleClearAll()}>
              Clear all
            </DangerButton>
            <CancelButton onClick={() => setConfirmClearAll(false)}>
              Cancel
            </CancelButton>
          </ConfirmRow>
        ) : (
          <ClearAllButton onClick={() => setConfirmClearAll(true)}>
            Clear all
          </ClearAllButton>
        )}
      </Footer>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 500px;
  max-height: 60vh;
  overflow: hidden;
`;

const Table = styled.table`
  border-collapse: collapse;
  width: 100%;
  overflow-y: auto;
  font-size: 12px;
  font-family: monospace;
`;

const Th = styled.th`
  text-align: left;
  padding: 6px 8px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #555;
  border-bottom: 1px solid #222;
`;

const Tr = styled.tr<{ $current: boolean; }>`
  background: ${({ $current }) => ($current ? "#1a2a1a" : "transparent")};
  &:hover { background: #1e1e1e; }
`;

const Td = styled.td`
  padding: 7px 8px;
  color: #ccc;
  border-bottom: 1px solid #1a1a1a;
  white-space: nowrap;
`;

const CurrentBadge = styled.span`
  display: inline-block;
  margin-left: 6px;
  font-size: 9px;
  padding: 1px 5px;
  background: #1e3a1e;
  border: 1px solid #2a5a2a;
  border-radius: 8px;
  color: #4c4;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const DeleteButton = styled.button`
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  &:hover { color: #f44; }
`;

const ConfirmRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const DangerButton = styled.button`
  background: #2a1010;
  border: 1px solid #5a1a1a;
  color: #f88;
  cursor: pointer;
  font-size: 11px;
  font-family: monospace;
  padding: 3px 8px;
  border-radius: 2px;
  &:hover { background: #3a1515; }
`;

const CancelButton = styled.button`
  background: none;
  border: 1px solid #333;
  color: #888;
  cursor: pointer;
  font-size: 11px;
  font-family: monospace;
  padding: 3px 8px;
  border-radius: 2px;
  &:hover { color: #ccc; }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 10px 8px 4px;
  border-top: 1px solid #222;
`;

const ClearAllButton = styled.button`
  background: none;
  border: 1px solid #333;
  color: #666;
  cursor: pointer;
  font-size: 11px;
  font-family: monospace;
  padding: 4px 12px;
  border-radius: 2px;
  &:hover { color: #f88; border-color: #5a1a1a; }
`;

const EmptyState = styled.div`
  padding: 24px 16px;
  font-size: 12px;
  color: #555;
  font-family: monospace;
  text-align: center;
`;

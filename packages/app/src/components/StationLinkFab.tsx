import { BroadcastIcon, Fab, useModal } from "@gonogo/ui";
import { QRCodeSVG } from "qrcode.react";
import styled from "styled-components";
import { usePeerHost } from "../peer/PeerHostProvider";

/**
 * Station-link FAB — shows the host's peer ID + a QR code so a station
 * screen can be pointed at this main screen. Sits above the FlightsFab
 * at bottom: 204px and opens a modal with the link details.
 */
export function StationLinkFab() {
  const { open } = useModal();

  function handleClick() {
    open(<StationLinkPanel />, { title: "Add Station" });
  }

  return (
    <Fab
      bottom={204}
      onClick={handleClick}
      aria-label="Add station"
      title="Add station"
    >
      <BroadcastIcon />
    </Fab>
  );
}

function StationLinkPanel() {
  const { peerId } = usePeerHost();

  if (!peerId) {
    return <Empty>Connecting to peer network…</Empty>;
  }

  return (
    <Wrap>
      <Row>
        <Label>Host ID</Label>
        <Code>{peerId}</Code>
      </Row>
      <QrRow>
        <QRCodeSVG value={peerId} size={160} />
      </QrRow>
      <Hint>
        Open <code>/station</code> on another device and enter this ID, or scan
        the QR.
      </Hint>
    </Wrap>
  );
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 260px;
  color: #ccc;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const Label = styled.span`
  font-family: monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #666;
`;

const Code = styled.code`
  color: #7cf;
  font-family: monospace;
  font-size: 18px;
  letter-spacing: 0.12em;
`;

const QrRow = styled.div`
  display: flex;
  justify-content: center;
  padding: 12px;
  background: #fff;
  border-radius: 4px;
`;

const Hint = styled.p`
  margin: 0;
  font-size: 11px;
  color: #777;
  line-height: 1.5;

  code {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    padding: 1px 4px;
    border-radius: 2px;
    color: #aaa;
  }
`;

const Empty = styled.div`
  padding: 16px 0;
  font-size: 12px;
  color: #666;
  font-family: monospace;
  text-align: center;
`;

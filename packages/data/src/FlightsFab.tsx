import { HistoryIcon, useFabCluster, useModal } from "@gonogo/ui";
import styled from "styled-components";
import { FlightsManager } from "./FlightsManager";

/**
 * History FAB — stacked above the SerialFab at bottom: 144px. Opens the
 * FlightsManager modal. Hidden until the FAB cluster is active (hovered
 * or focused) so it stays out of the way during normal use.
 */
export function FlightsFab() {
  const { open } = useModal();
  const cluster = useFabCluster();
  const visible = cluster?.active ?? true;

  function handleClick() {
    open(<FlightsManager />, { title: "Flight History" });
  }

  return (
    <Fab
      $visible={visible}
      onClick={handleClick}
      onMouseEnter={cluster?.onMouseEnter}
      onMouseLeave={cluster?.onMouseLeave}
      onFocus={cluster?.onFocus}
      onBlur={cluster?.onBlur}
      aria-label="Flight history"
      title="Flight history"
      tabIndex={visible ? 0 : -1}
    >
      <HistoryIcon />
    </Fab>
  );
}

const Fab = styled.button<{ $visible: boolean }>`
  position: fixed;
  bottom: 144px;
  right: 24px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #1a1a1a;
  border: 1px solid #333;
  color: #7cf;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 900;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  pointer-events: ${({ $visible }) => ($visible ? "auto" : "none")};
  transform: translateY(${({ $visible }) => ($visible ? "0" : "16px")});
  transition:
    background 0.15s,
    transform 0.18s ease,
    opacity 0.18s ease,
    border-color 0.15s;

  &:hover {
    background: #222;
    border-color: #7cf;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.97);
  }
`;

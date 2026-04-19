import { HistoryIcon, useModal } from "@gonogo/ui";
import styled from "styled-components";
import { FlightsManager } from "./FlightsManager";

/**
 * History FAB — stacked above the SerialFab at bottom: 144px.
 * Opens the FlightsManager modal.
 */
export function FlightsFab() {
  const { open } = useModal();

  function handleClick() {
    open(<FlightsManager />, { title: "Flight History" });
  }

  return (
    <Fab
      onClick={handleClick}
      aria-label="Flight history"
      title="Flight history"
    >
      <HistoryIcon />
    </Fab>
  );
}

const Fab = styled.button`
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
  transition:
    background 0.15s,
    transform 0.1s,
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

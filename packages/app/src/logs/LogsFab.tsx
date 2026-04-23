import { DiagnosticsIcon, Fab, useModal } from "@gonogo/ui";
import { LogsManager } from "./LogsManager";

/**
 * Diagnostics FAB. Opens the logs manager — a modal for toggling
 * subsystem tags and downloading the rolling in-memory log buffer. Lives
 * in the FAB tower alongside the serial / survey / station-link buttons.
 */
export function LogsFab({ bottom = 324 }: { bottom?: number } = {}) {
  const { open } = useModal();

  function handleClick() {
    open(<LogsManager />, { title: "Diagnostics & Logs" });
  }

  return (
    <Fab
      bottom={bottom}
      onClick={handleClick}
      aria-label="Diagnostics"
      title="Diagnostics & logs"
    >
      <DiagnosticsIcon />
    </Fab>
  );
}

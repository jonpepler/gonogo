import { ScreenProvider, useScreen } from "@gonogo/core";
import { Fab, SettingsIcon, useModal } from "@gonogo/ui";
import { SettingsProvider, useSettingsService } from "./SettingsContext";
import { SettingsModal } from "./SettingsModal";

/**
 * Settings FAB — the modal portal renders outside the SettingsProvider's
 * React tree, so we capture the service here at the call site and re-wrap.
 */
export function SettingsFab({ bottom = 384 }: { bottom?: number } = {}) {
  const { open } = useModal();
  const service = useSettingsService();
  const screen = useScreen();

  function handleClick() {
    open(
      <SettingsProvider service={service}>
        <ScreenProvider value={screen}>
          <SettingsModal />
        </ScreenProvider>
      </SettingsProvider>,
      { title: "Settings" },
    );
  }

  return (
    <Fab
      bottom={bottom}
      onClick={handleClick}
      aria-label="Settings"
      title="Settings"
    >
      <SettingsIcon />
    </Fab>
  );
}

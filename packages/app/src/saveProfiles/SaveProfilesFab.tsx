import { FogMaskStoreProvider, useFogMaskStore } from "@gonogo/data";
import { Fab, SatelliteIcon, useModal } from "@gonogo/ui";
import type { ReactNode } from "react";
import {
  SaveProfileProvider,
  useSaveProfileService,
} from "./SaveProfileContext";
import { SaveProfilesManager } from "./SaveProfilesManager";

/**
 * Survey Profile FAB — stacked above the station link button. Opens the
 * manager modal for switching, creating, renaming, or deleting survey
 * profiles.
 *
 * The modal portal renders outside the SaveProfileProvider's React tree
 * (ModalProvider lives at the app root, above all the service providers),
 * so we capture the service here at the call site and re-wrap the modal
 * content with a fresh provider.
 */
/**
 * `bottom` override because the FAB cluster is a manually-stacked tower —
 * stations don't render StationLinkFab, so this slot moves up to fill
 * the gap. Defaults to 264 (on top of the StationLink slot on main).
 */
export function SaveProfilesFab({ bottom = 264 }: { bottom?: number } = {}) {
  const { open } = useModal();
  const service = useSaveProfileService();
  const fogStore = useFogMaskStore();

  function handleClick() {
    // Wrap with whichever contexts the modal uses. FogMaskStore is optional
    // — if a screen doesn't mount FogMaskCacheProvider, the manager just
    // skips fog cleanup on delete.
    const withFog = (node: ReactNode) =>
      fogStore ? (
        <FogMaskStoreProvider store={fogStore}>{node}</FogMaskStoreProvider>
      ) : (
        node
      );
    open(
      <SaveProfileProvider service={service}>
        {withFog(<SaveProfilesManager />)}
      </SaveProfileProvider>,
      { title: "Survey Profiles" },
    );
  }

  return (
    <Fab
      bottom={bottom}
      onClick={handleClick}
      aria-label="Survey profiles"
      title="Survey profiles"
    >
      <SatelliteIcon />
    </Fab>
  );
}

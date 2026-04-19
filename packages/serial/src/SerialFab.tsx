import { Fab, JoystickIcon, useModal } from "@gonogo/ui";
import {
  SerialDeviceProvider,
  useSerialDeviceService,
} from "./SerialDeviceContext";
import { SerialDevicesMenu } from "./SerialDevicesMenu";

/**
 * Joystick FAB — opens the Serial Devices management modal. Reveals
 * with the FAB cluster on hover.
 */
export function SerialFab() {
  const { open } = useModal();
  // The modal portal renders its content outside the SerialDeviceProvider's
  // React tree, so wrap the modal content with a fresh provider bound to the
  // service captured here at the call site.
  const service = useSerialDeviceService();

  function handleClick() {
    open(
      <SerialDeviceProvider service={service}>
        <SerialDevicesMenu />
      </SerialDeviceProvider>,
      { title: "Serial Devices" },
    );
  }

  return (
    <Fab
      bottom={84}
      onClick={handleClick}
      aria-label="Manage serial devices"
      title="Serial devices"
    >
      <JoystickIcon />
    </Fab>
  );
}

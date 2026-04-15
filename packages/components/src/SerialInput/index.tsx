import { registerComponent } from "@gonogo/core";
import { Panel } from "@gonogo/ui";

function SerialInput() {
  return (
    <Panel>
      <p>This is a serial input component.</p>
    </Panel>
  );
}

registerComponent({
  id: "serial-input",
  name: "Serial Input",
  description: "dev",
  tags: ["something new"],
  component: SerialInput,
});

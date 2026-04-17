import { registerComponent } from "@gonogo/core";
import { Button, Panel } from "@gonogo/ui";
import { useState } from "react";
import styled from "styled-components";
import { useSerialConnection } from "./useSerialConnection";

function SerialInput() {
  const [buttons, setButtons] = useState<Record<"a" | "b", boolean>>({
    a: false,
    b: false,
  });
  const [state, setState] = useState("");
  const { connect, write } = useSerialConnection((update) => {
    console.log(update);
    setState(update);
    setButtons({
      a: Boolean(Number(update.charAt(1))),
      b: Boolean(Number(update.charAt(3))),
    });
  });
  const [value, setValue] = useState(0);

  const writeToSerial = () => {
    write("hello, world!");
  };

  return (
    <Panel>
      <Text>This is a serial input component.</Text>
      <Button onClick={connect}>Connect</Button>
      <Button onClick={writeToSerial}>Test</Button>
      <Button onClick={() => setValue((v) => v + 1)}>
        My number is {value}
      </Button>
      <Text>A {buttons.a ? "ON" : "OFF"}</Text>
      <Text>B {buttons.b ? "ON" : "OFF"}</Text>
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

export const Text = styled.span`
  font-size: 12px;
  color: #444;
`;

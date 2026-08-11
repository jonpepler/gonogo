// TWO widgets over the SAME subject, to show what variant B does and does not
// give up. One contribution feeds both, because both are filtering the same
// rows: under variant A that would have been two slots and two contributions to
// keep in step.

import { ISRU_UNIT } from "../sdk";
import { SubjectFilter } from "../ui-kit";
import { registerComponent } from "./registry";

export function IsruConsole() {
  return (
    <section aria-label="ISRU Console">
      <SubjectFilter subject={ISRU_UNIT} name="isru process" />
    </section>
  );
}

export function IsruStrip() {
  return (
    <section aria-label="ISRU Strip">
      <SubjectFilter subject={ISRU_UNIT} name="isru compact" />
    </section>
  );
}

registerComponent({
  id: "isru-console",
  name: "ISRU Console",
  component: IsruConsole,
});
registerComponent({
  id: "isru-strip",
  name: "ISRU Strip",
  component: IsruStrip,
});

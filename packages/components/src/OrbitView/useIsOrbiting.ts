import { getBody, useDataValue } from "@gonogo/core";
import { useMemo } from "react";

type OrbitInfo = {
  isOrbiting: boolean;
  periapsis: number | undefined;
  apoapsis: number | undefined;
  threshold: number;
};

export function useIsOrbiting(): OrbitInfo {
  const bodyName = useDataValue("telemachus", "v.body");
  const PeA = useDataValue("telemachus", "o.PeA");
  const ApA = useDataValue("telemachus", "o.ApA");

  const body = bodyName ? getBody(bodyName) : undefined;

  return useMemo(() => {
    if (PeA === undefined || ApA === undefined) {
      return { isOrbiting: false, periapsis: PeA, apoapsis: ApA, threshold: 0 };
    }

    const hasAtmosphere = body?.hasAtmosphere ?? false;
    const maxAtmosphere = body?.maxAtmosphere ?? 0;
    const threshold = hasAtmosphere ? maxAtmosphere : 0;

    const isOrbiting = PeA > threshold && PeA > 0 && ApA > 0;

    return { isOrbiting, periapsis: PeA, apoapsis: ApA, threshold };
  }, [PeA, ApA, body]);
}

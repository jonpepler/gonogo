/**
 * Where a craft is if it did not manoeuvre, derived from the last orbital
 * elements that reached us on `fleet.<guid>.orbit`.
 *
 * The spec's framing: losing contact does not make a craft's position unknown,
 * it makes it known with a growing envelope. This is the innermost part of that
 * envelope, the ballistic point, and it is all we can honestly draw until a
 * delta-V source exists to bound the volume around it. Nothing here implies the
 * craft is at this point, only that this is where it would be having done
 * nothing.
 */
export interface BallisticState {
  /** Height above the reference body's surface, metres. Null when nothing has been propagated or the radius is unknown. */
  altitude: number | null;
  /** Apoapsis ALTITUDE above the surface, not a radius from the centre. Null on an escape trajectory. */
  apoapsis: number | null;
  /** Periapsis altitude. Can legitimately be negative: that is an intersecting trajectory, and saying so is the point. */
  periapsis: number | null;
  /** Seconds per revolution. Null on an escape trajectory, which has no period. */
  periodSeconds: number | null;
}

export interface BallisticInput {
  sma: number;
  ecc: number;
  mu: number;
  /** The reference body's mean radius, metres. Null when `system.bodies` has not resolved it. */
  bodyRadius: number | null;
  /** Distance from the body's centre at the view UT, metres. Null before the first propagation. */
  radiusFromCentre: number | null;
}

const finite = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n);

export function ballisticState(input: BallisticInput): BallisticState {
  const { sma, ecc, mu, bodyRadius, radiusFromCentre } = input;
  const elementsUsable = finite(sma) && finite(ecc);

  // An altitude measured against an assumed radius is worse than no altitude,
  // so every height here waits for the real one.
  const altitudeOf = (radius: number | null): number | null =>
    finite(radius) && finite(bodyRadius) ? radius - bodyRadius : null;

  // A closed orbit only. On a hyperbolic trajectory `sma` is negative and
  // `sma * (1 + ecc)` yields a plausible-looking number for an apoapsis that
  // does not exist.
  const closed = elementsUsable && ecc < 1 && sma > 0;

  return {
    altitude: altitudeOf(radiusFromCentre),
    apoapsis: closed ? altitudeOf(sma * (1 + ecc)) : null,
    periapsis: elementsUsable ? altitudeOf(sma * (1 - ecc)) : null,
    periodSeconds:
      closed && finite(mu) && mu > 0
        ? 2 * Math.PI * Math.sqrt(sma ** 3 / mu)
        : null,
  };
}

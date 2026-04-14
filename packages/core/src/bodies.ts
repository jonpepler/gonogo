/**
 * Body registry — static configuration for celestial bodies.
 *
 * Bodies are registered once at startup (not reactive). The registry
 * follows the same extensibility pattern as components and data sources:
 * call registerBody() at module load time to add bodies; external packages
 * can extend the system using the same API.
 *
 * IDs must match the strings Telemachus returns for v.body / o.referenceBody
 * (e.g. "Kerbin", "Mun") for direct look-up in components.
 */

export interface BodyMapConfig {
  type: 'equirectangular';
  /** Pixel width of the source texture image. */
  width: number;
  /** Pixel height of the source texture image. */
  height: number;
}

export interface BodyDefinition {
  /** Unique identifier — must match Telemachus v.body / o.referenceBody strings. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Mean radius in metres. */
  radius: number;
  /** Path or URL to a surface texture image (equirectangular projection). */
  texture?: string;
  /** Fallback display colour (CSS colour string) used when no texture is available. */
  color?: string;
  /**
   * Longitude correction in degrees added to Telemachus v.long before mapping
   * to canvas/texture coordinates. Compensates for differences between the
   * texture's prime meridian and KSP's coordinate system.
   * Positive values shift the plotted position eastward (right on the map).
   * Defaults to 0; tune empirically per body.
   */
  longitudeOffset?: number;
  /**
   * Latitude correction in degrees added to Telemachus v.lat before mapping.
   * Defaults to 0.
   */
  latitudeOffset?: number;
  /** ID of the parent body (e.g. "Kerbin" for "Mun"). Absent for the star. */
  parent?: string;
  /** Texture map metadata, required for accurate lat/lon → pixel mapping. */
  map?: BodyMapConfig;
}

const bodies = new Map<string, BodyDefinition>();

export function registerBody(def: BodyDefinition): void {
  bodies.set(def.id, def);
}

export function getBody(id: string): BodyDefinition | undefined {
  return bodies.get(id);
}

export function getAllBodies(): BodyDefinition[] {
  return Array.from(bodies.values());
}

/** For use in tests only — resets the body registry to empty. */
export function clearBodies(): void {
  bodies.clear();
}

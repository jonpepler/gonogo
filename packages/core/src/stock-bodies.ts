/**
 * Stock Kerbol system body definitions.
 *
 * Call registerStockBodies() once at app startup to populate the registry
 * with all stock KSP celestial bodies. The IDs match the strings Telemachus
 * returns for v.body / o.referenceBody so that getBody(v.body) works directly.
 *
 * Radii sourced from the KSP wiki (accurate to stock KSP 1.x).
 * External packages (mods, planet packs) can call registerBody() afterward
 * to add or override entries.
 */

import { registerBody } from './bodies';

export function registerStockBodies(): void {
  // ── Star ─────────────────────────────────────────────────────────────────
  registerBody({
    id: 'Sun',
    name: 'Kerbol',
    radius: 261_600_000,
    color: '#FFF44F',
  });

  // ── Inner planets ────────────────────────────────────────────────────────
  registerBody({
    id: 'Moho',
    name: 'Moho',
    radius: 250_000,
    color: '#8B7355',
    parent: 'Sun',
  });

  registerBody({
    id: 'Eve',
    name: 'Eve',
    radius: 700_000,
    color: '#9B59B6',
    parent: 'Sun',
  });

  registerBody({
    id: 'Gilly',
    name: 'Gilly',
    radius: 13_000,
    color: '#A0855B',
    parent: 'Eve',
  });

  registerBody({
    id: 'Kerbin',
    name: 'Kerbin',
    radius: 600_000,
    color: '#1A6B8A',
    parent: 'Sun',
  });

  registerBody({
    id: 'Mun',
    name: 'Mun',
    radius: 200_000,
    color: '#888888',
    parent: 'Kerbin',
  });

  registerBody({
    id: 'Minmus',
    name: 'Minmus',
    radius: 60_000,
    color: '#B8D4B8',
    parent: 'Kerbin',
  });

  registerBody({
    id: 'Duna',
    name: 'Duna',
    radius: 320_000,
    color: '#C1440E',
    parent: 'Sun',
  });

  registerBody({
    id: 'Ike',
    name: 'Ike',
    radius: 130_000,
    color: '#9B9B8B',
    parent: 'Duna',
  });

  registerBody({
    id: 'Dres',
    name: 'Dres',
    radius: 138_000,
    color: '#7A7A6A',
    parent: 'Sun',
  });

  // ── Outer system ─────────────────────────────────────────────────────────
  registerBody({
    id: 'Jool',
    name: 'Jool',
    radius: 6_000_000,
    color: '#4A7C3F',
    parent: 'Sun',
  });

  registerBody({
    id: 'Laythe',
    name: 'Laythe',
    radius: 500_000,
    color: '#1E6091',
    parent: 'Jool',
  });

  registerBody({
    id: 'Vall',
    name: 'Vall',
    radius: 300_000,
    color: '#B0C4D8',
    parent: 'Jool',
  });

  registerBody({
    id: 'Tylo',
    name: 'Tylo',
    radius: 600_000,
    color: '#A0A080',
    parent: 'Jool',
  });

  registerBody({
    id: 'Bop',
    name: 'Bop',
    radius: 65_000,
    color: '#6B5B45',
    parent: 'Jool',
  });

  registerBody({
    id: 'Pol',
    name: 'Pol',
    radius: 44_000,
    color: '#D4C878',
    parent: 'Jool',
  });

  registerBody({
    id: 'Eeloo',
    name: 'Eeloo',
    radius: 210_000,
    color: '#E8E8F0',
    parent: 'Sun',
  });
}

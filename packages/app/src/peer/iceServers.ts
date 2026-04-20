/**
 * ICE server configuration for PeerJS Peer instances.
 *
 * The ocisly-proxy runs inside a podman container whose network isn't
 * reachable from the browser directly — ICE peer-to-peer would hang and time
 * out after ~12s. A TURN relay gives both peers a third address they can
 * both reach. See docker-compose.yml `coturn` service for the server side.
 *
 * Defaults target the dev compose setup (coturn on localhost:3478, static
 * shared-secret auth). Override via Vite env for staging/prod.
 */
export function loadIceServers(): RTCIceServer[] {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_TURN_URL ?? "turn:localhost:3478";
  const username = env.VITE_TURN_USERNAME ?? "gonogo";
  const credential = env.VITE_TURN_CREDENTIAL ?? "gonogo-dev-secret";

  if (!url) return [];
  return [{ urls: url, username, credential }];
}

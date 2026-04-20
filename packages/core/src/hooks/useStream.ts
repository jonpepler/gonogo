import { useEffect, useState } from "react";
import { getStreamSource } from "../streamRegistry";
import type { DataSourceStatus } from "../types";

export interface UseStreamResult {
  stream: MediaStream | null;
  status: DataSourceStatus;
}

/**
 * Subscribe to a single MediaStream from a registered StreamSource.
 *
 * Main screen: resolves locally against the source's MediaStream.
 * Station screen (M7+): the same hook will route through PeerJS just like
 * `useDataValue` does for scalar values.
 *
 * Returns `{ stream: null, status: 'disconnected' }` while resolving or if the
 * source isn't registered — consumers render a `<video srcObject>` and rely on
 * the browser's normal readyState handling.
 */
export function useStream(
  sourceId: string,
  streamId: string | null | undefined,
): UseStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<DataSourceStatus>("disconnected");

  useEffect(() => {
    if (!streamId) {
      setStream(null);
      return;
    }
    const source = getStreamSource(sourceId);
    if (!source) {
      setStream(null);
      setStatus("disconnected");
      return;
    }

    let cancelled = false;
    setStatus(source.status);

    const unsubStatus = source.onStatusChange((next) => {
      if (!cancelled) setStatus(next);
    });

    void source.subscribe(streamId).then((s) => {
      if (cancelled) {
        if (s) source.unsubscribe(streamId);
        return;
      }
      setStream(s);
    });

    return () => {
      cancelled = true;
      unsubStatus();
      source.unsubscribe(streamId);
      setStream(null);
    };
  }, [sourceId, streamId]);

  return { stream, status };
}

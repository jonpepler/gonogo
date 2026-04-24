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
 * `status` always reflects the source's current state when the source is
 * registered — even if `streamId` is null — so "no stream selected" can be
 * distinguished from "proxy down" by callers that render different placeholders.
 */
export function useStream(
  sourceId: string,
  streamId: string | null | undefined,
): UseStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<DataSourceStatus>("disconnected");

  useEffect(() => {
    const source = getStreamSource(sourceId);
    if (!source) {
      setStream(null);
      setStatus("disconnected");
      return;
    }

    let cancelled = false;
    setStatus(source.status);

    // Always track status, regardless of whether we have a streamId to
    // subscribe to. Widgets with no selected stream still need to know
    // whether the source is alive.
    const unsubStatus = source.onStatusChange((next) => {
      if (!cancelled) setStatus(next);
    });

    if (!streamId) {
      setStream(null);
      return () => {
        cancelled = true;
        unsubStatus();
      };
    }

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

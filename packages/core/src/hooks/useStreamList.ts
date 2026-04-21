import { useEffect, useState } from "react";
import type { StreamInfo } from "../streamRegistry";
import { getStreamSource } from "../streamRegistry";

/**
 * Live list of streams advertised by a StreamSource.
 *
 * The source is expected to refresh this in the background (e.g. the OCISLY
 * proxy polls the server for active cameras). Consumers just re-render when
 * the list changes.
 */
export function useStreamList(sourceId: string): StreamInfo[] {
  const [streams, setStreams] = useState<StreamInfo[]>(() => {
    const source = getStreamSource(sourceId);
    return source?.listStreams() ?? [];
  });

  useEffect(() => {
    const source = getStreamSource(sourceId);
    if (!source) return;
    setStreams(source.listStreams());
    return source.onStreamsChange(setStreams);
  }, [sourceId]);

  return streams;
}

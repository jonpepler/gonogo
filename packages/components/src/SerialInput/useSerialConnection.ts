import { useCallback, useEffect, useRef, useState } from "react";

type UseSerialConnectionConfig = {
  baudRate?: number;
  filters?: SerialPortFilter[];
  defaultPort?: SerialPort | null;
};

type UseSerialConnectionResult = {
  port: SerialPort | null;
  error: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  write: (data: string | string[]) => Promise<void>;
};

export function useSerialConnection(
  onNewLine: (line: string) => void,
  config: UseSerialConnectionConfig = {},
): UseSerialConnectionResult {
  const { baudRate = 9600, filters, defaultPort = null } = config;

  const [port, setPort] = useState<SerialPort | null>(defaultPort);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter | null>(null);
  const bufferRef = useRef("");

  const cleanError = useCallback((e: unknown) => {
    console.error(e);
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const connect = useCallback(async () => {
    try {
      setError(null);

      const selectedPort =
        port ??
        (await navigator.serial.requestPort({
          filters,
        }));

      await selectedPort.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });

      setPort(selectedPort);
      setIsConnected(true);
      console.log(0);
      const textDecoder = new TextDecoderStream();
      const readableClosed = selectedPort.readable!.pipeTo(
        textDecoder.writable,
      );
      const reader = textDecoder.readable.getReader();
      console.log(1);

      readerRef.current = reader;

      const textEncoder = new TextEncoderStream();
      const writableClosed = textEncoder.readable.pipeTo(
        selectedPort.writable!,
      );
      const writer = textEncoder.writable.getWriter();
      console.log(2, writer);

      writerRef.current = writer;
      console.log(3);

      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;

            bufferRef.current += value;

            const lines = bufferRef.current.split("\n");
            bufferRef.current = lines.pop() || "";

            for (const line of lines) {
              onNewLine(line);
            }
          }
        } catch (e) {
          cleanError(e);
        }
      };

      readLoop().catch(cleanError);
      console.log(4);
      (selectedPort as any)._readCleanup = async () => {
        try {
          reader.cancel();
          await readableClosed.catch(() => {});
          reader.releaseLock();
        } catch {}
      };
      console.log(5);
      (selectedPort as any)._writeCleanup = async () => {
        try {
          writer.releaseLock();
          await writableClosed.catch(() => {});
        } catch {}
      };
    } catch (e) {
      console.error(e);
      cleanError(e);
    }
    console.log(6);
  }, [baudRate, cleanError, filters, onNewLine, port]);

  const disconnect = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current.releaseLock();
        readerRef.current = null;
      }

      if (writerRef.current) {
        writerRef.current.releaseLock();
        writerRef.current = null;
      }

      if (port) {
        await port.close();
      }

      setIsConnected(false);
      setPort(null);
    } catch (e) {
      cleanError(e);
    }
  }, [cleanError, port]);

  const write = useCallback(
    async (data: string | string[]) => {
      try {
        if (!writerRef.current) throw new Error("Serial not connected");

        const lines = Array.isArray(data) ? data : [data];

        for (let line of lines) {
          // pad right to 21 chars
          if (line.length > 21) {
            line = line.slice(0, 21);
          } else {
            line = line.padEnd(21, " ");
          }

          await writerRef.current.write(line + "\n");
        }
      } catch (e) {
        cleanError(e);
      }
    },
    [cleanError],
  );

  return {
    port,
    error,
    isConnected,
    connect,
    disconnect,
    write,
  };
}

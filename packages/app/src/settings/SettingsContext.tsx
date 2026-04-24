import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { SettingsService } from "./SettingsService";

const SettingsContext = createContext<SettingsService | null>(null);

export function SettingsProvider({
  service,
  children,
}: {
  service: SettingsService;
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={service}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsService(): SettingsService {
  const svc = useContext(SettingsContext);
  if (!svc) {
    throw new Error(
      "useSettingsService must be used inside a <SettingsProvider>",
    );
  }
  return svc;
}

/**
 * Reactive accessor for a single setting. Returns a `[value, setValue]`
 * tuple; mutations persist through the underlying service and broadcast
 * to other subscribers.
 */
export function useSetting<T>(
  key: string,
  defaultValue: T,
): [T, (v: T) => void] {
  const svc = useSettingsService();
  const [value, setValueState] = useState<T>(() => svc.get(key, defaultValue));

  useEffect(() => svc.subscribe<T>(key, setValueState), [svc, key]);

  const setValue = useCallback(
    (next: T) => {
      svc.set(key, next);
    },
    [svc, key],
  );

  return [value, setValue];
}

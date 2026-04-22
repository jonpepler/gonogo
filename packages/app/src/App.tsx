import { PeerHostProvider } from "./peer/PeerHostProvider";
import { MainScreen } from "./screens/MainScreen";
import { StationScreen } from "./screens/StationScreen";
import "./styles/global.css";

export default function App() {
  // BASE_URL is "/" in dev and "/gonogo/" on GitHub Pages — strip it so the
  // /station match works in both environments.
  const base = import.meta.env.BASE_URL;
  const path = globalThis.location.pathname;
  const relative = path.startsWith(base) ? `/${path.slice(base.length)}` : path;
  const isStation = relative.startsWith("/station");

  if (isStation) return <StationScreen />;

  return (
    <PeerHostProvider>
      <MainScreen />
    </PeerHostProvider>
  );
}

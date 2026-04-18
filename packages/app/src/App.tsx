import { PeerHostProvider } from "./peer/PeerHostProvider";
import { MainScreen } from "./screens/MainScreen";
import { StationScreen } from "./screens/StationScreen";
import "./styles/global.css";

export default function App() {
  const isStation = globalThis.location.pathname.startsWith("/station");

  if (isStation) return <StationScreen />;

  return (
    <PeerHostProvider>
      <MainScreen />
    </PeerHostProvider>
  );
}

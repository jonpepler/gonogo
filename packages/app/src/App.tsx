import { MainScreen } from "./screens/MainScreen";
import "./styles/global.css";

export default function App() {
  const isStation = globalThis.location.pathname.startsWith("/station");

  return isStation ? <StationScreen /> : <MainScreen />;
}

function StationScreen() {
  return <div>Station Screen — coming soon</div>;
}

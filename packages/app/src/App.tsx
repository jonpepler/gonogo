export default function App() {
  const isStation = window.location.pathname.startsWith('/station');

  return isStation ? <StationScreen /> : <MainScreen />;
}

function MainScreen() {
  return <div>Main Screen — coming soon</div>;
}

function StationScreen() {
  return <div>Station Screen — coming soon</div>;
}

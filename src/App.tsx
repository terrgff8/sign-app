import { useApp } from './state/store';
import { DocScreen } from './components/DocScreen';
import { HomeScreen } from './components/HomeScreen';
import { SignaturePadModal } from './components/SignaturePadModal';
import { BusyOverlay, Toast } from './components/ui';

export function App() {
  const hasDoc = useApp((s) => s.meta !== null);
  return (
    <>
      {hasDoc ? <DocScreen /> : <HomeScreen />}
      <SignaturePadModal />
      <BusyOverlay />
      <Toast />
    </>
  );
}

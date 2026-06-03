import { MapView } from '../components/map/MapView';
import { Panel } from '../components/panel/Panel';
import { useRealtime } from '../hooks/useRealtime';

export default function MapPage() {
  useRealtime();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="flex-1 relative">
        <MapView />
      </div>
      <Panel />
    </div>
  );
}

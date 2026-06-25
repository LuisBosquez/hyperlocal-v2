import { Outlet } from 'react-router-dom';
import { MapView } from '../components/map/MapView';
import { MapOverlay } from '../components/map/MapOverlay';
import { Panel } from '../components/panel/Panel';
import { useRealtime } from '../hooks/useRealtime';
import { useGeolocation } from '../hooks/useGeolocation';

/**
 * Persistent app shell. The map + panel stay mounted across the place/plan
 * detail routes, which render as overlays through <Outlet> — so opening a card
 * no longer unmounts (and blanks) the map. On mobile the map is the full-screen
 * background and the Panel becomes an expandable bottom sheet.
 */
export default function MapPage() {
  useRealtime();
  useGeolocation();

  return (
    <div className="relative h-screen w-screen overflow-hidden sm:flex">
      <div className="absolute inset-0 sm:relative sm:flex-1">
        <MapView />
        <MapOverlay />
      </div>
      <Panel />
      <Outlet />
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { useMapStore } from '../store/mapStore';

const LAST_VIEWPORT = 'hl_last_center';

/**
 * Centers the map on the user's location (Flow 2). Degrades gracefully
 * (tech/08 P4 / J0.3): denied/unavailable → last viewport → default city.
 */
export function useGeolocation() {
  const { setViewport, setScopedArea, setUserLocation, setLocationMode } = useMapStore();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const stored = localStorage.getItem(LAST_VIEWPORT);
    if (stored) {
      try {
        const c = JSON.parse(stored) as [number, number];
        setViewport({ center: c });
        setScopedArea(c, null); // initial discovery scope = last known area
      } catch {
        /* ignore */
      }
    }

    if (!('geolocation' in navigator)) {
      setLocationMode('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const center: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setViewport({ center, zoom: 14 });
        setScopedArea(center, null); // scope discovery to where you are
        setUserLocation(center);
        setLocationMode('granted');
        localStorage.setItem(LAST_VIEWPORT, JSON.stringify(center));
      },
      () => setLocationMode('denied'),
      { timeout: 6000, maximumAge: 5 * 60_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

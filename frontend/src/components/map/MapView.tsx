import { useRef, useEffect } from 'react';
import { useMapStore } from '../../store/mapStore';

/*
 * Mapbox GL JS initialization goes here once `mapbox-gl` is installed.
 * Use react-map-gl v7 (<Map> from 'react-map-gl') for the React wrapper,
 * with <Source> + <Layer> for GeoJSON pin layers (see tech/06-frontend-architecture.md §6).
 * The Mapbox public token comes from import.meta.env.VITE_MAPBOX_TOKEN.
 */

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const { center, zoom } = useMapStore();

  return (
    <div className="relative w-full h-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center">
      <div ref={mapContainer} className="absolute inset-0" id="map" />
      <div className="text-slate-400 dark:text-zinc-500 text-sm pointer-events-none z-10">
        Map — center [{center[0].toFixed(4)}, {center[1].toFixed(4)}] zoom {zoom}
        <br />
        Add VITE_MAPBOX_TOKEN to .env.local to initialize the map.
      </div>
    </div>
  );
}

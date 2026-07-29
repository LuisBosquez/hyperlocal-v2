import Map, { Marker } from 'react-map-gl';
import type { LngLatBoundsLike } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import type { PlaceInfo } from '../../types/api';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

/** Flow 20: a read-only map of a profile's places. Pins open Place detail so a
 * viewer can save / add-to-list / plan from someone else's taste. */
export function ProfileMap({ places }: { places: PlaceInfo[] }) {
  const navigate = useNavigate();
  const { darkMode } = useUIStore();

  if (places.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-400 dark:bg-zinc-900 dark:text-zinc-500">
        No public places yet.
      </div>
    );
  }

  const lngs = places.map((p) => p.lng);
  const lats = places.map((p) => p.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  if (!TOKEN) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl bg-slate-100 px-4 text-center text-xs text-slate-400 dark:bg-zinc-900 dark:text-zinc-500">
        {places.length} place{places.length === 1 ? '' : 's'} · add VITE_MAPBOX_TOKEN to see the map
      </div>
    );
  }

  const initialViewState =
    places.length > 1
      ? {
          bounds: [
            [minLng, minLat],
            [maxLng, maxLat],
          ] as LngLatBoundsLike,
          fitBoundsOptions: { padding: 48 },
        }
      : { longitude: (minLng + maxLng) / 2, latitude: (minLat + maxLat) / 2, zoom: 13 };

  return (
    <div className="h-48 overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800">
      <Map
        mapboxAccessToken={TOKEN}
        initialViewState={initialViewState}
        mapStyle={darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'}
        style={{ width: '100%', height: '100%' }}
      >
        {places.map((p) => (
          <Marker
            key={p.place_id}
            longitude={p.lng}
            latitude={p.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              navigate(`/places/${p.place_id}`);
            }}
          >
            <svg
              width="22"
              height="30"
              viewBox="0 0 24 32"
              className="cursor-pointer"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
            >
              <title>{p.name}</title>
              <path
                d="M12 0C5.4 0 0 5.3 0 11.9 0 20.4 10.4 30.6 11.3 31.5a1 1 0 0 0 1.4 0C13.6 30.6 24 20.4 24 11.9 24 5.3 18.6 0 12 0z"
                fill="#0f172a"
                stroke="#fff"
                strokeWidth="1.5"
              />
              <circle cx="12" cy="11.5" r="4.3" fill="#fff" />
            </svg>
          </Marker>
        ))}
      </Map>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore } from '../../store/mapStore';
import { useUIStore } from '../../store/uiStore';
import { useMapPins } from '../../hooks/usePlaces';
import { useContextual } from '../../hooks/usePlaces';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

const PIN_COLORS: Record<string, string> = {
  own: '#0f172a', // slate-900
  friend: '#6366f1', // indigo-500
  contextual: '#f59e0b', // amber-500
};

/** A larger teardrop pin (tip anchored at the coordinate) — much easier to tap
 * than the old 16px dot. Color-coded by source. */
function PinIcon({ color, title }: { color: string; title?: string }) {
  return (
    <svg
      width="30"
      height="40"
      viewBox="0 0 24 32"
      fill="none"
      className="cursor-pointer transition-transform hover:-translate-y-0.5"
      style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }}
    >
      {title && <title>{title}</title>}
      <path
        d="M12 0C5.4 0 0 5.3 0 11.9 0 20.4 10.4 30.6 11.3 31.5a1 1 0 0 0 1.4 0C13.6 30.6 24 20.4 24 11.9 24 5.3 18.6 0 12 0z"
        fill={color}
        stroke="#fff"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="11.5" r="4.3" fill="#fff" />
    </svg>
  );
}

export function MapView() {
  const navigate = useNavigate();
  const { center, zoom, setViewport } = useMapStore();
  const { darkMode } = useUIStore();
  const { data: pins } = useMapPins();
  const [lng, lat] = center;
  const { data: contextual } = useContextual(lat, lng);

  if (!TOKEN) {
    return (
      <div className="relative w-full h-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center">
        <p className="text-slate-400 dark:text-zinc-500 text-sm text-center px-6">
          Add <code>VITE_MAPBOX_TOKEN</code> to <code>frontend/.env</code> to see the map.
          <br />
          The Panel on the right is fully functional without it.
        </p>
      </div>
    );
  }

  const allPins = [
    ...(pins ?? []),
    ...(contextual?.results ?? []).map((p) => ({ ...p, source: 'contextual' as const })),
  ];

  return (
    <Map
      mapboxAccessToken={TOKEN}
      longitude={lng}
      latitude={lat}
      zoom={zoom}
      onMove={(e) => setViewport({ center: [e.viewState.longitude, e.viewState.latitude], zoom: e.viewState.zoom })}
      mapStyle={darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'}
      style={{ width: '100%', height: '100%' }}
    >
      {window.matchMedia('(min-width: 640px)').matches && <NavigationControl position="bottom-left" />}
      {allPins.map((p) => (
        <Marker
          key={`${p.place_id}-${p.source ?? 'own'}`}
          longitude={p.lng}
          latitude={p.lat}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            navigate(`/places/${p.place_id}`);
          }}
        >
          <PinIcon color={PIN_COLORS[p.source ?? 'own']} title={p.name} />
        </Marker>
      ))}
    </Map>
  );
}

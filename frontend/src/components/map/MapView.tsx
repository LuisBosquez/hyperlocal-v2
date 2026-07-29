import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Map, { Marker, NavigationControl, Popup } from 'react-map-gl';
import type { MapLayerMouseEvent, ViewStateChangeEvent } from 'react-map-gl';
import type { Map as MapboxMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore, type BBox } from '../../store/mapStore';
import { useUIStore } from '../../store/uiStore';
import { useMapPins, useContextual, useSavePlace } from '../../hooks/usePlaces';
import { usePlanPins, useJoinFromMap } from '../../hooks/usePlans';
import { formatPlanWhen } from '../../lib/format';
import { Avatar } from '../ui';
import type { PlanPin } from '../../types/api';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

const PIN_COLORS: Record<string, string> = {
  own: '#0f172a', // slate-900
  friend: '#6366f1', // indigo-500
  contextual: '#f59e0b', // amber-500
  highlight: '#e11d48', // rose-600 — category-search results (spec §3)
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

/** Plan markers are the loudest thing on the map (spec §6, MD-4): the point is
 * joining your friends' plans, so they get an avatar badge and an accent ring. */
function PlanPinIcon({ pin }: { pin: PlanPin }) {
  const ring =
    pin.role === 'organizer' ? 'ring-slate-900 dark:ring-zinc-100'
    : pin.viewer_has_joined ? 'ring-emerald-600'
    : 'ring-emerald-500';
  return (
    <div className="relative cursor-pointer transition-transform hover:scale-110" title={pin.place_name}>
      <div className={`rounded-full bg-white p-0.5 ring-[3px] shadow-lg ${ring}`}>
        <Avatar user={{ handle: pin.organizer_handle, avatar_url: pin.organizer_avatar_url }} size={30} />
      </div>
      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white shadow">
        {pin.viewer_has_joined ? '✓' : pin.join_count + 1}
      </span>
    </div>
  );
}

/** True once the live center has moved meaningfully away from the scoped area —
 * drives the "Search this area" affordance (Flow 14). Threshold adapts to zoom
 * via the current viewport bounds. */
function pannedAway(center: [number, number], scoped: [number, number], bounds: BBox | null): boolean {
  const [lng, lat] = center;
  const [sLng, sLat] = scoped;
  if (!bounds) return Math.abs(lng - sLng) > 0.01 || Math.abs(lat - sLat) > 0.01;
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const halfW = (maxLng - minLng) / 2;
  const halfH = (maxLat - minLat) / 2;
  return Math.abs(lng - sLng) > halfW * 0.35 || Math.abs(lat - sLat) > halfH * 0.35;
}

/** Our pins are the only thing to interact with on the map: drop Mapbox's own
 * POI/transit icons and labels in both themes (spec §1). */
function hideDefaultPOIs(map: MapboxMap) {
  try {
    for (const layer of map.getStyle()?.layers ?? []) {
      if (/poi|transit/.test(layer.id)) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    }
  } catch {
    /* style still loading — the styledata handler will get it */
  }
}

export function MapView() {
  const navigate = useNavigate();
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const bounds = useMapStore((s) => s.bounds);
  const scopedCenter = useMapStore((s) => s.scopedCenter);
  const userLocation = useMapStore((s) => s.userLocation);
  const locationMode = useMapStore((s) => s.locationMode);
  const highlight = useMapStore((s) => s.highlight);
  const setViewport = useMapStore((s) => s.setViewport);
  const searchThisArea = useMapStore((s) => s.searchThisArea);
  const locateMe = useMapStore((s) => s.locateMe);
  const { darkMode } = useUIStore();
  const { data: pins } = useMapPins();
  const { data: contextual } = useContextual();
  const { data: planPins } = usePlanPins();
  const joinFromMap = useJoinFromMap();
  const savePlace = useSavePlace();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [lng, lat] = center;

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

  // User-generated first (MD-4): a place with an active plan renders as a plan
  // pin — suppress its plain place/contextual pin so the plan is what you see.
  const planPlaceIds = new Set((planPins ?? []).map((p) => p.place_id));
  const highlightIds = new Set((highlight?.places ?? []).map((p) => p.place_id));
  const allPins = [
    ...(pins ?? []),
    ...(contextual?.results ?? []).map((p) => ({ ...p, source: 'contextual' as const })),
  ].filter((p) => !planPlaceIds.has(p.place_id) && !highlightIds.has(p.place_id));
  const openPlan = (planPins ?? []).find((p) => p.plan_id === openPlanId) ?? null;
  const showSearchHere = pannedAway(center, scopedCenter, bounds);
  const isDesktop = window.matchMedia('(min-width: 640px)').matches;

  function onMove(e: ViewStateChangeEvent) {
    const b = e.target.getBounds();
    const bbox: BBox | null = b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null;
    setViewport({ center: [e.viewState.longitude, e.viewState.latitude], zoom: e.viewState.zoom, bounds: bbox });
  }

  return (
    <div className="relative h-full w-full">
      <Map
        mapboxAccessToken={TOKEN}
        longitude={lng}
        latitude={lat}
        zoom={zoom}
        onMove={onMove}
        onLoad={(e) => {
          // Re-hide on every style load — the dark/light toggle swaps styles.
          hideDefaultPOIs(e.target);
          e.target.on('styledata', () => hideDefaultPOIs(e.target));
        }}
        mapStyle={darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'}
        style={{ width: '100%', height: '100%' }}
        onClick={(_e: MapLayerMouseEvent) => {
          useMapStore.getState().setSelectedPlace(null);
          setOpenPlanId(null);
        }}
      >
        {isDesktop && <NavigationControl position="bottom-left" />}

        {userLocation && (
          <Marker longitude={userLocation[0]} latitude={userLocation[1]} anchor="center">
            <span className="relative flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
              <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow" />
            </span>
          </Marker>
        )}

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

        {/* Category-search highlight pins (spec §3) */}
        {(highlight?.places ?? []).map((p) => (
          <Marker
            key={`hl-${p.place_id}`}
            longitude={p.lng}
            latitude={p.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              navigate(`/places/${p.place_id}`);
            }}
          >
            <PinIcon color={PIN_COLORS.highlight} title={p.name} />
          </Marker>
        ))}

        {/* Plan pins — the loudest layer (spec §6) */}
        {(planPins ?? []).map((pin) => (
          <Marker
            key={`plan-${pin.plan_id}`}
            longitude={pin.lng}
            latitude={pin.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setOpenPlanId(pin.plan_id === openPlanId ? null : pin.plan_id);
            }}
          >
            <div
              onMouseEnter={() => isDesktop && setOpenPlanId(pin.plan_id)}
            >
              <PlanPinIcon pin={pin} />
            </div>
          </Marker>
        ))}

        {/* Plan card: who, when, and one-tap actions (spec §6) */}
        {openPlan && (
          <Popup
            longitude={openPlan.lng}
            latitude={openPlan.lat}
            anchor="bottom"
            offset={26}
            closeButton={false}
            closeOnClick={false}
            onClose={() => setOpenPlanId(null)}
            maxWidth="280px"
            className="hl-plan-popup"
          >
            <div className="min-w-[220px] p-1">
              <div className="flex items-center gap-2">
                <Avatar
                  user={{ handle: openPlan.organizer_handle, avatar_url: openPlan.organizer_avatar_url }}
                  size={28}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{openPlan.place_name}</p>
                  <p className="text-xs text-slate-500">
                    {openPlan.role === 'organizer' ? 'Your plan' : `@${openPlan.organizer_handle}'s plan`}
                  </p>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">
                {formatPlanWhen(openPlan.plan_date, openPlan.plan_time, openPlan.state, openPlan.plan_time_band)}
                {openPlan.state === 'timeless' && ' · needs a time'}
                {openPlan.join_count > 0 && ` · ${openPlan.join_count} going`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {openPlan.role === 'friend' && !openPlan.viewer_has_joined && (
                  <button
                    disabled={joinFromMap.isPending}
                    onClick={() => joinFromMap.mutate(openPlan.plan_id)}
                    className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Join
                  </button>
                )}
                {openPlan.viewer_has_joined && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">Joined ✓</span>
                )}
                <button
                  onClick={() => navigate(`/plans/${openPlan.plan_id}`)}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                >
                  {openPlan.state === 'timeless' && openPlan.viewer_has_joined ? 'Propose a time' : 'Details'}
                </button>
                {openPlan.role !== 'organizer' && (
                  <button
                    disabled={savePlace.isPending}
                    onClick={() => savePlace.mutate({ placeId: openPlan.place_id })}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
                    title="Save this place for later"
                  >
                    ☆ Save place
                  </button>
                )}
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {/* "Search this area" — appears only after panning away (Flow 14). */}
      {showSearchHere && (
        <button
          onClick={searchThisArea}
          className="absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-medium text-slate-700 shadow-lg backdrop-blur hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200"
        >
          ⟳ Search this area
        </button>
      )}

      {/* Locate-me — prominent on mobile; replaces the (hidden) zoom cluster. */}
      <button
        onClick={locateMe}
        aria-label="Show my location"
        title={locationMode === 'denied' ? 'Location is off — enable it to recenter' : 'Show my location'}
        className="absolute bottom-6 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/95 shadow-lg backdrop-blur hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/95"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={locationMode === 'denied' ? 'text-slate-300 dark:text-zinc-600' : 'text-slate-600 dark:text-zinc-300'}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          <line x1="12" y1="1.5" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22.5" y2="12" />
        </svg>
      </button>
    </div>
  );
}

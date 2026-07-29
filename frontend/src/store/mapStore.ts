import { create } from 'zustand';
import type { CityResult } from '../types/api';

// [minLng, minLat, maxLng, maxLat] — matches the backend `bbox` param (Area scoping).
export type BBox = [number, number, number, number];
type LocationMode = 'pending' | 'granted' | 'denied';

/** Search-result places pinned distinctly on the map (spec §3: category groups). */
export interface MapHighlight {
  label: string;
  places: { place_id: string; name: string; lat: number; lng: number }[];
}

const LAST_CENTER = 'hl_last_center';

interface MapStore {
  center: [number, number]; // [lng, lat] — live viewport center (updates on every pan)
  zoom: number;
  bounds: BBox | null; // live viewport bounds
  // The area discovery is scoped to. Changes only on "Search this area" / locate-me,
  // NOT on every pan — this is what stops the list-flash / request-storm (Flow 14).
  scopedCenter: [number, number];
  scopedBbox: BBox | null;
  areaLabel: string | null;
  userLocation: [number, number] | null; // for the "you are here" marker
  selectedPlaceId: string | null;
  locationMode: LocationMode;
  // Change-location mode (spec §4): browsing another city = planning ahead.
  remoteCity: { name: string; region: string } | null;
  // Category-search highlight (spec §3): pins the group on the map.
  highlight: MapHighlight | null;
  setViewport: (vp: Partial<Pick<MapStore, 'center' | 'zoom' | 'bounds'>>) => void;
  setScopedArea: (center: [number, number], bbox: BBox | null) => void;
  searchThisArea: () => void; // copy live viewport → scoped area
  locateMe: () => void; // recenter on the user, drop the marker, re-scope
  setUserLocation: (loc: [number, number] | null) => void;
  setAreaLabel: (label: string | null) => void;
  setSelectedPlace: (id: string | null) => void;
  setLocationMode: (mode: LocationMode) => void;
  flyTo: (center: [number, number], zoom?: number) => void;
  fitBounds: (bbox: BBox) => void;
  setHighlight: (h: MapHighlight | null) => void;
  enterRemoteCity: (city: CityResult) => void;
  exitRemoteCity: () => void;
}

// Default: Capitol Hill, Seattle — matches the dev seed data so the map has pins
// before geolocation resolves (and when it's denied).
const DEFAULT_CENTER: [number, number] = [-122.3251, 47.6131];

/** Approximate center + zoom for a bbox — the map is fully controlled, so we
 * translate "fit these bounds" into viewport state ourselves. */
function bboxViewport(bbox: BBox): { center: [number, number]; zoom: number } {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const span = Math.max(maxLng - minLng, (maxLat - minLat) * 2, 0.005);
  const zoom = Math.min(16, Math.max(3, Math.log2(360 / span) - 0.5));
  return { center, zoom };
}

export const useMapStore = create<MapStore>((set, get) => ({
  center: DEFAULT_CENTER,
  zoom: 13,
  bounds: null,
  scopedCenter: DEFAULT_CENTER,
  scopedBbox: null,
  areaLabel: null,
  userLocation: null,
  selectedPlaceId: null,
  locationMode: 'pending',
  remoteCity: null,
  highlight: null,
  setViewport: (vp) => set((state) => ({ ...state, ...vp })),
  setScopedArea: (center, bbox) => set({ scopedCenter: center, scopedBbox: bbox }),
  searchThisArea: () => set((s) => ({ scopedCenter: s.center, scopedBbox: s.bounds })),
  locateMe: () => {
    if (!('geolocation' in navigator)) {
      set({ locationMode: 'denied' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        set({
          center: c, zoom: 15, scopedCenter: c, scopedBbox: null, userLocation: c,
          locationMode: 'granted', remoteCity: null,
        });
        localStorage.setItem(LAST_CENTER, JSON.stringify(c));
      },
      () => set({ locationMode: 'denied' }),
      { timeout: 6000, maximumAge: 60_000 },
    );
  },
  setUserLocation: (userLocation) => set({ userLocation }),
  setAreaLabel: (areaLabel) => set({ areaLabel }),
  setSelectedPlace: (id) => set({ selectedPlaceId: id }),
  setLocationMode: (locationMode) => set({ locationMode }),
  flyTo: (center, zoom = 15) => set({ center, zoom }),
  fitBounds: (bbox) => set(bboxViewport(bbox)),
  setHighlight: (highlight) => set({ highlight }),
  enterRemoteCity: (city) => {
    const { center, zoom } = bboxViewport(city.bbox);
    set({
      center, zoom,
      scopedCenter: [city.lng, city.lat],
      scopedBbox: city.bbox,
      remoteCity: { name: city.name, region: city.region },
      highlight: null,
    });
  },
  exitRemoteCity: () => {
    const { userLocation } = get();
    const home = userLocation ?? DEFAULT_CENTER;
    set({
      center: home, zoom: 13, scopedCenter: home, scopedBbox: null,
      remoteCity: null, highlight: null,
    });
    if (userLocation) return;
    // No fix yet — try to grab one so "back to my area" really means *my* area.
    get().locateMe();
  },
}));

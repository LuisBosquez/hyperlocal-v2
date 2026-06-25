import { create } from 'zustand';

type BBox = [number, number, number, number];
type LocationMode = 'pending' | 'granted' | 'denied';

interface MapStore {
  center: [number, number]; // [lng, lat]
  zoom: number;
  bounds: BBox | null;
  selectedPlaceId: string | null;
  locationMode: LocationMode;
  setViewport: (vp: Partial<Pick<MapStore, 'center' | 'zoom' | 'bounds'>>) => void;
  setSelectedPlace: (id: string | null) => void;
  setLocationMode: (mode: LocationMode) => void;
}

// Default: Capitol Hill, Seattle — matches the dev seed data so the map has pins
// before geolocation resolves (and when it's denied).
export const useMapStore = create<MapStore>((set) => ({
  center: [-122.3251, 47.6131],
  zoom: 13,
  bounds: null,
  selectedPlaceId: null,
  locationMode: 'pending',
  setViewport: (vp) => set((state) => ({ ...state, ...vp })),
  setSelectedPlace: (id) => set({ selectedPlaceId: id }),
  setLocationMode: (locationMode) => set({ locationMode }),
}));

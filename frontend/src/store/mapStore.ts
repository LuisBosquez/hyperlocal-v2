import { create } from 'zustand';

type BBox = [number, number, number, number];

interface MapStore {
  center: [number, number];
  zoom: number;
  bounds: BBox | null;
  selectedPlaceId: string | null;
  setViewport: (vp: Partial<Pick<MapStore, 'center' | 'zoom' | 'bounds'>>) => void;
  setSelectedPlace: (id: string | null) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  center: [-118.2437, 34.0522],
  zoom: 13,
  bounds: null,
  selectedPlaceId: null,
  setViewport: (vp) => set((state) => ({ ...state, ...vp })),
  setSelectedPlace: (id) => set({ selectedPlaceId: id }),
}));

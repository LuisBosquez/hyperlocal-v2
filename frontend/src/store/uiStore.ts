import { create } from 'zustand';

type ActiveFilter = 'all' | 'plans' | 'places' | 'hide_notifications';

const DARK_KEY = 'hyperlocal-dark-mode';
const PANEL_KEY = 'hyperlocal-panel-open'; // desktop collapse persists per device (MD-8)

function applyDark(dark: boolean) {
  if (dark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  localStorage.setItem(DARK_KEY, String(dark));
}

interface UIStore {
  isPanelOpen: boolean;
  /** Mobile only: whether the bottom-sheet panel is expanded. Starts collapsed
   * so the map is the primary surface (desktop ignores this). */
  mobilePanelOpen: boolean;
  /** Desktop only: sidebar collapse — the map goes full-bleed (spec §9). */
  desktopPanelOpen: boolean;
  activeFilter: ActiveFilter;
  darkMode: boolean;
  setIsPanelOpen: (open: boolean) => void;
  setMobilePanelOpen: (open: boolean) => void;
  toggleDesktopPanel: () => void;
  setActiveFilter: (filter: ActiveFilter) => void;
  toggleDarkMode: () => void;
}

const savedDark = localStorage.getItem(DARK_KEY);
const initialDark = savedDark === null ? true : savedDark === 'true';
const initialPanelOpen = localStorage.getItem(PANEL_KEY) !== 'false';

export const useUIStore = create<UIStore>((set, get) => ({
  isPanelOpen: true,
  mobilePanelOpen: false,
  desktopPanelOpen: initialPanelOpen,
  activeFilter: 'all',
  darkMode: initialDark,
  setIsPanelOpen: (open) => set({ isPanelOpen: open }),
  setMobilePanelOpen: (open) => set({ mobilePanelOpen: open }),
  toggleDesktopPanel: () => {
    const next = !get().desktopPanelOpen;
    localStorage.setItem(PANEL_KEY, String(next));
    set({ desktopPanelOpen: next });
  },
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  toggleDarkMode: () => {
    const next = !get().darkMode;
    applyDark(next);
    set({ darkMode: next });
  },
}));

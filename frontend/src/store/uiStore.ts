import { create } from 'zustand';

type ActiveFilter = 'all' | 'plans' | 'places' | 'hide_notifications';

const DARK_KEY = 'hyperlocal-dark-mode';

function applyDark(dark: boolean) {
  if (dark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  localStorage.setItem(DARK_KEY, String(dark));
}

interface UIStore {
  isPanelOpen: boolean;
  activeFilter: ActiveFilter;
  darkMode: boolean;
  setIsPanelOpen: (open: boolean) => void;
  setActiveFilter: (filter: ActiveFilter) => void;
  toggleDarkMode: () => void;
}

const savedDark = localStorage.getItem(DARK_KEY);
const initialDark = savedDark === null ? true : savedDark === 'true';

export const useUIStore = create<UIStore>((set, get) => ({
  isPanelOpen: true,
  activeFilter: 'all',
  darkMode: initialDark,
  setIsPanelOpen: (open) => set({ isPanelOpen: open }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  toggleDarkMode: () => {
    const next = !get().darkMode;
    applyDark(next);
    set({ darkMode: next });
  },
}));

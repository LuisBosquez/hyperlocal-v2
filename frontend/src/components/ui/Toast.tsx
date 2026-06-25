import { create } from 'zustand';
import { useEffect } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  remove: (id: number) => void;
}

let counter = 0;

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative API usable outside React components (e.g. mutation onError). */
export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  info: (m: string) => useToastStore.getState().push('info', m),
};

const STYLES: Record<ToastKind, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-800 dark:bg-zinc-100 text-white dark:text-zinc-900',
};

export function ToastHost() {
  const { toasts, remove } = useToastStore();
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => remove(t.id)}
          className={`pointer-events-auto rounded-full px-4 py-2 text-sm font-medium shadow-lg animate-[fadeIn_0.15s_ease-out] ${STYLES[t.kind]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

/** Network-status banner (tech/08 P6 / X.2). */
export function OfflineBanner() {
  const push = useToastStore((s) => s.push);
  useEffect(() => {
    const onOffline = () => push('error', "You're offline — changes will wait.");
    const onOnline = () => push('success', 'Back online.');
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [push]);
  return null;
}

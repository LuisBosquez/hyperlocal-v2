import { useNavigate } from 'react-router-dom';

/** Full-height overlay panel anchored right (desktop) / full-screen (mobile),
 * sitting above the map+panel. Close returns to the map. */
export function OverlayScreen({ children, title }: { children: React.ReactNode; title?: string }) {
  const navigate = useNavigate();
  const close = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/map');
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={close} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-900 h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-b border-slate-100 dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
          <button onClick={close} className="text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 text-xl leading-none">
            ←
          </button>
          {title && <h1 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">{title}</h1>}
        </div>
        {children}
      </div>
    </div>
  );
}

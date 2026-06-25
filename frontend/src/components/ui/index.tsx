import { useEffect } from 'react';

export { toast, ToastHost, OfflineBanner } from './Toast';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-600 dark:text-zinc-300">{title}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-zinc-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        {title && (
          <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-800 px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{title}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-lg leading-none">
              ×
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: string;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {body && <p className="text-sm text-slate-600 dark:text-zinc-400 mb-4">{body}</p>}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
        >
          Never mind
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`px-4 py-2 text-sm rounded-full text-white ${
            destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-slate-800'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function Avatar({ user, size = 32 }: { user: { handle?: string | null; avatar_url?: string | null } | null; size?: number }) {
  const initial = (user?.handle || '?').charAt(0).toUpperCase();
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {initial}
    </div>
  );
}

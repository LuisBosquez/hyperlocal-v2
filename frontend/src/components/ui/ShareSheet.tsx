import { useCallback, useEffect, useState } from 'react';
import { Sheet, Spinner } from './index';

/**
 * Floating share dialog (J4.8 / J13). Lazily creates a share link when opened,
 * shows it in a read-only field with a Copy button, and offers the native share
 * sheet where available. Replaces the old silent clipboard-copy, which failed
 * on mobile / non-HTTPS origins where `navigator.clipboard` is unavailable.
 */
export function ShareSheet({
  open,
  onClose,
  getUrl,
  title = 'Share',
  subtitle,
  footnote,
}: {
  open: boolean;
  onClose: () => void;
  /** Lazily resolves the share URL (e.g. POST /invite-links → /invite/:token). */
  getUrl: () => Promise<string>;
  title?: string;
  subtitle?: string;
  footnote?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setStatus('loading');
    getUrl()
      .then((u) => !cancelled && (setUrl(u), setStatus('idle')))
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getUrl]);

  useEffect(() => {
    if (!open) {
      setUrl(null);
      setStatus('idle');
      setCopied(false);
      return;
    }
    return load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Insecure origin / no clipboard API — fall back to selecting the field.
      const el = document.getElementById('hl-share-input') as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
        try {
          document.execCommand('copy');
        } catch {
          /* user can still copy manually */
        }
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {subtitle && <p className="text-sm text-slate-500 dark:text-zinc-400 mb-3">{subtitle}</p>}

      {status === 'loading' && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400 dark:text-zinc-500">
          <Spinner /> Creating link…
        </div>
      )}

      {status === 'error' && (
        <div className="py-2">
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">Couldn’t create a share link.</p>
          <button
            onClick={load}
            className="px-4 py-2 text-sm rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
          >
            Try again
          </button>
        </div>
      )}

      {status === 'idle' && url && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              id="hl-share-input"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm text-slate-700 dark:text-zinc-200 font-mono"
            />
            <button
              onClick={copy}
              className="shrink-0 px-4 py-2 text-sm font-medium rounded-full bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-800"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>

          {canNativeShare && (
            <button
              onClick={() => navigator.share({ url, title }).catch(() => {})}
              className="w-full px-4 py-2 text-sm rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
            >
              Share via…
            </button>
          )}

          <p className="text-xs text-slate-400 dark:text-zinc-500">
            {footnote ?? 'Anyone with this link can open it — they’ll follow you when they sign up.'}
          </p>
        </div>
      )}
    </Sheet>
  );
}

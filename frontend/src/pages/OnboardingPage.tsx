import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { unwrap, apiError } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Spinner } from '../components/ui';
import type { AppUser } from '../types/api';

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

export default function OnboardingPage() {
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  const normalized = handle.trim().toLowerCase();
  const validFormat = HANDLE_RE.test(normalized);

  // Live availability check, debounced (J1.3 / P5)
  useEffect(() => {
    setAvailable(null);
    if (!validFormat) return;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await unwrap<{ available: boolean }>(
          api.get('/users/handle-check', { params: { handle: normalized } }),
        );
        setAvailable(res.available);
      } catch {
        /* ignore — server re-validates on submit */
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [normalized, validFormat]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuggestions([]);
    if (!validFormat) {
      setError('Handles are 3–30 chars: lowercase letters, numbers, underscores.');
      return;
    }
    setLoading(true);
    try {
      const user = await unwrap<AppUser>(
        api.post('/auth/onboard', { handle: normalized, display_name: displayName.trim() }),
      );
      setUser(user);
      const redirect = sessionStorage.getItem('hl_redirect');
      sessionStorage.removeItem('hl_redirect');
      navigate(redirect || '/map', { replace: true });
    } catch (e) {
      const err = apiError(e);
      if (err.code === 'CONFLICT') {
        setError('That handle is taken.');
        setSuggestions((err.fields?.suggestions as string[]) ?? []);
      } else {
        setError(err.message ?? 'Something went wrong.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white dark:bg-zinc-950">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 mb-1">Pick your handle</h1>
      <p className="text-slate-500 dark:text-zinc-500 mb-8 text-sm">This is how friends will find you.</p>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-400 mb-1">Handle</label>
          <div className="relative">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourhandle"
              autoFocus
              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <span className="absolute right-3 top-2.5 text-xs">
              {checking && <Spinner className="text-slate-400" />}
              {!checking && available === true && validFormat && <span className="text-emerald-500">available ✓</span>}
              {!checking && available === false && <span className="text-red-500">taken</span>}
            </span>
          </div>
          {handle && !validFormat && (
            <p className="text-xs text-amber-600 mt-1">3–30 chars: lowercase letters, numbers, underscores.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-400 mb-1">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Name"
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setHandle(s)}
                className="px-3 py-1 rounded-full text-xs bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || available === false || !validFormat}
          className="w-full py-2.5 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-slate-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving…' : 'Get started'}
        </button>
      </form>
    </div>
  );
}

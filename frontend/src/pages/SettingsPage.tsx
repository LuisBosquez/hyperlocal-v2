import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { authClient } from '../lib/authClient';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { toast, Spinner } from '../components/ui';
import type { AppUser } from '../types/api';

export default function SettingsPage() {
  const { user, signOut, setUser } = useAuthStore();
  const { darkMode, toggleDarkMode } = useUIStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: me } = useQuery<AppUser>({
    queryKey: queryKeys.me(),
    queryFn: () => unwrap(api.get('/users/me')),
  });

  const [form, setForm] = useState({
    display_name: '',
    bio: '',
    instagram_handle: '',
    twitter_handle: '',
    facebook_url: '',
    is_private: false,
  });

  useEffect(() => {
    if (me) {
      setForm({
        display_name: me.display_name ?? '',
        bio: me.bio ?? '',
        instagram_handle: me.instagram_handle ?? '',
        twitter_handle: me.twitter_handle ?? '',
        facebook_url: me.facebook_url ?? '',
        is_private: me.is_private ?? false,
      });
    }
  }, [me]);

  const save = useMutation({
    mutationFn: (patch: Partial<typeof form>) => unwrap<AppUser>(api.patch('/users/me', patch)),
    onSuccess: (updated) => {
      setUser(updated);
      qc.invalidateQueries({ queryKey: queryKeys.me() });
      if (updated.handle) qc.invalidateQueries({ queryKey: queryKeys.userProfile(updated.handle) });
      toast.success('Saved');
    },
    onError: () => toast.error("Couldn't save your changes."),
  });

  async function handleSignOut() {
    await authClient.signOut();
    signOut();
    navigate(authClient.isDev ? '/dev-login' : '/', { replace: true });
  }

  const field = 'w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 p-6">
      <div className="max-w-md mx-auto">
        <button onClick={() => navigate('/map')} className="text-sm text-slate-400 hover:text-slate-600 mb-4">
          ← Map
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 mb-6">Settings</h1>

        {!me ? (
          <Spinner className="text-slate-400" />
        ) : (
          <>
            <p className="text-sm text-slate-500 dark:text-zinc-500 mb-4">
              Signed in as <span className="font-medium text-slate-900 dark:text-zinc-100">@{me.handle}</span>
            </p>

            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Display name</label>
                <input className={field} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Bio</label>
                <textarea className={field} rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Instagram handle</label>
                <input className={field} value={form.instagram_handle} onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })} placeholder="username" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">X / Twitter handle</label>
                <input className={field} value={form.twitter_handle} onChange={(e) => setForm({ ...form, twitter_handle: e.target.value })} placeholder="username" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Facebook URL</label>
                <input className={field} value={form.facebook_url} onChange={(e) => setForm({ ...form, facebook_url: e.target.value })} placeholder="https://facebook.com/…" />
              </div>
              <button
                onClick={() => save.mutate(form)}
                disabled={save.isPending}
                className="px-4 py-2 rounded-full text-sm bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-50"
              >
                Save profile
              </button>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-slate-100 dark:border-zinc-800">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">Private profile</p>
                <p className="text-xs text-slate-500 dark:text-zinc-500">Hide your places from non-followers.</p>
              </div>
              <Toggle
                on={form.is_private}
                onChange={(v) => {
                  setForm({ ...form, is_private: v });
                  save.mutate({ is_private: v });
                }}
              />
            </div>

            <div className="flex items-center justify-between py-3 border-t border-slate-100 dark:border-zinc-800">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">Dark mode</p>
              </div>
              <Toggle on={darkMode} onChange={toggleDarkMode} />
            </div>

            <button
              onClick={handleSignOut}
              className="mt-6 px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-sm font-medium"
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-zinc-700'}`}
      role="switch"
      aria-checked={on}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

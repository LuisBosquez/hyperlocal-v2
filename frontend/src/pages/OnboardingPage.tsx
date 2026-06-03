import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

export default function OnboardingPage() {
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) { setError('Handle is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/onboard', { handle: handle.trim(), display_name: displayName.trim() });
      setUser(res.data.data);
      navigate('/map', { replace: true });
    } catch {
      setError('That handle might already be taken. Try another.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white dark:bg-zinc-950">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 mb-1">Pick your handle</h1>
      <p className="text-slate-500 dark:text-zinc-500 mb-8 text-sm">This is how friends will find you.</p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-400 mb-1">Handle</label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="yourhandle"
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-zinc-400 mb-1">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Name"
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-zinc-500"
          />
        </div>
        {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-slate-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving…' : 'Get started'}
        </button>
      </form>
    </div>
  );
}

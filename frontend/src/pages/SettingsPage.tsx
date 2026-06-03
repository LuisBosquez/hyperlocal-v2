import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';

export default function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const { darkMode, toggleDarkMode } = useUIStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 p-8 max-w-md">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 mb-6">Settings</h1>

      {user && (
        <div className="mb-6">
          <p className="text-sm text-slate-500 dark:text-zinc-500">Signed in as</p>
          <p className="font-medium text-slate-900 dark:text-zinc-100">@{user.handle}</p>
        </div>
      )}

      {/* Dark mode toggle */}
      <div className="mb-6 flex items-center justify-between py-3 border-b border-slate-100 dark:border-zinc-800">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">Dark mode</p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">Easy on the eyes</p>
        </div>
        <button
          onClick={toggleDarkMode}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            darkMode ? 'bg-zinc-700' : 'bg-slate-200'
          }`}
          role="switch"
          aria-checked={darkMode}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              darkMode ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <button
        onClick={handleSignOut}
        className="px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-sm font-medium transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

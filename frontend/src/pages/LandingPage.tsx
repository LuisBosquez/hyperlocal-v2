import { supabase } from '../lib/supabase';

export default function LandingPage() {
  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-zinc-950 px-4">
      <h1 className="text-4xl font-bold text-slate-900 dark:text-zinc-100 mb-2">Hyperlocal</h1>
      <p className="text-slate-500 dark:text-zinc-500 mb-10 text-center max-w-sm">
        Create community anywhere, anytime.
      </p>
      <button
        onClick={handleSignIn}
        className="px-6 py-3 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium hover:bg-slate-700 dark:hover:bg-zinc-300 transition-colors"
      >
        Sign in with Google
      </button>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { authClient } from '../lib/authClient';

export default function LandingPage() {
  const navigate = useNavigate();

  async function signIn() {
    if (authClient.isDev) {
      navigate('/dev-login');
      return;
    }
    await authClient.signInGoogle();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-zinc-950 px-4">
      <h1 className="text-4xl font-bold text-slate-900 dark:text-zinc-100 mb-2">Hyperlocal</h1>
      <p className="text-slate-500 dark:text-zinc-500 mb-2 text-center max-w-sm">Create community anywhere, anytime.</p>
      <p className="text-slate-400 dark:text-zinc-600 mb-10 text-center max-w-md text-sm">
        Save places you’re curious about, turn them into loose plans, and let friends opt in — no group-chat
        gymnastics required.
      </p>
      <button
        onClick={signIn}
        className="px-6 py-3 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium hover:bg-slate-700 dark:hover:bg-zinc-300 transition-colors"
      >
        {authClient.isDev ? 'Enter (dev sign in)' : 'Sign in with Google'}
      </button>
    </div>
  );
}

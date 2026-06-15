import { useParams, Link } from 'react-router-dom';
import { usePublicProfile, usePublicPlans } from '../hooks/usePublicProfile';

function formatDateTime(date: string | null, time: string | null): string {
  if (!date) return 'Date TBD';
  const d = new Date(date);
  const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (!time) return dayStr;
  const [h, m] = time.split(':').map(Number);
  const t = new Date();
  t.setHours(h, m);
  return `${dayStr} · ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export default function PublicProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { data: profile, isLoading: profileLoading } = usePublicProfile(handle);
  const { data: plans, isLoading: plansLoading } = usePublicPlans(handle);

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-slate-400 dark:text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500 dark:text-zinc-400 text-lg">User not found.</p>
        <Link to="/" className="text-indigo-600 hover:underline text-sm">← Back to Hyperlocal</Link>
      </div>
    );
  }

  const upcomingPlans = (plans ?? []).filter((p) => !p.is_cancelled);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      {/* Top bar */}
      <div className="border-b border-slate-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-slate-900 dark:text-zinc-100 text-sm tracking-tight">Hyperlocal</span>
        <Link
          to="/"
          className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          Sign up free
        </Link>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-8 pb-20">
        {/* Profile header */}
        <div className="flex items-center gap-4 mb-6">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name ?? handle}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-300 text-2xl font-bold">
              {(profile.display_name ?? handle ?? '?')[0].toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">
              {profile.display_name ?? handle}
            </h1>
            <p className="text-slate-500 dark:text-zinc-500 text-sm">@{profile.handle}</p>
          </div>
        </div>

        {profile.bio && (
          <p className="text-slate-700 dark:text-zinc-300 text-sm mb-8">{profile.bio}</p>
        )}

        {/* Plans section */}
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100 mb-4">
            Upcoming plans
          </h2>

          {plansLoading ? (
            <p className="text-slate-400 dark:text-zinc-600 text-sm">Loading plans…</p>
          ) : upcomingPlans.length === 0 ? (
            <p className="text-slate-400 dark:text-zinc-600 text-sm">No upcoming plans yet.</p>
          ) : (
            <div className="space-y-3">
              {upcomingPlans.map((plan) => (
                <Link key={plan.id} to={`/p/${plan.id}`} className="block group">
                  <div className="border border-slate-100 dark:border-zinc-800 rounded-xl p-4 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                    <p className="text-sm font-medium text-slate-900 dark:text-zinc-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {plan.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-zinc-500 mb-2">
                      {formatDateTime(plan.plan_date, plan.plan_time)}
                    </p>
                    {plan.place_name ? (
                      <p className="text-xs text-slate-600 dark:text-zinc-400">📍 {plan.place_name}</p>
                    ) : plan.place_neighbourhood ? (
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs text-slate-500 dark:text-zinc-500">
                          📍 {plan.place_neighbourhood} ·{' '}
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                            Sign up to see venue
                          </span>
                        </p>
                      </div>
                    ) : null}
                    {plan.join_count > 0 && (
                      <p className="text-xs text-slate-400 dark:text-zinc-600 mt-2">
                        {plan.join_count} {plan.join_count === 1 ? 'person' : 'people'} going
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Sign-up CTA */}
        <div className="mt-10 border border-indigo-100 dark:border-indigo-900 rounded-xl p-5 bg-indigo-50 dark:bg-indigo-950/30 text-center">
          <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100 mb-1">
            Want to join a plan?
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mb-4">
            Sign up free to see full venue details, join plans, and share your own.
          </p>
          <Link
            to="/"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            Create your Hyperlocal profile →
          </Link>
        </div>
      </div>
    </div>
  );
}

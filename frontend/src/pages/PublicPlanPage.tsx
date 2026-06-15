import { useParams, Link } from 'react-router-dom';
import { usePublicPlan } from '../hooks/usePublicProfile';

function formatDateTime(date: string | null, time: string | null): string {
  if (!date) return 'Date TBD';
  const d = new Date(date);
  const dayStr = d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  if (!time) return dayStr;
  const [h, m] = time.split(':').map(Number);
  const t = new Date();
  t.setHours(h, m);
  return `${dayStr} at ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export default function PublicPlanPage() {
  const { planId } = useParams<{ planId: string }>();
  const { data: plan, isLoading } = usePublicPlan(planId);

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

      <div className="max-w-xl mx-auto px-4 pt-10 pb-20">
        {isLoading ? (
          <div className="flex items-center justify-center pt-20">
            <p className="text-slate-400 dark:text-zinc-500">Loading…</p>
          </div>
        ) : !plan ? (
          <div className="flex flex-col items-center gap-4 pt-20">
            <p className="text-slate-500 dark:text-zinc-400 text-lg">Plan not found.</p>
            <Link to="/" className="text-indigo-600 hover:underline text-sm">← Back to Hyperlocal</Link>
          </div>
        ) : plan.is_cancelled ? (
          <div className="flex flex-col items-center gap-4 pt-20">
            <p className="text-slate-500 dark:text-zinc-400 text-lg">This plan has been cancelled.</p>
            <Link to={`/u/${plan.organizer_handle}`} className="text-indigo-600 hover:underline text-sm">
              ← See {plan.organizer_display_name ?? `@${plan.organizer_handle}`}'s other plans
            </Link>
          </div>
        ) : (
          <>
            {/* Plan header */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 mb-2">
                {plan.title}
              </h1>

              {plan.description && (
                <p className="text-slate-600 dark:text-zinc-400 text-sm mb-4">{plan.description}</p>
              )}

              {/* Organizer */}
              <Link
                to={`/u/${plan.organizer_handle}`}
                className="inline-flex items-center gap-2 mb-6"
              >
                {plan.organizer_avatar_url ? (
                  <img
                    src={plan.organizer_avatar_url}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-300 text-xs font-bold">
                    {(plan.organizer_display_name ?? plan.organizer_handle)[0].toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-slate-500 dark:text-zinc-400">
                  Organized by{' '}
                  <span className="text-slate-800 dark:text-zinc-200 font-medium">
                    {plan.organizer_display_name ?? `@${plan.organizer_handle}`}
                  </span>
                </span>
              </Link>

              {/* Date/time */}
              <div className="border border-slate-100 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">📅</span>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-0.5">When</p>
                    <p className="text-sm text-slate-800 dark:text-zinc-200">
                      {formatDateTime(plan.plan_date, plan.plan_time)}
                    </p>
                  </div>
                </div>

                {/* Venue — gated */}
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">📍</span>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-0.5">Where</p>
                    {plan.place_name ? (
                      <>
                        <p className="text-sm text-slate-800 dark:text-zinc-200 font-medium">{plan.place_name}</p>
                        {plan.place_address && (
                          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">{plan.place_address}</p>
                        )}
                      </>
                    ) : plan.place_neighbourhood ? (
                      <div>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">{plan.place_neighbourhood}</p>
                        <div className="mt-2 inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-lg px-2 py-1">
                          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                            🔒 Sign up to unlock the exact venue
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 dark:text-zinc-600">Venue TBD</p>
                    )}
                  </div>
                </div>

                {/* Attendees */}
                {plan.join_count > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-lg">👥</span>
                    <p className="text-sm text-slate-600 dark:text-zinc-400">
                      <span className="font-medium text-slate-800 dark:text-zinc-200">{plan.join_count}</span>{' '}
                      {plan.join_count === 1 ? 'person' : 'people'} going
                      {plan.interest_count > 0 && `, ${plan.interest_count} interested`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="border border-indigo-100 dark:border-indigo-900 rounded-xl p-5 bg-indigo-50 dark:bg-indigo-950/30 text-center">
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100 mb-1">
                Want to join this plan?
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mb-4">
                Create a free Hyperlocal account to see the venue, join the plan, and discover where friends hang out.
              </p>
              <Link
                to="/"
                className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                Join Hyperlocal — it's free →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

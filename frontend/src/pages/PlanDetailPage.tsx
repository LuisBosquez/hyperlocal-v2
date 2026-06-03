import { useParams } from 'react-router-dom';
import { usePlanDetail } from '../hooks/usePlans';

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const { data: plan, isLoading } = usePlanDetail(planId ?? '');

  if (isLoading) return <div className="min-h-screen bg-white dark:bg-zinc-950 p-8 text-slate-400 dark:text-zinc-500">Loading…</div>;
  if (!plan) return <div className="min-h-screen bg-white dark:bg-zinc-950 p-8 text-slate-400 dark:text-zinc-500">Plan not found.</div>;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 p-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">Plan Detail</h1>
      <pre className="mt-4 text-sm bg-slate-50 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 p-4 rounded-lg overflow-auto">
        {JSON.stringify(plan, null, 2)}
      </pre>
    </div>
  );
}

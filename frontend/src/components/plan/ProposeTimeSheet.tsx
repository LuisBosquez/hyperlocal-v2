import { useState } from 'react';
import type { OpeningPeriod, TimeProposalOption } from '../../types/api';
import { Sheet, toast } from '../ui';
import { WhenFields, type WhenSelection } from './PlanComposer';
import { formatDate, formatTime, bandLabel } from '../../lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  openingHours?: OpeningPeriod[] | null;
  submitting?: boolean;
  onSubmit: (vars: { options: TimeProposalOption[]; expires_in_days: number }) => void;
}

const EXPIRY_CHOICES = [
  { label: '1 day', days: 1 },
  { label: '2 days', days: 2 },
  { label: '1 week', days: 7 },
];

const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-sm font-medium ${
    active
      ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
      : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
  }`;

function optionLabel(o: TimeProposalOption): string {
  const d = formatDate(o.plan_date);
  if (o.plan_time) return `${d} · ${formatTime(o.plan_time)}`;
  if (o.plan_time_band) return `${d} · ${bandLabel(o.plan_time_band)}`;
  return d;
}

/**
 * Flow 4.3: a friend proposes one or more time options on a friend's un-timed plan.
 * Each option is built with the shared WhenFields picker; the organizer picks one.
 */
export function ProposeTimeSheet({ open, onClose, openingHours, submitting, onSubmit }: Props) {
  const [options, setOptions] = useState<TimeProposalOption[]>([]);
  const [current, setCurrent] = useState<WhenSelection>({ date: null, time: null, band: null });
  const [pickerKey, setPickerKey] = useState(0); // remount WhenFields to reset it after "Add"
  const [expiryDays, setExpiryDays] = useState(2);

  function currentOption(): TimeProposalOption | null {
    if (!current.date || (!current.time && !current.band)) return null;
    return { plan_date: current.date, plan_time: current.time, plan_time_band: current.band };
  }

  function addOption() {
    const opt = currentOption();
    if (!opt) {
      toast.error('Pick a date and a time (or a time of day).');
      return;
    }
    setOptions((o) => [...o, opt]);
    setCurrent({ date: null, time: null, band: null });
    setPickerKey((k) => k + 1);
  }

  function send() {
    const all = [...options];
    const inProgress = currentOption();
    if (inProgress) all.push(inProgress);
    if (all.length === 0) {
      toast.error('Add at least one time option.');
      return;
    }
    onSubmit({ options: all, expires_in_days: expiryDays });
  }

  return (
    <Sheet open={open} onClose={onClose} title="Propose times">
      <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3">
        Suggest one or more times — the organizer picks one to lock it in.
      </p>

      {options.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {options.map((o, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs"
            >
              {optionLabel(o)}
              <button
                onClick={() => setOptions((arr) => arr.filter((_, idx) => idx !== i))}
                className="text-base leading-none hover:text-indigo-900 dark:hover:text-indigo-100"
                aria-label="Remove option"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-slate-100 dark:border-zinc-800 p-3 mb-4">
        <WhenFields key={pickerKey} openingHours={openingHours} onChange={setCurrent} />
        <button
          onClick={addOption}
          className="text-xs px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200"
        >
          + Add another option
        </button>
      </div>

      <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-2">These options expire in</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {EXPIRY_CHOICES.map((c) => (
          <button key={c.days} onClick={() => setExpiryDays(c.days)} className={pill(expiryDays === c.days)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={send}
          disabled={submitting}
          className="px-4 py-2 text-sm rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Send proposal
        </button>
      </div>
    </Sheet>
  );
}

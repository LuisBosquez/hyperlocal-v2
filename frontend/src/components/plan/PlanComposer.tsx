import { useState } from 'react';
import type { OpeningPeriod, TimeBand } from '../../types/api';
import { Sheet, toast } from '../ui';
import { todayISO, addDaysISO, nextWeekendISO, timeSlotsFor, formatTime, formatDate } from '../../lib/format';

export interface WhenSelection {
  date: string | null;
  time: string | null;
  band: TimeBand | null;
}

type DateChoice = 'today' | 'tomorrow' | 'weekend' | 'custom';
const BANDS: TimeBand[] = ['morning', 'afternoon', 'evening'];

const pillCls = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-sm font-medium ${
    active
      ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
      : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
  }`;

/**
 * The shared date + time-tier picker. Time goes generic → specific: pick a coarse
 * band (Morning/Afternoon/Evening) or "Set a time" for exact 15/30-min slots.
 * Emits the current {date, time, band} up via onChange. Used by PlanComposer
 * (create/materialize) and ProposeTimeSheet (one option at a time).
 */
export function WhenFields({
  openingHours,
  fixedDate,
  onChange,
}: {
  openingHours?: OpeningPeriod[] | null;
  fixedDate?: string | null;
  onChange: (sel: WhenSelection) => void;
}) {
  const [dateChoice, setDateChoice] = useState<DateChoice | null>(fixedDate ? 'custom' : null);
  const [customDate, setCustomDate] = useState(fixedDate ?? '');
  const [sel, setSel] = useState<WhenSelection>({ date: fixedDate ?? null, time: null, band: null });
  const [exactOpen, setExactOpen] = useState(false);
  const [granularity, setGranularity] = useState<15 | 30>(30);

  function patch(p: Partial<WhenSelection>) {
    const next = { ...sel, ...p };
    setSel(next);
    onChange(next);
  }

  function pickDate(choice: DateChoice, value?: string) {
    const date =
      choice === 'today' ? todayISO()
      : choice === 'tomorrow' ? addDaysISO(1)
      : choice === 'weekend' ? nextWeekendISO()
      : (value ?? '');
    setDateChoice(choice);
    setExactOpen(false);
    patch({ date: date || null, time: null, band: null });
  }

  const resolvedDate = sel.date;
  const isToday = resolvedDate === todayISO();
  const slots = resolvedDate ? timeSlotsFor(openingHours, resolvedDate, granularity) : [];
  const closedThatDay = !!resolvedDate && (openingHours?.length ?? 0) > 0 && slots.length === 0;
  const now = new Date();
  const nowHHMM = now.getHours() * 100 + now.getMinutes();
  const usableSlots = isToday
    ? slots.filter((s) => {
        const [h, m] = s.split(':').map(Number);
        return h * 100 + m > nowHHMM;
      })
    : slots;

  return (
    <>
      {!fixedDate && (
        <>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-2">When?</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button className={pillCls(dateChoice === 'today')} onClick={() => pickDate('today')}>Today</button>
            <button className={pillCls(dateChoice === 'tomorrow')} onClick={() => pickDate('tomorrow')}>Tomorrow</button>
            <button className={pillCls(dateChoice === 'weekend')} onClick={() => pickDate('weekend')}>This weekend</button>
            <button className={pillCls(dateChoice === 'custom')} onClick={() => setDateChoice('custom')}>Pick a date</button>
          </div>
          {dateChoice === 'custom' && (
            <input
              type="date"
              min={todayISO()}
              value={customDate}
              onChange={(e) => { setCustomDate(e.target.value); pickDate('custom', e.target.value); }}
              className="mb-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm text-slate-900 dark:text-zinc-100"
            />
          )}
        </>
      )}

      {resolvedDate && (
        <>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-2">
            {fixedDate ? formatDate(resolvedDate) : 'What time?'}
          </p>
          {/* Generic → specific: coarse bands or an exact time */}
          <div className="flex flex-wrap gap-2 mb-3">
            {BANDS.map((b) => (
              <button
                key={b}
                className={`${pillCls(sel.band === b)} capitalize`}
                onClick={() => { setExactOpen(false); patch({ band: b, time: null }); }}
              >
                {b}
              </button>
            ))}
            <button
              className={pillCls(exactOpen || sel.time !== null)}
              onClick={() => { setExactOpen(true); patch({ band: null }); }}
            >
              Set a time
            </button>
          </div>

          {exactOpen && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-400 dark:text-zinc-500">Pick a slot</p>
                <button
                  className="text-xs text-indigo-500 hover:underline"
                  onClick={() => setGranularity((g) => (g === 30 ? 15 : 30))}
                >
                  {granularity === 30 ? '15-min steps' : '30-min steps'}
                </button>
              </div>
              {closedThatDay ? (
                <p className="text-sm text-amber-600 dark:text-amber-500 mb-3">Closed on this day — pick another date.</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto mb-3">
                  {usableSlots.map((s) => (
                    <button
                      key={s}
                      onClick={() => patch({ time: s, band: null })}
                      className={`px-1 py-1.5 rounded text-xs ${
                        sel.time === s
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {formatTime(s)}
                    </button>
                  ))}
                  {usableSlots.length === 0 && !closedThatDay && (
                    <p className="col-span-4 text-xs text-slate-400">No remaining times today.</p>
                  )}
                </div>
              )}
            </>
          )}
          {(openingHours?.length ?? 0) === 0 && (
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-3">
              Hours unknown — double-check before you go.
            </p>
          )}
        </>
      )}
    </>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  openingHours?: OpeningPeriod[] | null;
  initialDate?: string | null;
  submitting?: boolean;
  onSubmit: (vars: { plan_date: string | null; plan_time: string | null; plan_time_band: TimeBand | null; is_timeless: boolean }) => void;
  allowTimeless?: boolean;
  title?: string;
}

export function PlanComposer({
  open,
  onClose,
  openingHours,
  initialDate,
  submitting,
  onSubmit,
  allowTimeless = true,
  title,
}: Props) {
  const [sel, setSel] = useState<WhenSelection>({ date: initialDate ?? null, time: null, band: null });
  const isToday = sel.date === todayISO();

  function submit(timeless: boolean) {
    if (timeless) {
      onSubmit({ plan_date: null, plan_time: null, plan_time_band: null, is_timeless: true });
      return;
    }
    if (!sel.date) {
      toast.error('Pick a date first.');
      return;
    }
    if (isToday && !sel.time && !sel.band) {
      toast.error('Pick a time for today.');
      return;
    }
    onSubmit({ plan_date: sel.date, plan_time: sel.time, plan_time_band: sel.band, is_timeless: false });
  }

  return (
    <Sheet open={open} onClose={onClose} title={title ?? (initialDate ? 'Add a time' : 'Create a plan')}>
      <WhenFields openingHours={openingHours} fixedDate={initialDate ?? undefined} onChange={setSel} />

      <div className="flex gap-2 justify-end pt-1 flex-wrap">
        {allowTimeless && !initialDate && (
          <button
            onClick={() => submit(true)}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200"
          >
            Just save as “Want to go”
          </button>
        )}
        {sel.date && !isToday && !initialDate && (
          <button
            onClick={() => onSubmit({ plan_date: sel.date, plan_time: null, plan_time_band: null, is_timeless: false })}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-200"
          >
            Skip time for now
          </button>
        )}
        <button
          onClick={() => submit(false)}
          disabled={submitting || !sel.date}
          className="px-4 py-2 text-sm rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {initialDate ? 'Set time' : 'Create plan'}
        </button>
      </div>
    </Sheet>
  );
}

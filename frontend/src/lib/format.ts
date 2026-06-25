import type { OpeningPeriod, PlanState, TimeBand } from '../types/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Coarse time-band labels (M-D19). Lowercase reads naturally inside a "when" string. */
export const BAND_LABELS: Record<TimeBand, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
};

export function bandLabel(band: TimeBand | null | undefined): string {
  return band ? BAND_LABELS[band] : '';
}

/** "Sat, Jun 14" */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return `${DAYS[d.getDay()]}, ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** "6:00 PM" from "18:00" */
export function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatPlanWhen(
  date: string | null,
  time: string | null,
  state: PlanState,
  band?: TimeBand | null,
): string {
  if (state === 'timeless') return 'Want to go';
  if (state === 'tentative') return `${formatDate(date)} · add a time`;
  if (time) return `${formatDate(date)} · ${formatTime(time)}`;
  if (band) return `${formatDate(date)} · ${bandLabel(band)}`;
  return formatDate(date);
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

/** Returns "closes in Xhr" or "closes in less than 1hr", or null if hours are unknown. */
export function closingHint(periods: OpeningPeriod[] | null | undefined): string | null {
  if (!periods?.length) return null;
  const now = new Date();
  const todayDay = now.getDay();
  const nowHHMM = now.getHours() * 100 + now.getMinutes();

  for (const p of periods) {
    if (!p.close) continue;
    const oDay = p.open.day;
    const cDay = p.close.day;
    const oT = parseInt(p.open.time, 10);
    const cT = parseInt(p.close.time, 10);
    const overnight = cDay !== oDay || cT <= oT;

    let inPeriod = false;
    if (oDay === todayDay && !overnight && nowHHMM >= oT && nowHHMM < cT) inPeriod = true;
    if (oDay === todayDay && overnight && nowHHMM >= oT) inPeriod = true;
    if (overnight && todayDay === (oDay + 1) % 7 && nowHHMM < cT) inPeriod = true;
    if (!inPeriod) continue;

    const closeDate = new Date(now);
    closeDate.setHours(Math.floor(cT / 100), cT % 100, 0, 0);
    if (closeDate <= now) closeDate.setDate(closeDate.getDate() + 1);

    const hoursLeft = (closeDate.getTime() - now.getTime()) / 3_600_000;
    if (hoursLeft < 1) return 'closes in less than 1hr';
    return `closes in ${Math.floor(hoursLeft)}hr`;
  }
  return null;
}

/** Today, in the browser's local date — yyyy-mm-dd. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Next Saturday (or the one after, if today is already the weekend). */
export function nextWeekendISO(): string {
  const d = new Date();
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  let add = (6 - dow + 7) % 7;
  if (add < 2) add += 7;
  return addDaysISO(add);
}

/**
 * Generate selectable time slots (HH:MM) within a place's opening hours for a
 * given date, at the requested granularity. Empty array = closed that day.
 * Mirrors the backend's _within_opening_hours so the picker only offers valid times.
 */
export function timeSlotsFor(
  periods: OpeningPeriod[] | null | undefined,
  dateISO: string,
  stepMinutes: 15 | 30 = 30,
): string[] {
  const date = new Date(dateISO + 'T00:00:00');
  const gday = date.getDay();
  const slots: string[] = [];

  const open = (hhmm: number) => {
    if (!periods || periods.length === 0) return true; // unknown hours — allow all (P9)
    for (const p of periods) {
      if (!p.open) continue;
      const oDay = p.open.day;
      const oT = parseInt(p.open.time, 10);
      if (!p.close) {
        if (oDay === gday && hhmm >= oT) return true;
        continue;
      }
      const cDay = p.close.day;
      const cT = parseInt(p.close.time, 10);
      const overnight = cDay !== oDay || cT <= oT;
      if (oDay === gday) {
        if (!overnight && oT <= hhmm && hhmm < cT) return true;
        if (overnight && hhmm >= oT) return true;
      }
      if (overnight && gday === (oDay + 1) % 7 && hhmm < cT) return true;
    }
    return false;
  };

  for (let mins = 0; mins < 24 * 60; mins += stepMinutes) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (open(h * 100 + m)) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

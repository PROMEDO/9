/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AvailabilitySchedule, AvailabilityWindow, Category, MenuItem } from '../types';

export const AVAILABILITY_DAYS = [
  { key: 'sat', label: 'السبت', short: 'السبت' },
  { key: 'sun', label: 'الأحد', short: 'الأحد' },
  { key: 'mon', label: 'الإثنين', short: 'الإثنين' },
  { key: 'tue', label: 'الثلاثاء', short: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء', short: 'الأربعاء' },
  { key: 'thu', label: 'الخميس', short: 'الخميس' },
  { key: 'fri', label: 'الجمعة', short: 'الجمعة' },
] as const;

export function getAvailabilityDays() {
  return AVAILABILITY_DAYS;
}

export const AVAILABILITY_PRESETS: Array<{ label: string; from: string; to: string }> = [
  { label: 'فطور (6 ص - 12 م)', from: '06:00', to: '12:00' },
  { label: 'غداء (12 م - 5 م)', from: '12:00', to: '17:00' },
  { label: 'عشاء (6 م - 12 ص)', from: '18:00', to: '23:59' },
  { label: 'سهرة (9 م - 3 ص)', from: '21:00', to: '03:00' },
];

export function getAvailabilityPresets(): Array<{ label: string; from: string; to: string }> {
  return AVAILABILITY_PRESETS;
}

export const DEFAULT_AVAILABILITY_SCHEDULE: AvailabilitySchedule = {
  enabled: false,
  from: '08:00',
  to: '12:00',
  windows: [{ from: '08:00', to: '12:00' }],
  days: [],
  behavior: 'badge',
};

const JS_DAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const VALID_DAY_SET = new Set<string>(JS_DAY_TO_KEY);

function normalizeTimeStr(raw: unknown, fallback = '08:00'): string {
  const s = String(raw || '').trim();
  const match = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return fallback;
  const h = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const m = Math.min(59, Math.max(0, Number(match[2]) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  return (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
}

export function formatHhmm12(hhmm: string | undefined): string {
  const raw = String(hhmm || '').trim();
  if (!raw) return '';
  const [hRaw, mRaw] = raw.split(':').map(Number);
  if (Number.isNaN(hRaw)) return raw;
  const h24 = Math.min(23, Math.max(0, hRaw));
  const m = Number.isNaN(mRaw) ? 0 : Math.min(59, Math.max(0, mRaw));
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const period = h24 >= 12 ? 'م' : 'ص';
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getScheduleWindows(schedule?: AvailabilitySchedule | null): AvailabilityWindow[] {
  if (!schedule) return [];
  if (Array.isArray(schedule.windows) && schedule.windows.length > 0) {
    return schedule.windows
      .map((w) => ({
        from: normalizeTimeStr(w?.from, '08:00'),
        to: normalizeTimeStr(w?.to, '12:00'),
      }))
      .slice(0, 3);
  }
  return [
    {
      from: normalizeTimeStr(schedule.from, '08:00'),
      to: normalizeTimeStr(schedule.to, '12:00'),
    },
  ];
}

export function normalizeAvailabilitySchedule(raw?: any): AvailabilitySchedule {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AVAILABILITY_SCHEDULE, windows: [{ from: '08:00', to: '12:00' }], days: [] };
  }
  const windows = getScheduleWindows(raw);
  const first = windows[0] || { from: '08:00', to: '12:00' };
  const days: string[] = Array.isArray(raw.days)
    ? Array.from(
        new Set<string>(
          raw.days.map((d: unknown) => String(d)).filter((d: string) => VALID_DAY_SET.has(d))
        )
      )
    : [];
  const behavior: 'badge' | 'hide' = raw.behavior === 'hide' ? 'hide' : 'badge';

  return {
    enabled: Boolean(raw.enabled),
    from: first.from,
    to: first.to,
    windows,
    days,
    behavior,
  };
}

export function sanitizeAvailabilityScheduleForSave(raw?: AvailabilitySchedule | null): AvailabilitySchedule | undefined {
  if (!raw || !raw.enabled) return undefined;
  const norm = normalizeAvailabilitySchedule(raw);
  const windows = getScheduleWindows(norm);
  const first = windows[0] || { from: '08:00', to: '12:00' };
  return {
    enabled: true,
    from: first.from,
    to: first.to,
    ...(windows.length > 1 ? { windows } : { windows: [first] }),
    ...(norm.days && norm.days.length > 0 && norm.days.length < 7 ? { days: norm.days } : {}),
    behavior: norm.behavior === 'hide' ? 'hide' : 'badge',
  };
}

export function formatTime12(hhmm?: string): string {
  return formatHhmm12(normalizeTimeStr(hhmm, '08:00'));
}

export function formatTime12Ar(hhmm?: string): string {
  return formatTime12(hhmm);
}

export function formatWindowsBadge(schedule?: AvailabilitySchedule | null): string {
  if (!schedule) return '';
  const windows = getScheduleWindows(schedule);
  if (windows.length === 0) return '';
  return windows.map((w) => `${formatTime12(w.from)} - ${formatTime12(w.to)}`).join(' · ');
}

export function formatScheduleLabel(schedule?: AvailabilitySchedule | null): string {
  if (!schedule || !schedule.enabled) return '';
  const timesText = formatWindowsBadge(schedule);
  const days = Array.isArray(schedule.days) ? schedule.days.filter((d) => VALID_DAY_SET.has(d)) : [];
  if (days.length > 0 && days.length < 7) {
    const dayLabels = AVAILABILITY_DAYS.filter((d) => days.includes(d.key)).map((d) => d.short);
    return `${timesText} (${dayLabels.join('، ')})`;
  }
  return timesText;
}

export function isWithinAvailabilitySchedule(
  schedule?: AvailabilitySchedule | null,
  nowDate: Date = new Date()
): boolean {
  if (!schedule || !schedule.enabled) return true;

  const windows = getScheduleWindows(schedule);
  if (windows.length === 0) return true;

  const days = Array.isArray(schedule.days)
    ? schedule.days.filter((d) => VALID_DAY_SET.has(d))
    : [];
  const hasDayRestriction = days.length > 0 && days.length < 7;

  const curMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  const todayIdx = nowDate.getDay(); // 0=sun..6=sat
  const todayKey = JS_DAY_TO_KEY[todayIdx];
  const yesterdayKey = JS_DAY_TO_KEY[(todayIdx + 6) % 7];

  for (const win of windows) {
    const fromMin = toMinutes(win.from);
    const toMin = toMinutes(win.to);

    if (fromMin === toMin) {
      if (!hasDayRestriction || days.includes(todayKey)) return true;
      continue;
    }

    if (fromMin < toMin) {
      const inRange = toMin === 1439 ? curMinutes >= fromMin && curMinutes <= toMin : curMinutes >= fromMin && curMinutes < toMin;
      if (inRange && (!hasDayRestriction || days.includes(todayKey))) {
        return true;
      }
    } else {
      // Overnight window (e.g. 21:00 -> 03:00)
      if (curMinutes >= fromMin) {
        if (!hasDayRestriction || days.includes(todayKey)) return true;
      } else if (curMinutes < toMin) {
        if (!hasDayRestriction || days.includes(yesterdayKey)) return true;
      }
    }
  }

  return false;
}

export interface CategoryAvailabilityResult {
  available: boolean;
  hidden: boolean;
  outOfSchedule: boolean;
  hasSchedule: boolean;
  badgeText: string;
  reasonText: string;
}

export function evaluateCategoryAvailability(
  cat?: Category | null,
  nowDate: Date = new Date()
): CategoryAvailabilityResult {
  if (!cat) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: false,
      badgeText: '',
      reasonText: '',
    };
  }
  if (cat.published === false) {
    return {
      available: false,
      hidden: true,
      outOfSchedule: false,
      hasSchedule: Boolean(cat.availabilitySchedule?.enabled),
      badgeText: '',
      reasonText: 'هذا القسم غير متاح حالياً',
    };
  }
  const sched = cat.availabilitySchedule;
  if (!sched || !sched.enabled) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: false,
      badgeText: '',
      reasonText: '',
    };
  }

  const label = formatScheduleLabel(sched);
  const inWindow = isWithinAvailabilitySchedule(sched, nowDate);
  if (inWindow) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: true,
      badgeText: formatWindowsBadge(sched),
      reasonText: '',
    };
  }

  const hideOutside = sched.behavior === 'hide';
  return {
    available: false,
    hidden: hideOutside,
    outOfSchedule: true,
    hasSchedule: true,
    badgeText: formatWindowsBadge(sched),
    reasonText: `قسم "${cat.n}" متوفر فقط في الأوقات: ${label}`,
  };
}

export interface ItemAvailabilityResult {
  available: boolean;
  hidden: boolean;
  outOfSchedule: boolean;
  hasSchedule: boolean;
  badgeText: string;
  reasonText: string;
  source: 'manual' | 'category' | 'item' | null;
}

export function evaluateItemAvailability(
  item: MenuItem,
  cat?: Category | null,
  nowDate: Date = new Date()
): ItemAvailabilityResult {
  if (item.published === false || item.available === false) {
    return {
      available: false,
      hidden: true,
      outOfSchedule: false,
      hasSchedule: Boolean(item.availabilitySchedule?.enabled),
      badgeText: 'غير متوفر',
      reasonText: 'هذا الصنف غير متوفر حالياً',
      source: 'manual',
    };
  }

  const catEval = evaluateCategoryAvailability(cat, nowDate);
  if (!catEval.available) {
    return {
      available: false,
      hidden: catEval.hidden,
      outOfSchedule: catEval.outOfSchedule,
      hasSchedule: catEval.hasSchedule || Boolean(item.availabilitySchedule?.enabled),
      badgeText: catEval.badgeText || 'خارج وقت التوفر',
      reasonText: catEval.reasonText || 'هذا القسم غير متوفر في الوقت الحالي',
      source: 'category',
    };
  }

  const sched = item.availabilitySchedule;
  if (!sched || !sched.enabled) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: catEval.hasSchedule,
      badgeText: '',
      reasonText: '',
      source: null,
    };
  }

  const inWindow = isWithinAvailabilitySchedule(sched, nowDate);
  if (inWindow) {
    return {
      available: true,
      hidden: false,
      outOfSchedule: false,
      hasSchedule: true,
      badgeText: formatWindowsBadge(sched),
      reasonText: '',
      source: null,
    };
  }

  const label = formatScheduleLabel(sched);
  const hideOutside = sched.behavior === 'hide';
  return {
    available: false,
    hidden: hideOutside,
    outOfSchedule: true,
    hasSchedule: true,
    badgeText: formatWindowsBadge(sched),
    reasonText: `متوفر فقط في الأوقات: ${label}`,
    source: 'item',
  };
}

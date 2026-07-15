import { useState, useEffect } from 'react';
import type { Bundle } from '../types';

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function getTodayKey(): string {
  return DAYS[new Date().getDay()];
}

function getPrevDayKey(day: string): string {
  const idx = DAYS.indexOf(day as typeof DAYS[number]);
  return DAYS[idx <= 0 ? 6 : idx - 1];
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeWindowWraps(bundle: Bundle): boolean {
  if (!bundle.startTime || !bundle.endTime) return false;
  const [sh, sm] = bundle.startTime.split(':').map(Number);
  const [eh, em] = bundle.endTime.split(':').map(Number);
  return (eh * 60 + em) <= (sh * 60 + sm);
}

function isTimeInWindow(nowMin: number, startTime: string, endTime: string): boolean {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin > startMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Wraps past midnight
  return nowMin >= startMin || nowMin < endMin;
}

function isBundleInSchedule(bundle: Bundle): boolean {
  if (!bundle.scheduleType || bundle.scheduleType === 'always') return true;

  const now = new Date();
  const todayStr = toDateStr(now);
  const todayKey = getTodayKey();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (bundle.startDate && todayStr < bundle.startDate) return false;
  if (bundle.endDate && todayStr > bundle.endDate) return false;

  // Repeat days logic with midnight-wrap support
  const wraps = timeWindowWraps(bundle);
  const todayInRepeat = bundle.repeatDays && bundle.repeatDays.length > 0
    ? bundle.repeatDays.includes(todayKey)
    : true;

  const prevDayInRepeat = bundle.repeatDays && bundle.repeatDays.length > 0
    ? bundle.repeatDays.includes(getPrevDayKey(todayKey))
    : false;

  // Active if:
  // 1) Today is in repeatDays (normal case), OR
  // 2) Window wraps past midnight AND previous day is in repeatDays AND we're before endTime
  const dayMatches = todayInRepeat || (wraps && prevDayInRepeat && bundle.endTime && nowMin < (() => { const [eh, em] = bundle.endTime!.split(':').map(Number); return eh * 60 + em; })());

  if (!todayInRepeat && !dayMatches) return false;

  // Time check
  if (bundle.startTime && bundle.endTime) {
    if (!isTimeInWindow(nowMin, bundle.startTime, bundle.endTime)) return false;
  }

  return true;
}

function getTimeRemainingMs(bundle: Bundle): number | null {
  if (!bundle.scheduleType || bundle.scheduleType === 'always') return null;

  const now = new Date();
  const nowMs = now.getTime();

  if (bundle.endTime) {
    const [eh, em] = bundle.endTime.split(':').map(Number);
    const endToday = new Date(now);
    endToday.setHours(eh, em, 0, 0);
    let diff = endToday.getTime() - nowMs;
    if (diff < 0 && bundle.startTime && bundle.startTime > bundle.endTime) {
      // Window wraps past midnight — add a day
      endToday.setDate(endToday.getDate() + 1);
      diff = endToday.getTime() - nowMs;
    }
    if (diff > 0) return diff;
  }

  if (bundle.endDate) {
    const endDate = new Date(bundle.endDate + 'T23:59:59');
    const diff = endDate.getTime() - nowMs;
    if (diff > 0) return diff;
  }

  return null;
}

export function useScheduleStatus(bundle: Bundle | null) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!bundle || bundle.scheduleType === 'always') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [bundle]);

  if (!bundle) return { isScheduleActive: true, timeRemaining: null, isHotDeal: false };

  const isScheduleActive = isBundleInSchedule(bundle);
  const timeRemaining = getTimeRemainingMs(bundle);
  const isHotDeal = isScheduleActive && timeRemaining !== null && timeRemaining > 0;

  return { isScheduleActive, timeRemaining, isHotDeal };
}

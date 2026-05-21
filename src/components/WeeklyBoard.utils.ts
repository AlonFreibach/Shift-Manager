// Constants and pure helper functions for WeeklyBoard —
// extracted from WeeklyBoard.tsx for maintainability. All functions here are
// pure (no component state), so they are safe to test and reuse in isolation.

import type { Employee } from '../data/employees';
import { LEGACY_ID_NAMES } from '../data/employees';
import { calculateFairnessScore, calculateFlexibilityScore, calculateStabilityScore } from '../utils/fairnessScore';
import type { Schedule, SlotDefault } from './WeeklyBoard.types';

export const MIYA_NAME = 'מיה';

// Check if a DD/MM birthday matches a specific date
export function isBirthdayOnDate(birthday: string | undefined, date: Date): boolean {
  if (!birthday) return false;
  const parts = birthday.split('/');
  if (parts.length !== 2) return false;
  const bd = parseInt(parts[0], 10);
  const bm = parseInt(parts[1], 10);
  return date.getDate() === bd && (date.getMonth() + 1) === bm;
}

/** Check if employee is on vacation during any part of the week (Sun–Fri) */
export function isOnVacation(emp: Employee, weekStartStr: string): boolean {
  if (!emp.vacationPeriods || emp.vacationPeriods.length === 0) return false;
  const weekStart = new Date(weekStartStr + 'T00:00:00');
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 5); // Friday
  for (const vp of emp.vacationPeriods) {
    const vFrom = new Date(vp.from + 'T00:00:00');
    const vTo = new Date(vp.to + 'T23:59:59');
    // Overlap check: vacation overlaps with week
    if (vFrom <= weekEnd && vTo >= weekStart) return true;
  }
  return false;
}

export const WEEK_STRUCTURE = [
  { day: 'ראשון', shifts: ['בוקר', 'ערב'] },
  { day: 'שני',   shifts: ['בוקר', 'ערב'] },
  { day: 'שלישי', shifts: ['בוקר', 'ערב'] },
  { day: 'רביעי', shifts: ['בוקר', 'ערב'] },
  { day: 'חמישי', shifts: ['בוקר', 'ערב'] },
  { day: 'שישי',  shifts: ['בוקר'] },
];

// Default arrival+departure per slot, per day+shift (non-Miya slots)
export const SLOT_DEFAULTS: Record<string, Record<string, SlotDefault[]>> = {
  'ראשון':  {
    'בוקר': [{ arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }],
  },
  'שני':    {
    'בוקר': [{ arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }],
  },
  'שלישי':  {
    'בוקר': [{ arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }],
  },
  'רביעי':  {
    'בוקר': [{ arrival: '06:55', departure: '14:00' }, { arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }],
  },
  'חמישי':  {
    'בוקר': [{ arrival: '06:30', departure: '14:00' }, { arrival: '06:45', departure: '14:30' }, { arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '14:30', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }],
  },
  'שישי':   {
    'בוקר': [
      { arrival: '06:30', departure: '15:30' }, { arrival: '06:45', departure: '15:45' },
      { arrival: '07:00', departure: '16:00' }, { arrival: '07:15', departure: '16:00' },
      { arrival: '08:00', departure: '16:00' },
    ],
  },
};

// Miya's fixed schedule (morning only)
export const MIYA_SCHEDULE: Record<string, { arrival: string; departure: string }> = {
  'ראשון':  { arrival: '07:00', departure: '15:00' },
  'שני':    { arrival: '07:00', departure: '15:00' },
  'שלישי':  { arrival: '07:00', departure: '15:00' },
  'רביעי':  { arrival: '08:00', departure: '17:00' },
  'חמישי':  { arrival: '10:00', departure: '19:00' },
  'שישי':   { arrival: '07:00', departure: '14:00' },
};

export function getBaseStations(day: string): string[] {
  if (day === 'שישי') return ['קופה 1', 'קופה 2', 'קופה 3', 'קופה 4', 'וולט'];
  if (day === 'רביעי' || day === 'חמישי') return ['קופה 1', 'קופה 2', 'קופה 3'];
  return ['קופה 1', 'קופה 2'];
}

export function getStations(day: string, hasVolt: boolean): string[] {
  const base = getBaseStations(day);
  if (day !== 'שישי' && hasVolt) {
    return [...base, 'וולט', 'התלמדות', 'אחר'];
  }
  return [...base, 'התלמדות', 'אחר'];
}

export function getStationBadge(station: string): string | null {
  if (!station) return null;
  if (station === 'קופה 1') return 'ק1';
  if (station === 'קופה 2') return 'ק2';
  if (station === 'קופה 3') return 'ק3';
  if (station === 'קופה 4') return 'ק4';
  if (station === 'וולט') return 'וו';
  if (station === 'התלמדות') return null;
  if (station === 'אחר') return 'אחר';
  if (station.startsWith('אקסטרה')) return station.replace('אקסטרה ', 'X');
  return station;
}

export function getWeekStart(offset = 0): Date {
  const d = new Date();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay() + offset * 7);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

export function formatDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

export function isBiweeklyFridayEligible(empId: string, fridayDate: string): boolean {
  const last = localStorage.getItem(`lastFridayWorked_${empId}`);
  if (!last) return true;
  const lastDate = new Date(last + 'T00:00:00');
  const thisDate = new Date(fridayDate + 'T00:00:00');
  const diffDays = Math.round((thisDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > 7;
}

export function isEmployeeAvailable(emp: Employee, day: string, shift: string, fridayDate?: string): boolean {
  if (day === 'שישי') {
    if (emp.fridayAvailability === 'never') return false;
    if (emp.fridayAvailability === 'biweekly' && fridayDate && !isBiweeklyFridayEligible(emp.id, fridayDate)) return false;
  }
  const isCustomShift = shift !== 'בוקר' && shift !== 'ערב';
  if (emp.shiftType !== 'הכל' && !isCustomShift) {
    if (emp.shiftType === 'בוקר' && shift !== 'בוקר') return false;
    if (emp.shiftType === 'ערב' && shift !== 'ערב') return false;
  }
  return true;
}

export function calculateCompositeScore(emp: Employee): number {
  const stability = calculateStabilityScore(emp) / 10;
  const flexibility = (calculateFlexibilityScore(emp) ?? 0) / 100;
  const fairness = calculateFairnessScore(emp);
  return 0.5 * flexibility + 0.4 * stability + 0.1 / (1 + fairness);
}

// Migrate old schedule data: convert numeric employeeIds to Supabase string IDs
export function migrateScheduleIds(schedule: Record<string, any[]>, employees: Employee[]): Schedule {
  const result: Schedule = {};
  for (const [key, slots] of Object.entries(schedule)) {
    result[key] = slots.map(slot => {
      if (typeof slot.employeeId === 'number') {
        const legacyName = LEGACY_ID_NAMES[slot.employeeId];
        const emp = legacyName ? employees.find(e => e.name === legacyName) : null;
        return { ...slot, employeeId: emp?.id || null };
      }
      return slot;
    });
  }
  return result;
}

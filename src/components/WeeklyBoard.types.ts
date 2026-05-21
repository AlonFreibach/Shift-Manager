// Type definitions for WeeklyBoard — extracted from WeeklyBoard.tsx for maintainability.

import type { Employee } from '../data/employees';

export interface Slot {
  employeeId: string | null;
  arrivalTime: string;
  departureTime: string;
  station: string;
  locked?: boolean;
  isFixed?: boolean;
  voltResponsible?: boolean;
}

export type Schedule = Record<string, Slot[]>;
export type VoltFlags = Record<string, boolean>;

export interface CustomShiftDef {
  name: string;
  day: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
}

export interface SpecialShiftEntry {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
}

export type PlanAheadStep = 'dateRange' | 'question' | 'specialShifts' | 'running' | 'summary';

export interface PlanAheadSummary {
  weeksScheduled: number;
  totalShifts: number;
  specialShiftsCount: number;
  unfilledSlots: number;
  weekDetails: { weekKey: string; weekLabel: string; filled: number; total: number; specialCount: number }[];
}

// Default arrival+departure per slot, per day+shift (non-Miya slots)
export interface SlotDefault { arrival: string; departure: string; }

export interface ShortageItem { emp: Employee; needed: number; got: number; }
export interface TieItem { day: string; shift: string; slotIdx: number; candidates: Employee[]; scores: Record<string, number>; }
export interface TraineeResult { name: string; assigned: boolean; reason?: string; }
export interface AutoResultModal { isOpen: boolean; shortages: ShortageItem[]; ties: TieItem[]; emptySlots: { day: string; shift: string }[]; pendingSchedule: Schedule; traineeResults: TraineeResult[]; }

// Scheduling constraints (applied before auto-schedule algorithm)
export interface BlockConstraint { type: 'block'; id: string; employeeId: string; day: string; shift: string; } // shift='' means entire day
export interface LimitConstraint { type: 'limit'; id: string; employeeId: string; shiftType: 'בוקר' | 'ערב'; }
export interface FixConstraint { type: 'fix'; id: string; employeeId: string; day: string; shift: string; arrivalTime?: string; departureTime?: string; }
export interface HoursConstraint { type: 'hours'; id: string; day: string; shift: string; newArrival: string; newDeparture: string; employeeId?: string; }
export interface MinConstraint { type: 'min'; id: string; day: string; shift: string; minCount: number; }
export interface StationHoursConstraint { type: 'stationHours'; id: string; day: string; shift: string; station: string; newArrival: string; newDeparture: string; }
export interface CloseConstraint { type: 'close'; id: string; day: string; shift: string; } // shift='' means entire day
export type SchedulingConstraint = BlockConstraint | LimitConstraint | FixConstraint | HoursConstraint | MinConstraint | StationHoursConstraint | CloseConstraint;

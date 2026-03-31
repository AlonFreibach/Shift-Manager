import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { calculateFairnessScore, calculateFlexibilityScore, calculateStabilityScore } from '../utils/fairnessScore';
import { addFairnessEvents } from '../utils/fairnessAccumulator';
import type { Employee } from '../data/employees';
import { LEGACY_ID_NAMES } from '../data/employees';
import type { EmployeePrefs } from '../types';
import { ISRAELI_HOLIDAYS } from '../data/holidays';
import { supabase } from '../lib/supabaseClient';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

interface WeeklyBoardProps {
  employees: Employee[];
  refreshEmployees?: () => void;
  autoScheduleRequest?: string | null;
  onAutoScheduleHandled?: () => void;
  onNavigateToPreferences?: () => void;
}

const MIYA_NAME = 'מיה';

/** Check if employee is on vacation during any part of the week (Sun–Fri) */
// Check if a DD/MM birthday matches a specific date
function isBirthdayOnDate(birthday: string | undefined, date: Date): boolean {
  if (!birthday) return false;
  const parts = birthday.split('/');
  if (parts.length !== 2) return false;
  const bd = parseInt(parts[0], 10);
  const bm = parseInt(parts[1], 10);
  return date.getDate() === bd && (date.getMonth() + 1) === bm;
}

function isOnVacation(emp: Employee, weekStartStr: string): boolean {
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

interface Slot {
  employeeId: string | null;
  arrivalTime: string;
  departureTime: string;
  station: string;
  locked?: boolean;
  isFixed?: boolean;
  voltResponsible?: boolean;
}

type Schedule = Record<string, Slot[]>;
type VoltFlags = Record<string, boolean>;

interface CustomShiftDef {
  name: string;
  day: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
}

interface SpecialShiftEntry {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
}

type PlanAheadStep = 'dateRange' | 'question' | 'specialShifts' | 'running' | 'summary';

interface PlanAheadSummary {
  weeksScheduled: number;
  totalShifts: number;
  specialShiftsCount: number;
  unfilledSlots: number;
  weekDetails: { weekKey: string; weekLabel: string; filled: number; total: number; specialCount: number }[];
}

const WEEK_STRUCTURE = [
  { day: 'ראשון', shifts: ['בוקר', 'ערב'] },
  { day: 'שני',   shifts: ['בוקר', 'ערב'] },
  { day: 'שלישי', shifts: ['בוקר', 'ערב'] },
  { day: 'רביעי', shifts: ['בוקר', 'ערב'] },
  { day: 'חמישי', shifts: ['בוקר', 'ערב'] },
  { day: 'שישי',  shifts: ['בוקר'] },
];

// Default arrival+departure per slot, per day+shift (non-Miya slots)
interface SlotDefault { arrival: string; departure: string; }
const SLOT_DEFAULTS: Record<string, Record<string, SlotDefault[]>> = {
  'ראשון':  {
    'בוקר': [{ arrival: '06:55', departure: '14:00' }, { arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }],
  },
  'שני':    {
    'בוקר': [{ arrival: '06:55', departure: '14:00' }, { arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }],
  },
  'שלישי':  {
    'בוקר': [{ arrival: '06:55', departure: '14:00' }, { arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }],
  },
  'רביעי':  {
    'בוקר': [{ arrival: '06:55', departure: '14:00' }, { arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }, { arrival: '16:00', departure: '21:00' }],
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
const MIYA_SCHEDULE: Record<string, { arrival: string; departure: string }> = {
  'ראשון':  { arrival: '07:00', departure: '15:00' },
  'שני':    { arrival: '07:00', departure: '15:00' },
  'שלישי':  { arrival: '07:00', departure: '15:00' },
  'רביעי':  { arrival: '08:00', departure: '16:00' },
  'חמישי':  { arrival: '10:00', departure: '19:00' },
  'שישי':   { arrival: '07:00', departure: '14:00' },
};

function getBaseStations(day: string): string[] {
  if (day === 'שישי') return ['קופה 1', 'קופה 2', 'קופה 3', 'קופה 4', 'וולט'];
  if (day === 'רביעי' || day === 'חמישי') return ['קופה 1', 'קופה 2', 'קופה 3'];
  return ['קופה 1', 'קופה 2'];
}

function getStations(day: string, hasVolt: boolean): string[] {
  const base = getBaseStations(day);
  if (day !== 'שישי' && hasVolt) {
    return [...base, 'וולט', 'התלמדות', 'אחר'];
  }
  return [...base, 'התלמדות', 'אחר'];
}

function getStationBadge(station: string): string | null {
  if (!station) return null;
  if (station === 'קופה 1') return 'ק1';
  if (station === 'קופה 2') return 'ק2';
  if (station === 'קופה 3') return 'ק3';
  if (station === 'קופה 4') return 'ק4';
  if (station === 'וולט') return 'וו';
  if (station === 'התלמדות') return null;
  if (station === 'אחר') return 'אחר';
  return station;
}

function getWeekStart(offset = 0): Date {
  const d = new Date();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay() + offset * 7);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

function formatDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

function isBiweeklyFridayEligible(empId: string, fridayDate: string): boolean {
  const last = localStorage.getItem(`lastFridayWorked_${empId}`);
  if (!last) return true;
  const lastDate = new Date(last + 'T00:00:00');
  const thisDate = new Date(fridayDate + 'T00:00:00');
  const diffDays = Math.round((thisDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > 7;
}

function isEmployeeAvailable(emp: Employee, day: string, shift: string, fridayDate?: string): boolean {
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

interface ShortageItem { emp: Employee; needed: number; got: number; }
interface TieItem { day: string; shift: string; slotIdx: number; candidates: Employee[]; scores: Record<string, number>; }
interface TraineeResult { name: string; assigned: boolean; reason?: string; }
interface AutoResultModal { isOpen: boolean; shortages: ShortageItem[]; ties: TieItem[]; emptySlots: { day: string; shift: string }[]; pendingSchedule: Schedule; traineeResults: TraineeResult[]; }

// Scheduling constraints (applied before auto-schedule algorithm)
interface BlockConstraint { type: 'block'; id: string; employeeId: string; day: string; shift: string; } // shift='' means entire day
interface LimitConstraint { type: 'limit'; id: string; employeeId: string; shiftType: 'בוקר' | 'ערב'; }
interface FixConstraint { type: 'fix'; id: string; employeeId: string; day: string; shift: string; arrivalTime?: string; departureTime?: string; }
interface HoursConstraint { type: 'hours'; id: string; day: string; shift: string; newArrival: string; newDeparture: string; employeeId?: string; }
interface MinConstraint { type: 'min'; id: string; day: string; shift: string; minCount: number; }
interface StationHoursConstraint { type: 'stationHours'; id: string; day: string; shift: string; station: string; newArrival: string; newDeparture: string; }
interface CloseConstraint { type: 'close'; id: string; day: string; shift: string; } // shift='' means entire day
type SchedulingConstraint = BlockConstraint | LimitConstraint | FixConstraint | HoursConstraint | MinConstraint | StationHoursConstraint | CloseConstraint;

function calculateCompositeScore(emp: Employee): number {
  const stability = calculateStabilityScore(emp) / 10;
  const flexibility = (calculateFlexibilityScore(emp) ?? 0) / 100;
  const fairness = calculateFairnessScore(emp);
  return 0.5 * flexibility + 0.4 * stability + 0.1 / (1 + fairness);
}

// Migrate old schedule data: convert numeric employeeIds to Supabase string IDs
function migrateScheduleIds(schedule: Record<string, any[]>, employees: Employee[]): Schedule {
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

export function WeeklyBoard({ employees, refreshEmployees, autoScheduleRequest, onAutoScheduleHandled, onNavigateToPreferences }: WeeklyBoardProps) {
  const miyaId = employees.find(e => e.name === MIYA_NAME)?.id || '';
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedule, setSchedule] = useState<Schedule>({});
  const [voltFlags, setVoltFlags] = useState<VoltFlags>({});
  const [closedShifts, setClosedShifts] = useState<Record<string, boolean>>({});
  const [whatsappToast, setWhatsappToast] = useState(false);
  const [whatsappFallback, setWhatsappFallback] = useState('');

  const [preferences, setPreferences] = useState<Record<string, EmployeePrefs>>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [autoResultModal, setAutoResultModal] = useState<AutoResultModal>({
    isOpen: false, shortages: [], ties: [], emptySlots: [], pendingSchedule: {}, traineeResults: [],
  });
  const [manualShortages, setManualShortages] = useState<ShortageItem[]>([]);
  const [resetToast, setResetToast] = useState(false);
  const [showPlanAheadModal, setShowPlanAheadModal] = useState(false);
  const [planAheadFrom, setPlanAheadFrom] = useState<Date>(() => getWeekStart(1));
  const [planAheadTo, setPlanAheadTo] = useState<Date>(() => {
    const d = getWeekStart(4); d.setDate(d.getDate() + 5); return d;
  });
  const [planAheadNoPrefsWarning, setPlanAheadNoPrefsWarning] = useState(false);
  const [planAheadStep, setPlanAheadStep] = useState<PlanAheadStep>('dateRange');
  const [specialShifts, setSpecialShifts] = useState<SpecialShiftEntry[]>([]);
  const [specialShiftForm, setSpecialShiftForm] = useState({ name: '', date: '', startTime: '', endTime: '', requiredCount: 2 });
  const [planAheadSummary, setPlanAheadSummary] = useState<PlanAheadSummary | null>(null);
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<SpecialShiftEntry | null>(null);
  const [planAheadClosures, setPlanAheadClosures] = useState<{ weekKey: string; day: string; shift: string }[]>([]);
  const [paCloseWeek, setPaCloseWeek] = useState('');
  const [paCloseDay, setPaCloseDay] = useState('ראשון');
  const [paCloseShift, setPaCloseShift] = useState('');
  const [noPrefsToast, setNoPrefsToast] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const [mobileDayIndex, setMobileDayIndex] = useState(0);
  const pendingAutoScheduleRef = useRef(false);
  const [editingSlot, setEditingSlot] = useState<{ day: string; shift: string; slotIdx: number; isNew?: boolean } | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [popoverValidationError, setPopoverValidationError] = useState(false);
  const [slotAddToast, setSlotAddToast] = useState<string | null>(null);
  const [fixedShiftToast, setFixedShiftToast] = useState<string | null>(null);
  const [slotSaveToast, setSlotSaveToast] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [tempSlotData, setTempSlotData] = useState<{ employeeId: string | null; arrivalTime: string; departureTime: string; station: string; voltResponsible?: boolean }>({ employeeId: null, arrivalTime: '', departureTime: '', station: '' });

  interface SyncIssue {
    station: string;
    morningEmpName: string;
    eveningEmpName: string;
    morningDeparture: string;
    eveningArrival: string;
    type: 'gap' | 'overlap';
    diffMinutes: number;
    morningShiftSlotIdx: number;
    eveningShiftSlotIdx: number;
  }
  interface SyncWarning {
    day: string;
    issues: SyncIssue[];
    editedShift: 'בוקר' | 'ערב';
  }
  const [syncWarningModal, setSyncWarningModal] = useState<SyncWarning | null>(null);

  const [customShifts, setCustomShifts] = useState<Record<string, CustomShiftDef[]>>({});
  const [showCustomShiftModal, setShowCustomShiftModal] = useState(false);
  const [customShiftModalDay, setCustomShiftModalDay] = useState('ראשון');
  const [customShiftForm, setCustomShiftForm] = useState({ name: '', startTime: '', endTime: '', requiredCount: 2 });
  const [holidayDismissed, setHolidayDismissed] = useState(false);

  // PDF export modal state
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfWeekChecks, setPdfWeekChecks] = useState<boolean[]>([true, false, false, false, false]);

  // Constraints modal state
  const [showConstraintsModal, setShowConstraintsModal] = useState(false);
  const [schedulingConstraints, setSchedulingConstraints] = useState<SchedulingConstraint[]>([]);
  const [addingConstraintType, setAddingConstraintType] = useState<'block'|'limit'|'fix'|'hours'|'min'|'stationHours'|'close'|null>(null);
  const [closeForm, setCloseForm] = useState<{ day: string; shift: string }>({ day: 'ראשון', shift: '' });
  const [blockForm, setBlockForm] = useState<{ employeeId: string; day: string; shift: string }>({ employeeId: '', day: 'ראשון', shift: '' });
  const [limitForm, setLimitForm] = useState<{ employeeId: string; shiftType: 'בוקר'|'ערב' }>({ employeeId: '', shiftType: 'בוקר' });
  const [fixForm, setFixForm] = useState<{ employeeId: string; day: string; shift: string; arrivalTime: string; departureTime: string }>({ employeeId: '', day: 'ראשון', shift: 'בוקר', arrivalTime: '', departureTime: '' });
  const [hoursForm, setHoursForm] = useState<{ mode: 'full'|'employee'; day: string; shift: string; newArrival: string; newDeparture: string; employeeId: string }>({ mode: 'full', day: 'ראשון', shift: 'בוקר', newArrival: '', newDeparture: '', employeeId: '' });
  const [minForm, setMinForm] = useState<{ day: string; shift: string; minCount: number }>({ day: 'ראשון', shift: 'בוקר', minCount: 2 });
  const [stationHoursForm, setStationHoursForm] = useState<{ day: string; shift: string; station: string; newArrival: string; newDeparture: string }>({ day: 'ראשון', shift: 'בוקר', station: 'קופה 1', newArrival: '', newDeparture: '' });

  // Volt conflict modal
  const [voltConflictModal, setVoltConflictModal] = useState<{ day: string; shift: string; slots: { idx: number; empName: string; station: string; checked: boolean }[] } | null>(null);

  // Unsaved changes tracking
  const [slotDirty, setSlotDirty] = useState(false);
  const slotDirtyRef = useRef(false);
  const setSlotDirtyBoth = (v: boolean) => { setSlotDirty(v); slotDirtyRef.current = v; };
  const [constraintsDirty, setConstraintsDirty] = useState(false);
  const [unsavedTarget, setUnsavedTarget] = useState<'slot' | 'constraints' | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const calcPopoverPos = useCallback(() => {
    if (!cardRef.current) return null;
    const rect = cardRef.current.getBoundingClientRect();
    const popW = isMobile ? 260 : 220;
    const popH = 280;
    // Default: below card, aligned to right edge (RTL)
    let top = rect.bottom + 4;
    let left = rect.right - popW;
    // Flip up if not enough space below
    if (top + popH > window.innerHeight) {
      top = rect.top - popH - 4;
    }
    // Push right if overflows left edge
    if (left < 8) left = 8;
    // Push left if overflows right edge
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    return { top, left };
  }, [isMobile]);

  const closePopover = useCallback((discard = true) => {
    if (discard && editingSlot?.isNew) {
      const key = `${editingSlot.day}_${editingSlot.shift}`;
      const slots = schedule[key] || [];
      if (slots[editingSlot.slotIdx] && slots[editingSlot.slotIdx].employeeId === null) {
        const newSlots = slots.filter((_, i) => i !== editingSlot.slotIdx);
        saveSchedule({ ...schedule, [key]: newSlots });
      }
    }
    setEditingSlot(null);
    setPopoverPos(null);
    setPopoverValidationError(false);
  }, [editingSlot, schedule]);

  useEffect(() => {
    if (!editingSlot) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        if (slotDirtyRef.current) {
          e.stopPropagation();
          e.preventDefault();
          setUnsavedTarget('slot');
        } else {
          closePopover(true);
        }
      }
    }
    function recalcPos() {
      const pos = calcPopoverPos();
      if (pos) setPopoverPos(pos);
    }
    document.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('scroll', recalcPos, true);
    window.addEventListener('resize', recalcPos);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('scroll', recalcPos, true);
      window.removeEventListener('resize', recalcPos);
    };
  }, [editingSlot, calcPopoverPos, schedule, closePopover]);

  const weekStart = getWeekStart(weekOffset);
  const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

  function formatWeekKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

  function dateToWeekKeyAndDay(dateStr: string): { weekKey: string; dayName: string } {
    const d = new Date(dateStr + 'T00:00:00');
    const dayIndex = d.getDay();
    const dayName = DAY_NAMES[dayIndex] || '';
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayIndex);
    sunday.setHours(0, 0, 0, 0);
    return { weekKey: formatWeekKey(sunday), dayName };
  }

  function getDefaultSpecialShiftName(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return `משמרת מיוחדת ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function isDateInPlanAheadRange(dateStr: string): boolean {
    const d = new Date(dateStr + 'T00:00:00');
    if (d.getDay() === 6) return false;
    return d >= planAheadFrom && d <= planAheadTo;
  }

  function closePlanAheadFlow() {
    setShowPlanAheadModal(false);
    setPlanAheadStep('dateRange');
    setSpecialShifts([]);
    setSpecialShiftForm({ name: '', date: '', startTime: '', endTime: '', requiredCount: 2 });
    setPlanAheadSummary(null);
    setPlanAheadNoPrefsWarning(false);
    setEditingHolidayId(null);
    setEditingDraft(null);
    setPlanAheadClosures([]);
    // Reload closed shifts from Supabase for current week
    void (async () => {
      try {
        const { data } = await supabase.from('closed_shifts').select('day, shift').eq('week_start', weekKey);
        if (data) {
          const map: Record<string, boolean> = {};
          data.forEach((r: any) => { map[`${r.day}_${r.shift}`] = true; });
          setClosedShifts(map);
        }
      } catch {}
    })();
  }

  async function runPlanAheadAutoSchedule() {
    setPlanAheadStep('running');
    await new Promise(r => setTimeout(r, 50));

    const sundays = getWeekSundaysInRange(planAheadFrom, planAheadTo);
    const weekDetails: PlanAheadSummary['weekDetails'] = [];
    let totalShifts = 0;
    let specialShiftsCount = 0;
    let unfilledSlots = 0;

    // Group special shifts by weekKey
    const specialByWeek: Record<string, SpecialShiftEntry[]> = {};
    for (const ss of specialShifts) {
      const { weekKey: wk } = dateToWeekKeyAndDay(ss.date);
      if (!specialByWeek[wk]) specialByWeek[wk] = [];
      specialByWeek[wk].push(ss);
    }

    for (const sunday of sundays) {
      const wk = formatWeekKey(sunday);

      // Load or create schedule
      const savedSched = localStorage.getItem(`schedule_${wk}`);
      let weekSchedule: Schedule = {};
      if (savedSched) {
        weekSchedule = JSON.parse(savedSched);
      } else {
        for (const { day, shifts } of WEEK_STRUCTURE) {
          for (const shift of shifts) {
            weekSchedule[`${day}_${shift}`] = initializeSlots(day, shift);
          }
        }
      }

      // Load voltFlags and customShifts
      const savedVolt = localStorage.getItem(`voltFlags_${wk}`);
      const weekVoltFlags: VoltFlags = savedVolt ? JSON.parse(savedVolt) : {};
      const savedCS = localStorage.getItem(`customShifts_${wk}`);
      const weekCustomShifts: Record<string, CustomShiftDef[]> = savedCS ? JSON.parse(savedCS) : {};

      // Inject special shifts as customShifts (additive — no morning/evening time changes)
      const weekSpecials = specialByWeek[wk] || [];
      let weekSpecialCount = 0;
      for (const ss of weekSpecials) {
        const { dayName } = dateToWeekKeyAndDay(ss.date);
        if (!dayName) continue;
        const csDef: CustomShiftDef = {
          name: ss.name,
          day: dayName,
          startTime: ss.startTime,
          endTime: ss.endTime,
          requiredCount: ss.requiredCount,
        };
        if (!weekCustomShifts[dayName]) weekCustomShifts[dayName] = [];
        weekCustomShifts[dayName].push(csDef);
        const csKey = `${dayName}_${ss.name}`;
        weekSchedule[csKey] = Array.from({ length: ss.requiredCount }, () => ({
          employeeId: null, arrivalTime: ss.startTime, departureTime: ss.endTime, station: '',
        }));
        weekSpecialCount++;
      }
      if (weekSpecials.length > 0) {
        localStorage.setItem(`customShifts_${wk}`, JSON.stringify(weekCustomShifts));
      }

      // Load preferences (with backward compat)
      const weekPrefs: Record<string, EmployeePrefs> = {};
      for (const emp of employees) {
        const raw = localStorage.getItem(`preferences_${emp.id}_${wk}`);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown[]>;
            const isOld = Object.values(parsed).some(v => Array.isArray(v) && v.length > 0 && typeof v[0] === 'string');
            if (isOld) {
              const converted: EmployeePrefs = {};
              for (const [day, shifts] of Object.entries(parsed)) {
                converted[day] = (shifts as string[]).map(s => ({ shift: s }));
              }
              weekPrefs[emp.id] = converted;
            } else {
              weekPrefs[emp.id] = parsed as EmployeePrefs;
            }
          } catch { weekPrefs[emp.id] = {}; }
        } else {
          weekPrefs[emp.id] = {};
        }
      }

      // Fetch closed shifts for this week from Supabase
      const weekClosedShifts: Record<string, boolean> = {};
      try {
        const { data: closedData } = await supabase.from('closed_shifts').select('day, shift').eq('week_start', wk);
        if (closedData) closedData.forEach((r: any) => { weekClosedShifts[`${r.day}_${r.shift}`] = true; });
      } catch {}

      // Run auto-schedule for this week
      const result = runAutoScheduleForWeek(wk, weekSchedule, weekCustomShifts, weekPrefs, weekVoltFlags, [], weekClosedShifts);
      const finalSchedule = { ...result.schedule };

      // Auto-resolve ties (pick first candidate — no interactive modal for multi-week)
      for (const tie of result.ties) {
        const key = `${tie.day}_${tie.shift}`;
        const slots = finalSchedule[key];
        if (!slots) continue;
        const best = tie.candidates[0];
        const prefEntry = (weekPrefs[best.id]?.[tie.day] || []).find(p => p.shift === tie.shift);
        const departure = prefEntry?.customDeparture || slots[tie.slotIdx]?.departureTime || '';
        finalSchedule[key] = slots.map((s, i) =>
          i === tie.slotIdx ? { ...s, employeeId: best.id, departureTime: departure } : s
        );
      }

      // Re-assign stations
      const effectiveStructure = WEEK_STRUCTURE.map(ws => ({
        ...ws,
        shifts: [...ws.shifts.slice(0, 1), ...(weekCustomShifts[ws.day] || []).map(cs => cs.name), ...ws.shifts.slice(1)]
      }));
      for (const { day, shifts } of effectiveStructure) {
        for (const shift of shifts) {
          const key = `${day}_${shift}`;
          const slots = finalSchedule[key];
          if (!slots) continue;
          const availableStations = [
            ...getBaseStations(day),
            ...(day !== 'שישי' && weekVoltFlags[key] ? ['וולט'] : []),
          ];
          let stIdx = 0;
          finalSchedule[key] = slots.map(slot => {
            if (slot.locked || slot.employeeId === null) return slot;
            return { ...slot, station: stIdx < availableStations.length ? availableStations[stIdx++] : '' };
          });
        }
      }

      // Save schedule + fairness events
      localStorage.setItem(`schedule_${wk}`, JSON.stringify(finalSchedule));
      addFairnessEvents(finalSchedule, wk);

      // Track biweekly Friday assignments
      const fridayDate = (() => {
        const d = new Date(wk + 'T00:00:00');
        d.setDate(d.getDate() + 5);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      })();
      for (const slot of finalSchedule['שישי_בוקר'] || []) {
        if (slot.employeeId !== null) {
          const emp = employees.find(e => e.id === slot.employeeId);
          if (emp?.fridayAvailability === 'biweekly') {
            localStorage.setItem(`lastFridayWorked_${emp.id}`, fridayDate);
          }
        }
      }

      // Collect stats for summary
      let filled = 0, total = 0;
      for (const { day, shifts } of effectiveStructure) {
        for (const shift of shifts) {
          for (const s of finalSchedule[`${day}_${shift}`] || []) {
            if (!s.locked) { total++; if (s.employeeId !== null) filled++; }
          }
        }
      }
      const weekLabel = `${formatDate(sunday)}–${formatDate(new Date(sunday.getTime() + 5 * 86400000))}`;
      weekDetails.push({ weekKey: wk, weekLabel, filled, total, specialCount: weekSpecialCount });
      totalShifts += total;
      specialShiftsCount += weekSpecialCount;
      unfilledSlots += (total - filled);
    }

    setPlanAheadSummary({ weeksScheduled: sundays.length, totalShifts, specialShiftsCount, unfilledSlots, weekDetails });
    setPlanAheadStep('summary');
  }

  function getWeekSundaysInRange(from: Date, to: Date): Date[] {
    const sundays: Date[] = [];
    const sunday = new Date(from);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    sunday.setHours(0, 0, 0, 0);
    while (sunday <= to) {
      sundays.push(new Date(sunday));
      sunday.setDate(sunday.getDate() + 7);
    }
    return sundays;
  }

  function checkPlanAheadPreferences(): boolean {
    const sundays = getWeekSundaysInRange(planAheadFrom, planAheadTo);
    for (const sunday of sundays) {
      const key = formatWeekKey(sunday);
      for (const emp of employees) {
        if (emp.id === miyaId) continue;
        const raw = localStorage.getItem(`preferences_${emp.id}_${key}`);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Object.values(parsed).flat().length > 0) return true;
          } catch { /* ignore */ }
        }
      }
    }
    return false;
  }

  function getWeekBadge(offset: number): { label: string; color: string; bg: string } | null {
    if (offset === 0) return { label: 'נוכחי', color: '#fff', bg: '#1a4a2e' };
    const sunday = getWeekStart(offset);
    const key = formatWeekKey(sunday);
    const saved = localStorage.getItem(`schedule_${key}`);
    if (!saved) return null;
    try {
      const sched = JSON.parse(saved) as Schedule;
      const hasAssignments = Object.values(sched).some(slots =>
        slots.some(s => !s.locked && s.employeeId !== null)
      );
      if (hasAssignments) return { label: 'שובץ', color: '#fff', bg: '#28a745' };
      return { label: 'ריק', color: '#666', bg: '#e9ecef' };
    } catch { return null; }
  }

  useEffect(() => {
    setPrefsLoaded(false);
    const saved = localStorage.getItem(`schedule_${weekKey}`);
    let loadedSchedule: Schedule = saved ? migrateScheduleIds(JSON.parse(saved), employees) : {};

    // ── Auto-populate fixed shifts on board load ──
    let changed = false;
    for (const emp of employees) {
      if (emp.id === miyaId) continue;
      if (!emp.fixedShifts || emp.fixedShifts.length === 0) continue;
      for (const fs of emp.fixedShifts) {
        if (!fs.day || !fs.shift) continue;
        const key = `${fs.day}_${fs.shift}`;
        // Initialize slots for this cell if not yet in schedule
        if (!loadedSchedule[key] || loadedSchedule[key].length === 0) {
          loadedSchedule[key] = initializeSlots(fs.day, fs.shift);
          changed = true;
        }
        const slots = loadedSchedule[key];
        // Skip if employee already in this shift
        if (slots.some(s => s.employeeId === emp.id)) continue;
        const fixedSlot: Slot = {
          employeeId: emp.id,
          arrivalTime: fs.arrivalTime || (fs.shift === 'בוקר' ? '07:00' : '14:00'),
          departureTime: fs.departureTime || (fs.shift === 'בוקר' ? '14:00' : '21:00'),
          station: '',
          isFixed: true,
        };
        const emptyIdx = slots.findIndex(s => !s.locked && s.employeeId === null);
        if (emptyIdx !== -1) {
          slots[emptyIdx] = fixedSlot;
        } else {
          slots.push(fixedSlot);
        }
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(`schedule_${weekKey}`, JSON.stringify(loadedSchedule));
    }
    setSchedule(loadedSchedule);

    const savedVolt = localStorage.getItem(`voltFlags_${weekKey}`);
    setVoltFlags(savedVolt ? JSON.parse(savedVolt) : {});

    const savedCustomShifts = localStorage.getItem(`customShifts_${weekKey}`);
    setCustomShifts(savedCustomShifts ? JSON.parse(savedCustomShifts) : {});

    // Fetch closed shifts from Supabase
    void (async () => {
      try {
        const { data } = await supabase.from('closed_shifts').select('day, shift').eq('week_start', weekKey);
        if (data) {
          const map: Record<string, boolean> = {};
          data.forEach((r: any) => { map[`${r.day}_${r.shift}`] = true; });
          setClosedShifts(map);
        }
      } catch {
        setClosedShifts({});
      }
    })();

    const prefForWeek: Record<string, EmployeePrefs> = {};
    employees.forEach(emp => {
      const raw = localStorage.getItem(`preferences_${emp.id}_${weekKey}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown[]>;
          // Backward compat: old format had string[] values
          const isOld = Object.values(parsed).some(v => Array.isArray(v) && v.length > 0 && typeof v[0] === 'string');
          if (isOld) {
            const converted: EmployeePrefs = {};
            for (const [day, shifts] of Object.entries(parsed)) {
              converted[day] = (shifts as string[]).map(s => ({ shift: s }));
            }
            prefForWeek[emp.id] = converted;
          } else {
            prefForWeek[emp.id] = parsed as EmployeePrefs;
          }
        } catch { prefForWeek[emp.id] = {}; }
      } else {
        prefForWeek[emp.id] = {};
      }
    });

    // Also fetch from Supabase (PreferencesView saves preferences there, not to localStorage)
    let cancelled = false;
    const SUPA_SHIFT_MAP: Record<string, string> = { morning: 'בוקר', evening: 'ערב' };

    void (async () => {
      try {
        const { data: supaPrefs } = await supabase
          .from('preferences')
          .select('employee_id, day_of_week, shift_type, available, employees(name)')
          .eq('week_start', weekKey);

        if (cancelled) return;
        if (supaPrefs && supaPrefs.length > 0) {
          // For employees that have Supabase data, replace localStorage prefs with Supabase prefs
          const overriddenIds = new Set<string>();
          supaPrefs.forEach((p: any) => {
            const empId = String(p.employee_id);
            if (employees.some(e => e.id === empId)) overriddenIds.add(empId);
          });
          overriddenIds.forEach(id => { prefForWeek[id] = {}; });

          supaPrefs.forEach((p: any) => {
            if (!p.available) return;
            const empId = String(p.employee_id);
            const emp = employees.find(e => e.id === empId);
            if (!emp) return;
            const dayName = DAY_NAMES[p.day_of_week as number];
            const shiftHeb = SUPA_SHIFT_MAP[p.shift_type];
            if (!dayName || !shiftHeb) return;
            if (!prefForWeek[emp.id][dayName]) prefForWeek[emp.id][dayName] = [];
            prefForWeek[emp.id][dayName].push({ shift: shiftHeb });
          });
        }
      } catch {
        // Supabase unavailable — use localStorage prefs only
      }

      if (cancelled) return;
      setPreferences({ ...prefForWeek });
      setPrefsLoaded(true);
      if (pendingAutoScheduleRef.current) {
        pendingAutoScheduleRef.current = false;
        setTimeout(() => autoSchedule({ ...prefForWeek }), 0);
      }
      setHolidayDismissed(false);
    })();

    return () => { cancelled = true; };
  }, [weekKey, employees]);

  // Handle autoSchedule request from PreferencesTab
  useEffect(() => {
    if (!autoScheduleRequest || !onAutoScheduleHandled) return;
    const targetSunday = new Date(autoScheduleRequest + 'T00:00:00');
    const currentSunday = getWeekStart(0);
    const diffDays = Math.round((targetSunday.getTime() - currentSunday.getTime()) / (24 * 60 * 60 * 1000));
    const targetOffset = Math.round(diffDays / 7);

    onAutoScheduleHandled();

    if (targetOffset === weekOffset) {
      // Already on the right week — run immediately
      autoSchedule();
    } else {
      // Navigate to target week; autoSchedule will run after preferences load
      pendingAutoScheduleRef.current = true;
      setWeekOffset(targetOffset);
    }
  }, [autoScheduleRequest]);

  const weekDays = WEEK_STRUCTURE.map((d, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return { ...d, dateStr: formatDate(date), date: new Date(date) };
  });

  function saveSchedule(newSchedule: Schedule) {
    setSchedule(newSchedule);
    localStorage.setItem(`schedule_${weekKey}`, JSON.stringify(newSchedule));
  }

  function resetSchedule() {
    if (!confirm('האם לאפס את כל השיבוץ השבועי? פעולה זו לא ניתנת לביטול')) return;
    const resetted: Schedule = {};
    for (const { day, shifts } of WEEK_STRUCTURE) {
      for (const shift of shifts) {
        const key = `${day}_${shift}`;
        const existing = schedule[key] || [];
        const fixedSlots = existing.filter(s => s.isFixed);
        const fresh = initializeSlots(day, shift);
        // Miya locked slot (first in fresh for בוקר)
        const miyaSlot = fresh.filter(s => s.locked);
        // Empty default slots from fresh
        const defaultEmpty = fresh.filter(s => !s.locked);
        // Only create enough empty slots to fill the gap
        const neededEmpty = Math.max(0, defaultEmpty.length - fixedSlots.length);
        resetted[key] = [...miyaSlot, ...fixedSlots, ...defaultEmpty.slice(0, neededEmpty)];
      }
      // Reset custom shift slots for this day (keep structure, clear assignments)
      for (const cs of (customShifts[day] || [])) {
        const key = `${day}_${cs.name}`;
        resetted[key] = Array.from({ length: cs.requiredCount }, () => ({
          employeeId: null, arrivalTime: cs.startTime, departureTime: cs.endTime, station: ''
        }));
      }
    }
    saveSchedule(resetted);
    setManualShortages([]);
    setResetToast(true);
    setTimeout(() => setResetToast(false), 3000);
  }


  async function toggleClosedShift(cellKey: string) {
    const [day, shift] = cellKey.split('_');
    const isClosed = !!closedShifts[cellKey];
    const updated = { ...closedShifts };
    if (isClosed) {
      delete updated[cellKey];
      const { error } = await supabase.from('closed_shifts').delete().eq('week_start', weekKey).eq('day', day).eq('shift', shift);
      if (error) console.error('Failed to open shift:', error.message);
    } else {
      updated[cellKey] = true;
      const { error } = await supabase.from('closed_shifts').upsert({ week_start: weekKey, day, shift }, { onConflict: 'week_start,day,shift' });
      if (error) console.error('Failed to close shift:', error.message);
    }
    setClosedShifts(updated);
  }

  async function closeDay(day: string) {
    const updated = { ...closedShifts };
    const dayShifts = WEEK_STRUCTURE.find(d => d.day === day)?.shifts || [];
    for (const shift of dayShifts) updated[`${day}_${shift}`] = true;
    setClosedShifts(updated);
    // Save each shift separately to ensure all are saved
    for (const shift of dayShifts) {
      const { error } = await supabase.from('closed_shifts').upsert({ week_start: weekKey, day, shift }, { onConflict: 'week_start,day,shift' });
      if (error) console.error('Failed to close shift:', error.message);
    }
  }

  async function openDay(day: string) {
    const updated = { ...closedShifts };
    const dayShifts = WEEK_STRUCTURE.find(d => d.day === day)?.shifts || [];
    for (const shift of dayShifts) delete updated[`${day}_${shift}`];
    setClosedShifts(updated);
    for (const shift of dayShifts) {
      const { error } = await supabase.from('closed_shifts').delete().eq('week_start', weekKey).eq('day', day).eq('shift', shift);
      if (error) console.error('Failed to open shift:', error.message);
    }
  }

  function saveCustomShifts(newCustomShifts: Record<string, CustomShiftDef[]>) {
    setCustomShifts(newCustomShifts);
    localStorage.setItem(`customShifts_${weekKey}`, JSON.stringify(newCustomShifts));
  }

  function createCustomShift() {
    const { name, startTime, endTime, requiredCount } = customShiftForm;
    const day = customShiftModalDay;
    if (!name || !startTime || !endTime) return;
    if (name === 'בוקר' || name === 'ערב') return;
    if ((customShifts[day] || []).some(cs => cs.name === name)) return;
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return;

    const newSchedule = { ...schedule };

    // Create custom shift slots (additive — does NOT modify morning/evening times)
    const customKey = `${day}_${name}`;
    const customSlots: Slot[] = [];
    for (let i = 0; i < requiredCount; i++) {
      customSlots.push({ employeeId: null, arrivalTime: startTime, departureTime: endTime, station: '' });
    }
    newSchedule[customKey] = customSlots;

    // Save
    saveSchedule(newSchedule);

    const newDef: CustomShiftDef = { name, day, startTime, endTime, requiredCount };
    const updated = { ...customShifts, [day]: [...(customShifts[day] || []), newDef] };
    saveCustomShifts(updated);
    setShowCustomShiftModal(false);
  }

  function deleteCustomShift(day: string, shiftName: string) {
    if (!confirm(`למחוק את משמרת ${shiftName}?`)) return;

    const dayDefs = customShifts[day] || [];
    const def = dayDefs.find(cs => cs.name === shiftName);
    if (!def) return;

    const newSchedule = { ...schedule };

    // Remove custom shift schedule key
    delete newSchedule[`${day}_${shiftName}`];

    saveSchedule(newSchedule);

    const updatedDefs = dayDefs.filter(cs => cs.name !== shiftName);
    const updatedCustomShifts = { ...customShifts };
    if (updatedDefs.length === 0) {
      delete updatedCustomShifts[day];
    } else {
      updatedCustomShifts[day] = updatedDefs;
    }
    saveCustomShifts(updatedCustomShifts);
  }

  function getAllShiftRows(): { name: string; isCustom: boolean }[] {
    const rows: { name: string; isCustom: boolean }[] = [{ name: 'בוקר', isCustom: false }];
    const allCustomNames = new Set<string>();
    for (const defs of Object.values(customShifts)) {
      for (const cs of defs) allCustomNames.add(cs.name);
    }
    // Sort custom shifts by earliest startTime across all days
    const customNamesSorted = [...allCustomNames].sort((a, b) => {
      const getEarliestStart = (name: string) => {
        let earliest = '99:99';
        for (const defs of Object.values(customShifts)) {
          for (const cs of defs) {
            if (cs.name === name && cs.startTime < earliest) earliest = cs.startTime;
          }
        }
        return earliest;
      };
      return getEarliestStart(a).localeCompare(getEarliestStart(b));
    });
    for (const name of customNamesSorted) {
      rows.push({ name, isCustom: true });
    }
    rows.push({ name: 'ערב', isCustom: false });
    return rows;
  }

  function getShiftsForDay(day: string): { name: string; isCustom: boolean }[] {
    const dayCustom = (customShifts[day] || []).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const dayStandard = WEEK_STRUCTURE.find(w => w.day === day)?.shifts || [];
    const result: { name: string; isCustom: boolean }[] = [];
    if (dayStandard.includes('בוקר')) result.push({ name: 'בוקר', isCustom: false });
    for (const cs of dayCustom) result.push({ name: cs.name, isCustom: true });
    if (dayStandard.includes('ערב')) result.push({ name: 'ערב', isCustom: false });
    return result;
  }

  function initializeSlots(day: string, shift: string): Slot[] {
    const slots: Slot[] = [];
    if (shift === 'בוקר') {
      const miya = MIYA_SCHEDULE[day];
      if (miya) {
        slots.push({ employeeId: miyaId, arrivalTime: miya.arrival, departureTime: miya.departure, station: 'אחר', locked: true });
      }
    }
    for (const def of SLOT_DEFAULTS[day]?.[shift] || []) {
      slots.push({ employeeId: null, arrivalTime: def.arrival, departureTime: def.departure, station: '' });
    }
    return slots;
  }

  function getOrInitializeSlots(day: string, shift: string): Slot[] {
    const key = `${day}_${shift}`;
    const existing = schedule[key];
    if (existing && existing.length > 0) return existing;
    // Custom shifts don't use initializeSlots — they have their own slot structure
    if (shift !== 'בוקר' && shift !== 'ערב') return [];
    return initializeSlots(day, shift);
  }

  function updateSlotField(day: string, shift: string, slotIdx: number, updates: Partial<Slot>) {
    const key = `${day}_${shift}`;
    const slots = getOrInitializeSlots(day, shift);
    const newSlots = slots.map((s, i) => i === slotIdx ? { ...s, ...updates } : s);
    saveSchedule({ ...schedule, [key]: newSlots });
  }

  function addSlot(day: string, shift: string) {
    const key = `${day}_${shift}`;
    const slots = getOrInitializeSlots(day, shift);
    let defaultArrival: string;
    let defaultDeparture: string;
    const cs = (customShifts[day] || []).find(c => c.name === shift);
    if (cs) {
      defaultArrival = cs.startTime;
      defaultDeparture = cs.endTime;
    } else {
      defaultArrival = shift === 'בוקר' ? '07:00' : '14:00';
      defaultDeparture = shift === 'בוקר' ? '14:00' : '21:00';
    }
    saveSchedule({ ...schedule, [key]: [...slots, { employeeId: null, arrivalTime: defaultArrival, departureTime: defaultDeparture, station: '' }] });
  }

  function removeSlot(day: string, shift: string, slotIdx: number) {
    const key = `${day}_${shift}`;
    const slots = getOrInitializeSlots(day, shift);
    if (slots[slotIdx]?.locked) return;
    saveSchedule({ ...schedule, [key]: slots.filter((_, i) => i !== slotIdx) });
  }


  function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }



  function checkShiftSync(day: string, savedSchedule?: Schedule, editedShift?: 'בוקר' | 'ערב') {
    const sched = savedSchedule ?? schedule;
    const morningSlots = sched[`${day}_בוקר`] || [];
    const eveningSlots = sched[`${day}_ערב`] || [];
    if (morningSlots.length === 0 || eveningSlots.length === 0) return;

    // Build station map for morning and evening
    const morningByStation: Record<string, { slot: Slot; idx: number }> = {};
    morningSlots.forEach((s, idx) => {
      if (s.employeeId !== null && s.station && s.station !== 'אחר' && s.station !== 'התלמדות')
        morningByStation[s.station] = { slot: s, idx };
    });
    const eveningByStation: Record<string, { slot: Slot; idx: number }> = {};
    eveningSlots.forEach((s, idx) => {
      if (s.employeeId !== null && s.station && s.station !== 'אחר' && s.station !== 'התלמדות')
        eveningByStation[s.station] = { slot: s, idx };
    });

    const issues: SyncIssue[] = [];
    for (const station of Object.keys(morningByStation)) {
      if (!eveningByStation[station]) continue;
      const mSlot = morningByStation[station];
      const eSlot = eveningByStation[station];
      const morningDep = mSlot.slot.departureTime;
      const eveningArr = eSlot.slot.arrivalTime;
      if (!morningDep || !eveningArr || morningDep === eveningArr) continue;
      const morningMins = timeToMinutes(morningDep);
      const eveningMins = timeToMinutes(eveningArr);
      const diff = Math.abs(eveningMins - morningMins);
      const mEmpName = employees.find(e => e.id === mSlot.slot.employeeId)?.name || '?';
      const eEmpName = employees.find(e => e.id === eSlot.slot.employeeId)?.name || '?';
      issues.push({
        station,
        morningEmpName: mEmpName,
        eveningEmpName: eEmpName,
        morningDeparture: morningDep,
        eveningArrival: eveningArr,
        type: eveningMins > morningMins ? 'gap' : 'overlap',
        diffMinutes: diff,
        morningShiftSlotIdx: mSlot.idx,
        eveningShiftSlotIdx: eSlot.idx,
      });
    }
    if (issues.length > 0) {
      setSyncWarningModal({ day, issues, editedShift: editedShift || 'בוקר' });
    }
  }

  function runAutoScheduleForWeek(
    targetWeekKey: string,
    targetSchedule: Schedule,
    targetCustomShifts: Record<string, CustomShiftDef[]>,
    targetPrefs: Record<string, EmployeePrefs>,
    targetVoltFlags: VoltFlags,
    constraints: SchedulingConstraint[] = [],
    targetClosedShifts: Record<string, boolean> = {},
  ): { schedule: Schedule; shortages: ShortageItem[]; ties: TieItem[]; emptySlots: { day: string; shift: string }[]; traineeResults: TraineeResult[] } {
    // Shadow component state with parameters for reusability across weeks
    const weekKey = targetWeekKey;
    const schedule = targetSchedule;
    const customShifts = targetCustomShifts;
    const prefs = targetPrefs;
    const voltFlags = targetVoltFlags;

    // Compute Friday date from weekKey (Sunday + 5 days)
    const fridayDate = (() => {
      const d = new Date(weekKey + 'T00:00:00');
      d.setDate(d.getDate() + 5);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();

    // Build effective structure including custom shifts
    const effectiveStructure = WEEK_STRUCTURE.map(ws => ({
      ...ws,
      shifts: [...ws.shifts.slice(0, 1), ...(customShifts[ws.day] || []).map(cs => cs.name), ...ws.shifts.slice(1)]
    }));

    // Always use canonical initializeSlots — never depend on saved schedule state.
    // This ensures every shift has the correct default number of open slots.
    const workingSlots: Record<string, Slot[]> = {};
    for (const { day, shifts } of effectiveStructure) {
      for (const shift of shifts) {
        const key = `${day}_${shift}`;
        const cs = (customShifts[day] || []).find(c => c.name === shift);
        if (cs) {
          // Custom shift: use existing schedule slots or create empty ones
          const existing = schedule[key];
          workingSlots[key] = existing ? existing.map(s => s.locked || (s.isFixed) ? { ...s } : { ...s, employeeId: null, station: '' }) : [];
          // Ensure at least requiredCount slots
          while (workingSlots[key].length < cs.requiredCount) {
            workingSlots[key].push({ employeeId: null, arrivalTime: cs.startTime, departureTime: cs.endTime, station: '' });
          }
        } else {
          workingSlots[key] = initializeSlots(day, shift);
        }
        console.log(`[AutoSchedule] ${day} ${shift}: ${workingSlots[key].filter(s => !s.locked).length} open slots`);
      }
    }

    // ── Apply min constraints (ensure minimum non-locked slot count) ──
    for (const mc of constraints.filter((c): c is MinConstraint => c.type === 'min')) {
      const key = `${mc.day}_${mc.shift}`;
      if (!workingSlots[key]) continue;
      const nonLockedCount = workingSlots[key].filter(s => !s.locked).length;
      const csDef = (customShifts[mc.day] || []).find(c => c.name === mc.shift);
      const arr = csDef?.startTime || (mc.shift === 'בוקר' ? '07:00' : '14:00');
      const dep = csDef?.endTime || (mc.shift === 'בוקר' ? '14:00' : '21:00');
      for (let i = nonLockedCount; i < mc.minCount; i++) {
        workingSlots[key].push({ employeeId: null, arrivalTime: arr, departureTime: dep, station: '' });
      }
    }

    // ── Apply closed shifts from Supabase: clear ALL slots in closed shifts ──
    for (const [cellKey, isClosed] of Object.entries(targetClosedShifts)) {
      if (!isClosed) continue;
      if (!workingSlots[cellKey]) continue;
      workingSlots[cellKey] = [];
    }

    // ── Apply close constraints: clear ALL slots (including Miya) in closed shifts ──
    for (const cc of constraints.filter((c): c is CloseConstraint => c.type === 'close')) {
      const shiftsToClose = cc.shift ? [cc.shift] : ['בוקר', 'ערב'];
      for (const shift of shiftsToClose) {
        const key = `${cc.day}_${shift}`;
        if (!workingSlots[key]) continue;
        workingSlots[key] = [];
      }
    }

    // ── Phase 0: assign fixed shifts ──
    // Only assign if: (a) employee submitted preferences, AND (b) preferences include that shift
    const empsWithFixed = employees.filter(e => e.id !== miyaId && e.fixedShifts && e.fixedShifts.length > 0);
    console.log(`[Phase 0] ${empsWithFixed.length} employees with fixedShifts:`, empsWithFixed.map(e => ({ id: e.id, name: e.name, fixedShifts: e.fixedShifts })));
    for (const emp of employees) {
      if (emp.id === miyaId) continue;
      if (!emp.fixedShifts || emp.fixedShifts.length === 0) continue;
      // Rule 1: no preferences submitted → skip entirely
      const empPrefs = prefs[emp.id];
      if (!empPrefs || Object.values(empPrefs).flat().length === 0) continue;
      for (const fs of emp.fixedShifts) {
        if (!fs.day || !fs.shift) continue;
        // Rule 3: fixed shift is guaranteed only if the employee requested that day+shift in preferences
        const dayPrefs = empPrefs[fs.day] || [];
        const requestedThisShift = dayPrefs.some((p: any) => p.shift === fs.shift);
        if (!requestedThisShift) continue;
        const key = `${fs.day}_${fs.shift}`;
        const slots = workingSlots[key];
        if (!slots) continue;
        // Check if this employee already has a slot in this shift (avoid duplicates)
        if (slots.some(s => s.employeeId === emp.id)) continue;
        const fixedSlot: Slot = {
          employeeId: emp.id,
          arrivalTime: fs.arrivalTime || (fs.shift === 'בוקר' ? '07:00' : '14:00'),
          departureTime: fs.departureTime || (fs.shift === 'בוקר' ? '14:00' : '21:00'),
          station: '',
          isFixed: true,
        };
        const emptyIdx = slots.findIndex(s => !s.locked && s.employeeId === null);
        if (emptyIdx !== -1) {
          slots[emptyIdx] = fixedSlot;
        } else {
          slots.push(fixedSlot);
        }
      }
    }

    // ── Phase 0b: Apply fix constraints (force-assign employees to specific shifts) ──
    for (const fc of constraints.filter((c): c is FixConstraint => c.type === 'fix')) {
      const key = `${fc.day}_${fc.shift}`;
      const slots = workingSlots[key];
      if (!slots) continue;
      if (slots.some(s => s.employeeId === fc.employeeId)) continue; // already assigned
      const fixedSlot: Slot = {
        employeeId: fc.employeeId,
        arrivalTime: fc.arrivalTime || (fc.shift === 'בוקר' ? '07:00' : '14:00'),
        departureTime: fc.departureTime || (fc.shift === 'בוקר' ? '14:00' : '21:00'),
        station: '',
        isFixed: true,
      };
      const emptyIdx = slots.findIndex(s => !s.locked && s.employeeId === null);
      if (emptyIdx !== -1) { slots[emptyIdx] = fixedSlot; } else { slots.push(fixedSlot); }
    }

    // Count locked (Miya) + fixed slots — everyone else starts at 0
    const assignedCount: Record<string, number> = {};
    for (const slots of Object.values(workingSlots)) {
      for (const slot of slots) {
        if (slot.employeeId !== null && (slot.locked || slot.isFixed))
          assignedCount[slot.employeeId] = (assignedCount[slot.employeeId] || 0) + 1;
      }
    }

    // Only schedule employees who submitted at least one preference this week and are not on vacation
    const activeEmployees = employees.filter(e => {
      if (e.id === miyaId) return false;
      if (isOnVacation(e, weekKey)) return false;
      const empPrefs = prefs[e.id];
      return empPrefs && Object.values(empPrefs).flat().length > 0;
    });
    const regularEmployees = activeEmployees.filter(e => !e.isTrainee);
    const traineeEmployees = activeEmployees.filter(e => e.isTrainee);
    console.log('[AutoSchedule] active employees this week:', activeEmployees.length,
      '(regular:', regularEmployees.length, ', trainees:', traineeEmployees.length, ')');

    const shortages: ShortageItem[] = [];

    // ── Phase 1: guarantee minimum shifts per employee (round-robin) ──
    const neededMap: Record<string, number> = {};
    const originalNeeded: Record<string, number> = {};
    // Count total requested slots per employee (for margin-based priority)
    const totalRequested: Record<string, number> = {};
    for (const emp of regularEmployees) {
      const minimum = Math.ceil(emp.shiftsPerWeek * 0.75);
      const n = Math.max(0, minimum - (assignedCount[emp.id] || 0));
      neededMap[emp.id] = n;
      originalNeeded[emp.id] = n;
      // Count how many distinct shift slots this employee can actually be assigned to
      // (must match both preference AND availability — same checks as findNextSlot)
      let count = 0;
      for (const { day, shifts } of effectiveStructure) {
        for (const shift of shifts) {
          if (!isEmployeeAvailable(emp, day, shift, fridayDate)) continue;
          if ((prefs[emp.id]?.[day] || []).some(p => p.shift === shift)) count++;
        }
      }
      totalRequested[emp.id] = count;
    }

    // Find next available requested open slot for an employee
    const findNextSlot = (emp: Employee) => {
      const empBlocks = constraints.filter((c): c is BlockConstraint => c.type === 'block' && c.employeeId === emp.id);
      const empLimit = constraints.find((c): c is LimitConstraint => c.type === 'limit' && c.employeeId === emp.id);
      for (const { day, shifts } of effectiveStructure) {
        for (const shift of shifts) {
          if (!isEmployeeAvailable(emp, day, shift, fridayDate)) continue;
          if (!(prefs[emp.id]?.[day] || []).some(p => p.shift === shift)) continue;
          // Block constraints: skip if employee is blocked on this day/shift
          if (empBlocks.some(c => c.day === day && (c.shift === '' || c.shift === shift))) continue;
          // Limit constraints: skip if shift type doesn't match allowed type
          if (empLimit && (shift === 'בוקר' || shift === 'ערב') && shift !== empLimit.shiftType) continue;
          const key = `${day}_${shift}`;
          const slots = workingSlots[key];
          if (slots.some(s => s.employeeId === emp.id)) continue;
          const slotIdx = slots.findIndex(s => !s.locked && s.employeeId === null);
          if (slotIdx === -1) continue;
          return { key, day, shift, slotIdx };
        }
      }
      return null;
    };

    // ── Step 1: Minimum guarantee — assign each employee up to her minimum ──
    // Order by margin ascending (least flexible first). Each employee fills
    // all her minimum slots before the next employee is considered.
    const minimumOrder = [...regularEmployees]
      .filter(e => neededMap[e.id] > 0)
      .sort((a, b) => {
        const marginA = totalRequested[a.id] - neededMap[a.id];
        const marginB = totalRequested[b.id] - neededMap[b.id];
        if (marginA !== marginB) return marginA - marginB;
        // Same margin: fewer shiftsPerWeek = higher priority
        if (a.shiftsPerWeek !== b.shiftsPerWeek) return a.shiftsPerWeek - b.shiftsPerWeek;
        // Same margin & shiftsPerWeek: lower fairness score = higher priority
        return calculateFairnessScore(a) - calculateFairnessScore(b);
      });

    console.log('[AutoSchedule] Step 1 — minimumOrder:',
      minimumOrder.map(e => ({
        name: e.name,
        needed: neededMap[e.id],
        requested: totalRequested[e.id],
        margin: totalRequested[e.id] - neededMap[e.id],
        shiftsPerWeek: e.shiftsPerWeek,
      }))
    );

    for (const emp of minimumOrder) {
      while (neededMap[emp.id] > 0) {
        const found = findNextSlot(emp);
        if (!found) break;
        const { key, day, shift, slotIdx } = found;
        const prefEntry = (prefs[emp.id]?.[day] || []).find(p => p.shift === shift);
        const departure = prefEntry?.customDeparture || workingSlots[key][slotIdx].departureTime;
        workingSlots[key][slotIdx] = { ...workingSlots[key][slotIdx], employeeId: emp.id, departureTime: departure };
        assignedCount[emp.id] = (assignedCount[emp.id] || 0) + 1;
        neededMap[emp.id]--;
      }
    }

    // Displacement: for still-short employees, take slots from over-assigned ones (iron rule)
    for (const emp of regularEmployees) {
      if (neededMap[emp.id] <= 0) continue;
      let remaining = neededMap[emp.id];
      const displaceSlots: { key: string; day: string; shift: string; slotIdx: number; currentEmpId: string }[] = [];
      for (const { day, shifts } of effectiveStructure) {
        for (const shift of shifts) {
          if (!isEmployeeAvailable(emp, day, shift, fridayDate)) continue;
          if (!(prefs[emp.id]?.[day] || []).some(p => p.shift === shift)) continue;
          const key = `${day}_${shift}`;
          const slots = workingSlots[key];
          if (slots.some(s => s.employeeId === emp.id)) continue;
          for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (slot.locked || slot.isFixed) continue;
            const currEmpId = slot.employeeId;
            if (currEmpId === null) continue;
            const currEmp = employees.find(e => e.id === currEmpId);
            if (!currEmp) continue;
            if ((assignedCount[currEmpId] || 0) <= Math.ceil(currEmp.shiftsPerWeek * 0.75)) continue;
            displaceSlots.push({ key, day, shift, slotIdx: i, currentEmpId: currEmpId });
          }
        }
      }
      for (const { key, day, shift, slotIdx, currentEmpId } of displaceSlots) {
        if (remaining <= 0) break;
        const prefEntry = (prefs[emp.id]?.[day] || []).find(p => p.shift === shift);
        const departure = prefEntry?.customDeparture || workingSlots[key][slotIdx].departureTime;
        workingSlots[key][slotIdx] = { ...workingSlots[key][slotIdx], employeeId: emp.id, departureTime: departure };
        assignedCount[emp.id] = (assignedCount[emp.id] || 0) + 1;
        assignedCount[currentEmpId] = (assignedCount[currentEmpId] || 0) - 1;
        neededMap[emp.id]--;
        remaining--;
      }
    }

    // Collect shortages
    for (const emp of regularEmployees) {
      if (neededMap[emp.id] > 0)
        shortages.push({ emp, needed: originalNeeded[emp.id], got: originalNeeded[emp.id] - neededMap[emp.id] });
    }

    // ── Phase 2: fill remaining slots with composite score (requested only) ──
    const ties: TieItem[] = [];
    const emptySlots: { day: string; shift: string }[] = [];
    const TIE_THRESHOLD = 0.001;
    for (const { day, shifts } of effectiveStructure) {
      for (const shift of shifts) {
        const key = `${day}_${shift}`;
        const slots = workingSlots[key];
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].locked || slots[i].employeeId !== null) continue;
          const alreadyInShift = new Set(
            slots.map(s => s.employeeId).filter((id): id is string => id !== null)
          );
          const candidates = regularEmployees.filter(e => {
            if (!isEmployeeAvailable(e, day, shift, fridayDate)) return false;
            if (alreadyInShift.has(e.id)) return false;
            if (!(prefs[e.id]?.[day] || []).some(p => p.shift === shift)) return false;
            // Block constraints
            const empBlocks = constraints.filter((c): c is BlockConstraint => c.type === 'block' && c.employeeId === e.id);
            if (empBlocks.some(c => c.day === day && (c.shift === '' || c.shift === shift))) return false;
            // Limit constraints
            const empLimit = constraints.find((c): c is LimitConstraint => c.type === 'limit' && c.employeeId === e.id);
            if (empLimit && (shift === 'בוקר' || shift === 'ערב') && shift !== empLimit.shiftType) return false;
            return true;
          });
          if (candidates.length === 0) {
            // Only flag as empty if NO non-locked employee is assigned in this shift at all
            const hasAssigned = slots.some(s => !s.locked && s.employeeId !== null);
            if (!hasAssigned) {
              const label = `${day}_${shift}`;
              if (!emptySlots.some(e => `${e.day}_${e.shift}` === label)) {
                emptySlots.push({ day, shift });
              }
            }
            continue;
          }
          const scores: Record<string, number> = {};
          for (const c of candidates) scores[c.id] = calculateCompositeScore(c);
          const sorted = [...candidates].sort((a, b) => scores[b.id] - scores[a.id]);
          if (sorted.length >= 2 && scores[sorted[0].id] - scores[sorted[1].id] < TIE_THRESHOLD) {
            const topScore = scores[sorted[0].id];
            const tied = sorted.filter(c => topScore - scores[c.id] < TIE_THRESHOLD);
            ties.push({ day, shift, slotIdx: i, candidates: tied, scores });
          } else {
            const best = sorted[0];
            const prefEntry = (prefs[best.id]?.[day] || []).find(p => p.shift === shift);
            const departure = prefEntry?.customDeparture || slots[i].departureTime;
            slots[i] = { ...slots[i], employeeId: best.id, departureTime: departure };
          }
        }
      }
    }

    // ── Station assignment for all filled non-locked slots ──
    for (const { day, shifts } of effectiveStructure) {
      for (const shift of shifts) {
        const key = `${day}_${shift}`;
        const slots = workingSlots[key];
        const availableStations = [
          ...getBaseStations(day),
          ...(day !== 'שישי' && voltFlags[key] ? ['וולט'] : []),
        ];
        let stIdx = 0;
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].locked || slots[i].employeeId === null) continue;
          const assignedStation = stIdx < availableStations.length ? availableStations[stIdx++] : '';
          slots[i] = { ...slots[i], station: assignedStation, voltResponsible: assignedStation === 'קופה 1' };
        }
      }
    }

    // ── Phase 3: Assign trainees alongside veteran employees ──
    const traineeResults: TraineeResult[] = [];

    for (const trainee of traineeEmployees) {
      const traineePrefs = prefs[trainee.id];
      if (!traineePrefs || Object.values(traineePrefs).flat().length === 0) {
        traineeResults.push({ name: trainee.name, assigned: false, reason: 'לא הוזנו העדפות' });
        continue;
      }

      // Collect all valid shifts with their veteran seniority score
      const candidateShifts: { day: string; shift: string; seniorityDate: string }[] = [];

      for (const { day, shifts } of effectiveStructure) {
        for (const shift of shifts) {
          if (!isEmployeeAvailable(trainee, day, shift, fridayDate)) continue;
          if (!(traineePrefs[day] || []).some(p => p.shift === shift)) continue;

          const key = `${day}_${shift}`;
          const slots = workingSlots[key];
          // Check if trainee already in this shift
          if (slots.some(s => s.employeeId === trainee.id)) continue;
          // Must have at least one regular (non-trainee, non-locked) employee assigned
          const traineeIds = new Set(traineeEmployees.map(t => t.id));
          const regularInShift = slots.filter(s =>
            s.employeeId !== null && !s.locked && !traineeIds.has(s.employeeId)
          );
          if (regularInShift.length === 0) continue;

          // Find the most veteran employee in this shift (earliest availableFromDate)
          let bestSeniority = '';
          for (const rs of regularInShift) {
            const emp = employees.find(e => e.id === rs.employeeId);
            if (emp?.availableFromDate && (!bestSeniority || emp.availableFromDate < bestSeniority)) {
              bestSeniority = emp.availableFromDate;
            }
          }
          candidateShifts.push({ day, shift, seniorityDate: bestSeniority || '9999-99-99' });
        }
      }

      // Sort: prefer shifts with most veteran employee (earliest date = most senior)
      candidateShifts.sort((a, b) => a.seniorityDate.localeCompare(b.seniorityDate));

      // Assign up to trainee.shiftsPerWeek shifts
      let tAssigned = 0;
      for (const cs of candidateShifts) {
        if (tAssigned >= trainee.shiftsPerWeek) break;
        const key = `${cs.day}_${cs.shift}`;
        const prefEntry = (traineePrefs[cs.day] || []).find(p => p.shift === cs.shift);
        const defaultSlot = SLOT_DEFAULTS[cs.day]?.[cs.shift]?.[0];
        workingSlots[key] = [
          ...workingSlots[key],
          {
            employeeId: trainee.id,
            arrivalTime: prefEntry?.customArrival || defaultSlot?.arrival || '',
            departureTime: prefEntry?.customDeparture || defaultSlot?.departure || '',
            station: 'התלמדות',
          },
        ];
        tAssigned++;
      }

      if (tAssigned === 0) {
        traineeResults.push({ name: trainee.name, assigned: false, reason: 'לא נמצאה משמרת עם עובדת ותיקה' });
      } else if (tAssigned < trainee.shiftsPerWeek) {
        traineeResults.push({ name: trainee.name, assigned: true, reason: `שובצה ל-${tAssigned} מתוך ${trainee.shiftsPerWeek} משמרות` });
      } else {
        traineeResults.push({ name: trainee.name, assigned: true });
      }
    }

    // ── Apply hours constraints (override arrival/departure after all assignments) ──
    for (const hc of constraints.filter((c): c is HoursConstraint => c.type === 'hours')) {
      const key = `${hc.day}_${hc.shift}`;
      const slots = workingSlots[key];
      if (!slots) continue;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].locked) continue;
        if (hc.employeeId !== undefined && slots[i].employeeId !== hc.employeeId) continue;
        slots[i] = { ...slots[i], arrivalTime: hc.newArrival, departureTime: hc.newDeparture };
      }
    }

    // ── Apply station hours constraints (override times for specific stations) ──
    for (const shc of constraints.filter((c): c is StationHoursConstraint => c.type === 'stationHours')) {
      const key = `${shc.day}_${shc.shift}`;
      const slots = workingSlots[key];
      if (!slots) continue;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].locked) continue;
        if (slots[i].station === shc.station) {
          slots[i] = { ...slots[i], arrivalTime: shc.newArrival, departureTime: shc.newDeparture };
        }
      }
    }

    return { schedule: { ...workingSlots }, shortages, ties, emptySlots, traineeResults };
  }

  function autoSchedule(overridePrefs?: Record<string, EmployeePrefs>) {
    const prefs = overridePrefs ?? preferences;
    const hasAnyPrefs = employees.some(e => {
      if (e.id === miyaId) return false;
      const empPrefs = prefs[e.id];
      return empPrefs && Object.values(empPrefs).flat().length > 0;
    });
    if (!hasAnyPrefs) {
      setNoPrefsToast(true);
      setTimeout(() => setNoPrefsToast(false), 4000);
      return;
    }
    const result = runAutoScheduleForWeek(weekKey, schedule, customShifts, prefs, voltFlags, schedulingConstraints, closedShifts);
    setAutoResultModal({
      isOpen: true,
      shortages: result.shortages,
      ties: result.ties,
      emptySlots: result.emptySlots,
      pendingSchedule: result.schedule,
      traineeResults: result.traineeResults,
    });
  }

  function resolveTie(tie: TieItem, chosen: Employee) {
    setAutoResultModal(prev => {
      const key = `${tie.day}_${tie.shift}`;
      const slots = prev.pendingSchedule[key] || [];
      const prefEntry = (preferences[chosen.id]?.[tie.day] || []).find(p => p.shift === tie.shift);
      const departure = prefEntry?.customDeparture || slots[tie.slotIdx]?.departureTime || '';
      const newSlots = slots.map((s, i) =>
        i === tie.slotIdx ? { ...s, employeeId: chosen.id, departureTime: departure } : s
      );
      return {
        ...prev,
        ties: prev.ties.filter(t => !(t.day === tie.day && t.shift === tie.shift && t.slotIdx === tie.slotIdx)),
        pendingSchedule: { ...prev.pendingSchedule, [key]: newSlots },
      };
    });
  }

  function getShortageProposals(shortage: ShortageItem): {
    openSlots: { day: string; shift: string; slotIdx: number }[];
    transferOptions: { fromEmp: Employee; day: string; shift: string; slotIdx: number }[];
  } {
    const emp = shortage.emp;
    const sched = autoResultModal.pendingSchedule;

    // Count current assignments in pendingSchedule (non-locked)
    const counts: Record<string, number> = {};
    const proposalStructure = WEEK_STRUCTURE.map(ws => ({
      ...ws,
      shifts: [...ws.shifts.slice(0, 1), ...(customShifts[ws.day] || []).map(cs => cs.name), ...ws.shifts.slice(1)]
    }));
    for (const { day, shifts } of proposalStructure) {
      for (const shift of shifts) {
        for (const slot of sched[`${day}_${shift}`] || []) {
          if (slot.employeeId !== null && !slot.locked)
            counts[slot.employeeId] = (counts[slot.employeeId] || 0) + 1;
        }
      }
    }

    const fridayDate = (() => {
      const d = new Date(weekKey + 'T00:00:00');
      d.setDate(d.getDate() + 5);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const canWork = (day: string, shift: string) => isEmployeeAvailable(emp, day, shift, fridayDate);

    const hasRequested = (day: string, shift: string) =>
      (preferences[emp.id]?.[day] || []).some(p => p.shift === shift);

    const openSlots: { day: string; shift: string; slotIdx: number }[] = [];
    const transferOptions: { fromEmp: Employee; day: string; shift: string; slotIdx: number }[] = [];

    for (const { day, shifts } of proposalStructure) {
      for (const shift of shifts) {
        if (!canWork(day, shift)) continue;
        // Iron rule: only consider shifts the employee explicitly requested
        if (!hasRequested(day, shift)) continue;
        const slots = sched[`${day}_${shift}`] || [];
        // Skip days/shifts the employee is already assigned to
        if (slots.some(s => s.employeeId === emp.id)) continue;
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          if (slot.locked) continue;
          if (slot.employeeId === null) {
            if (openSlots.length < 3) openSlots.push({ day, shift, slotIdx: i });
          } else if (slot.employeeId !== emp.id) {
            const fromEmp = employees.find(e => e.id === slot.employeeId);
            if (!fromEmp) continue;
            if ((counts[fromEmp.id] || 0) > fromEmp.shiftsPerWeek && transferOptions.length < 2)
              transferOptions.push({ fromEmp, day, shift, slotIdx: i });
          }
        }
      }
    }

    console.log(`[Shortage] ${emp.name} (got ${shortage.got}/${shortage.needed}):`,
      'openSlots:', openSlots.map(s => `${s.day} ${s.shift}`),
      'transfers:', transferOptions.map(t => `${t.fromEmp.name}→${t.day} ${t.shift}`));

    return { openSlots, transferOptions };
  }

  function assignToOpenSlot(shortage: ShortageItem, day: string, shift: string, slotIdx: number) {
    const emp = shortage.emp;
    const key = `${day}_${shift}`;
    const prefEntry = (preferences[emp.id]?.[day] || []).find(p => p.shift === shift);
    setAutoResultModal(prev => {
      const slots = [...(prev.pendingSchedule[key] || [])];
      slots[slotIdx] = {
        ...slots[slotIdx],
        employeeId: emp.id,
        ...(prefEntry?.customArrival ? { arrivalTime: prefEntry.customArrival } : {}),
        ...(prefEntry?.customDeparture ? { departureTime: prefEntry.customDeparture } : {}),
      };
      const newGot = shortage.got + 1;
      const updatedShortages = newGot >= shortage.needed
        ? prev.shortages.filter(s => s.emp.id !== emp.id)
        : prev.shortages.map(s => s.emp.id === emp.id ? { ...s, got: newGot } : s);
      return { ...prev, pendingSchedule: { ...prev.pendingSchedule, [key]: slots }, shortages: updatedShortages };
    });
  }

  function transferSlot(shortage: ShortageItem, fromEmpId: string, day: string, shift: string, slotIdx: number) {
    const emp = shortage.emp;
    const key = `${day}_${shift}`;
    const prefEntry = (preferences[emp.id]?.[day] || []).find(p => p.shift === shift);
    setAutoResultModal(prev => {
      const slots = [...(prev.pendingSchedule[key] || [])];
      slots[slotIdx] = {
        ...slots[slotIdx],
        employeeId: emp.id,
        ...(prefEntry?.customArrival ? { arrivalTime: prefEntry.customArrival } : {}),
        ...(prefEntry?.customDeparture ? { departureTime: prefEntry.customDeparture } : {}),
      };
      const newGot = shortage.got + 1;
      const updatedShortages = newGot >= shortage.needed
        ? prev.shortages.filter(s => s.emp.id !== emp.id)
        : prev.shortages.map(s => s.emp.id === emp.id ? { ...s, got: newGot } : s);
      // Suppress TS unused-var warning
      void fromEmpId;
      return { ...prev, pendingSchedule: { ...prev.pendingSchedule, [key]: slots }, shortages: updatedShortages };
    });
  }

  function leaveShortageManual(shortage: ShortageItem) {
    setManualShortages(prev => [...prev, shortage]);
    setAutoResultModal(prev => ({
      ...prev,
      shortages: prev.shortages.filter(s => s.emp.id !== shortage.emp.id),
    }));
  }

  function getBoardShortageProposals(shortage: ShortageItem) {
    const emp = shortage.emp;
    const counts: Record<string, number> = {};
    const boardStructure = WEEK_STRUCTURE.map(ws => ({
      ...ws,
      shifts: [...ws.shifts.slice(0, 1), ...(customShifts[ws.day] || []).map(cs => cs.name), ...ws.shifts.slice(1)]
    }));
    for (const { day, shifts } of boardStructure) {
      for (const shift of shifts) {
        for (const slot of schedule[`${day}_${shift}`] || []) {
          if (slot.employeeId !== null && !slot.locked)
            counts[slot.employeeId] = (counts[slot.employeeId] || 0) + 1;
        }
      }
    }
    const fridayDate2 = (() => {
      const d = new Date(weekKey + 'T00:00:00');
      d.setDate(d.getDate() + 5);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const canWork = (day: string, shift: string) => isEmployeeAvailable(emp, day, shift, fridayDate2);
    const openSlots: { day: string; shift: string; slotIdx: number }[] = [];
    const transferOptions: { fromEmp: Employee; day: string; shift: string; slotIdx: number }[] = [];
    for (const { day, shifts } of boardStructure) {
      for (const shift of shifts) {
        if (!canWork(day, shift)) continue;
        const slots = schedule[`${day}_${shift}`] || [];
        if (slots.some(s => s.employeeId === emp.id)) continue;
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          if (slot.locked) continue;
          if (slot.employeeId === null) {
            if (openSlots.length < 3) openSlots.push({ day, shift, slotIdx: i });
          } else {
            const fromEmp = employees.find(e => e.id === slot.employeeId);
            if (!fromEmp) continue;
            if ((counts[fromEmp.id] || 0) > fromEmp.shiftsPerWeek && transferOptions.length < 2)
              transferOptions.push({ fromEmp, day, shift, slotIdx: i });
          }
        }
      }
    }
    return { openSlots, transferOptions };
  }

  function findFreeStation(slots: Slot[], day: string, key: string): string {
    const availableStations = [
      ...getBaseStations(day),
      ...(day !== 'שישי' && voltFlags[key] ? ['וולט'] : []),
    ];
    const usedStations = new Set(slots.filter(s => s.employeeId !== null && s.station).map(s => s.station));
    return availableStations.find(st => !usedStations.has(st)) || '';
  }

  function boardAssignSlot(shortage: ShortageItem, day: string, shift: string, slotIdx: number) {
    const emp = shortage.emp;
    const key = `${day}_${shift}`;
    const prefEntry = (preferences[emp.id]?.[day] || []).find(p => p.shift === shift);
    setSchedule(prev => {
      const slots = [...(prev[key] || [])];
      const station = findFreeStation(slots, day, key);
      slots[slotIdx] = {
        ...slots[slotIdx],
        employeeId: emp.id,
        station,
        ...(prefEntry?.customArrival ? { arrivalTime: prefEntry.customArrival } : {}),
        ...(prefEntry?.customDeparture ? { departureTime: prefEntry.customDeparture } : {}),
      };
      return { ...prev, [key]: slots };
    });
    const newGot = shortage.got + 1;
    if (newGot >= shortage.needed) {
      setManualShortages(prev => prev.filter(s => s.emp.id !== emp.id));
    } else {
      setManualShortages(prev => prev.map(s => s.emp.id === emp.id ? { ...s, got: newGot } : s));
    }
  }

  function boardTransferSlot(shortage: ShortageItem, fromEmpId: string, day: string, shift: string, slotIdx: number) {
    const emp = shortage.emp;
    const key = `${day}_${shift}`;
    const prefEntry = (preferences[emp.id]?.[day] || []).find(p => p.shift === shift);
    setSchedule(prev => {
      const slots = [...(prev[key] || [])];
      // Keep the station the transferred-from employee had (it's now free for the new employee)
      const existingStation = slots[slotIdx].station;
      slots[slotIdx] = {
        ...slots[slotIdx],
        employeeId: emp.id,
        station: existingStation || findFreeStation(slots, day, key),
        ...(prefEntry?.customArrival ? { arrivalTime: prefEntry.customArrival } : {}),
        ...(prefEntry?.customDeparture ? { departureTime: prefEntry.customDeparture } : {}),
      };
      return { ...prev, [key]: slots };
    });
    void fromEmpId;
    const newGot = shortage.got + 1;
    if (newGot >= shortage.needed) {
      setManualShortages(prev => prev.filter(s => s.emp.id !== emp.id));
    } else {
      setManualShortages(prev => prev.map(s => s.emp.id === emp.id ? { ...s, got: newGot } : s));
    }
  }

  function saveAutoResult() {
    const finalSchedule = { ...autoResultModal.pendingSchedule };
    const saveStructure = WEEK_STRUCTURE.map(ws => ({
      ...ws,
      shifts: [...ws.shifts.slice(0, 1), ...(customShifts[ws.day] || []).map(cs => cs.name), ...ws.shifts.slice(1)]
    }));
    for (const { day, shifts } of saveStructure) {
      for (const shift of shifts) {
        const key = `${day}_${shift}`;
        const slots = finalSchedule[key];
        if (!slots) continue;
        const availableStations = [
          ...getBaseStations(day),
          ...(day !== 'שישי' && voltFlags[key] ? ['וולט'] : []),
        ];
        let stIdx = 0;
        finalSchedule[key] = slots.map(slot => {
          if (slot.locked || slot.employeeId === null) return slot;
          return { ...slot, station: stIdx < availableStations.length ? availableStations[stIdx++] : '' };
        });
      }
    }
    saveSchedule(finalSchedule);
    addFairnessEvents(finalSchedule, weekKey);

    // Save close constraints to Supabase closed_shifts + update visual state
    const closeConstraints = schedulingConstraints.filter((c): c is CloseConstraint => c.type === 'close');
    if (closeConstraints.length > 0 || Object.keys(closedShifts).length > 0) {
      const updatedClosed = { ...closedShifts };
      for (const cc of closeConstraints) {
        const shiftsToClose = cc.shift ? [cc.shift] : ['בוקר', 'ערב'];
        for (const s of shiftsToClose) {
          updatedClosed[`${cc.day}_${s}`] = true;
        }
      }
      setClosedShifts(updatedClosed);
      // Persist new closures to Supabase
      const newRows = closeConstraints.flatMap(cc => {
        const shifts = cc.shift ? [cc.shift] : ['בוקר', 'ערב'];
        return shifts.map(s => ({ week_start: weekKey, day: cc.day, shift: s }));
      });
      if (newRows.length > 0) {
        for (const row of newRows) {
          supabase.from('closed_shifts').upsert(row, { onConflict: 'week_start,day,shift' });
        }
      }
    }

    // Track biweekly Friday assignments in localStorage
    const fridayDate = (() => {
      const d = new Date(weekKey + 'T00:00:00');
      d.setDate(d.getDate() + 5);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    for (const shift of ['בוקר']) {
      const key = `שישי_${shift}`;
      for (const slot of finalSchedule[key] || []) {
        if (slot.employeeId !== null) {
          const emp = employees.find(e => e.id === slot.employeeId);
          if (emp?.fridayAvailability === 'biweekly') {
            localStorage.setItem(`lastFridayWorked_${emp.id}`, fridayDate);
          }
        }
      }
    }

    setAutoResultModal({ isOpen: false, shortages: [], ties: [], emptySlots: [], pendingSchedule: {}, traineeResults: [] });
  }

  function generateWhatsAppText(): string {
    const friday = new Date(weekStart);
    friday.setDate(weekStart.getDate() + 5);
    const lines: string[] = [];

    lines.push(`🌿 נוי השדה — שוהם`);
    lines.push(`📅 שבוע ${formatDate(weekStart)}–${formatDate(friday)}.${weekStart.getFullYear()}`);
    lines.push(`─────────────────`);

    for (const d of weekDays) {
      const dayShifts = getShiftsForDay(d.day);
      for (const { name: shift, isCustom } of dayShifts) {
        const cellKey = `${d.day}_${shift}`;
        const slots = getOrInitializeSlots(d.day, shift);

        // Shift emoji
        let emoji = '☀️';
        if (d.day === 'שישי') emoji = '🗓️';
        else if (shift === 'ערב') emoji = '🌙';
        else if (isCustom) emoji = '⭐';

        const label = isCustom ? shift : shift;
        lines.push('');
        lines.push(`${emoji} ${d.day} ${d.dateStr} — ${label}`);

        // Volt indicator
        if (d.day !== 'שישי' && voltFlags[cellKey]) {
          lines.push(`🛵 וולט פעיל`);
        }

        // Slots
        if (slots.length === 0) {
          lines.push(`⚠️ אין סלוטים`);
        } else {
          for (const slot of slots) {
            if (slot.employeeId !== null) {
              const name = (slot.locked && slot.employeeId !== null)
                ? 'מיה'
                : employees.find(e => e.id === slot.employeeId)?.name || '?';
              const station = slot.station ? ` (${slot.station})` : '';
              lines.push(`- ${slot.arrivalTime} ${name}${station}`);
            } else {
              lines.push(`- ⚠️ חסר עובדת`);
            }
          }
        }
      }
    }

    lines.push('');
    lines.push(`─────────────────`);
    lines.push(`הועתק מנוי השדה 📋`);

    return lines.join('\n');
  }

  function generatePDF(selectedWeekKeys: string[]) {
    try {
      const allKeys = [...selectedWeekKeys].sort();
      if (allKeys.length === 0) { alert('אין שבועות שמורים'); return; }

      // Build station badge helper
      const stBadge = (station: string) => {
        if (!station) return '';
        let bg = '#EAF3DE', color = '#3B6D11';
        if (station === 'וולט') { bg = '#E6F1FB'; color = '#185FA5'; }
        else if (station === 'התלמדות') { bg = '#EEEDFE'; color = '#534AB7'; }
        else if (station === 'אחר') { bg = '#F1EFE8'; color = '#5F5E5A'; }
        else if (!station.startsWith('קופה')) { bg = '#F1EFE8'; color = '#5F5E5A'; }
        const label = station === 'קופה 1' ? 'ק1' : station === 'קופה 2' ? 'ק2' : station === 'קופה 3' ? 'ק3' : station === 'קופה 4' ? 'ק4' : station === 'וולט' ? 'וולט' : station === 'התלמדות' ? 'התלמדות' : station === 'אחר' ? 'אחר' : station;
        return `<span style="display:inline-block;font-size:10px;padding:1px 6px;border-radius:999px;background:${bg};color:${color};font-weight:500;margin-top:1px">${label}</span>`;
      };

      // Build slot card helper
      const slotCard = (s: Slot, isMorning: boolean) => {
        const name = (s.locked && s.employeeId !== null) ? 'מיה' : employees.find(e => e.id === s.employeeId)?.name || '?';
        const borderColor = isMorning ? '#3B6D11' : '#B07820';
        const textColor = isMorning ? '#2D5016' : '#854F0B';
        const badge = stBadge(s.station);
        return `<div style="background:#fff;border-radius:6px;padding:4px 6px;margin-bottom:3px;border:0.5px solid #C8D8A0;border-right:3px solid ${borderColor}">
          <div style="font-size:15px;font-weight:700;color:${textColor}">${s.arrivalTime || '—'}–${s.departureTime || '—'}</div>
          <div style="font-size:12px;font-weight:600;color:${textColor}">${name}</div>
          ${badge ? `<div>${badge}</div>` : ''}
          ${(s.voltResponsible || (!s.locked && s.station === 'קופה 1' && s.voltResponsible !== false)) ? '<div style="font-size:9px;font-weight:700;color:#7c3aed;background:#f3e8ff;padding:1px 5px;border-radius:4px;display:inline-block;margin-top:2px">וולט</div>' : ''}
        </div>`;
      };

      // Build pages
      let pages = '';
      for (const wk of allKeys) {
        const sunday = new Date(wk + 'T00:00:00');
        const friday = new Date(sunday.getTime() + 5 * 86400000);
        const dateRange = `${sunday.getDate()}.${sunday.getMonth() + 1} – ${friday.getDate()}.${friday.getMonth() + 1}.${sunday.getFullYear()}`;

        const savedSched: Schedule = JSON.parse(localStorage.getItem(`schedule_${wk}`) || '{}');
        const savedCS: Record<string, CustomShiftDef[]> = JSON.parse(localStorage.getItem(`customShifts_${wk}`) || '{}');

        // Determine shift rows: בוקר, custom shifts sorted by time, ערב
        const customNames = new Set<string>();
        for (const defs of Object.values(savedCS)) {
          for (const cs of defs) customNames.add(cs.name);
        }
        const customSorted = [...customNames].sort((a, b) => {
          const getStart = (n: string) => { for (const ds of Object.values(savedCS)) { const c = ds.find(x => x.name === n); if (c) return c.startTime; } return '99:99'; };
          return getStart(a).localeCompare(getStart(b));
        });
        const shiftRows: { name: string; isCustom: boolean }[] = [
          { name: 'בוקר', isCustom: false },
          ...customSorted.map(n => ({ name: n, isCustom: true })),
          { name: 'ערב', isCustom: false },
        ];

        // Day dates
        const dayDates: string[] = [];
        for (let i = 0; i < 6; i++) {
          const d = new Date(sunday.getTime() + i * 86400000);
          dayDates.push(`${d.getDate()}.${d.getMonth() + 1}`);
        }
        const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

        // Header columns
        let thead = '<tr>';
        thead += '<th style="width:60px;background:#2D5016;color:#F5EFD8;font-size:12px;font-weight:700;padding:8px 4px;text-align:center">משמרת</th>';
        for (let i = 0; i < 6; i++) {
          thead += `<th style="width:calc((100% - 60px)/6);background:#2D5016;color:#F5EFD8;font-size:12px;font-weight:700;padding:8px 4px;text-align:center">${dayNames[i]}<br><span style="font-weight:400;font-size:11px">${dayDates[i]}</span></th>`;
        }
        thead += '</tr>';

        // Body rows
        let tbody = '';
        for (const sr of shiftRows) {
          const isMorning = sr.name === 'בוקר';
          const isEvening = sr.name === 'ערב';
          const shiftLabelBg = isMorning ? '#3B6D11' : isEvening ? '#854F0B' : '#B07820';
          const cellBg = isMorning ? '#F0F7E6' : isEvening ? '#FDF6E3' : '#FFF7ED';
          const borderTopColor = isMorning ? '#D4E8A8' : isEvening ? '#E8D8A0' : '#FCEBC8';

          tbody += '<tr>';
          tbody += `<td style="background:${shiftLabelBg};color:#F5EFD8;font-weight:700;font-size:12px;text-align:center;padding:6px 2px;writing-mode:vertical-rl;border-top:1px solid ${borderTopColor}">${sr.isCustom ? sr.name : sr.name}</td>`;

          for (let di = 0; di < 6; di++) {
            const day = dayNames[di];
            const dayHasShift = sr.isCustom
              ? (savedCS[day] || []).some(cs => cs.name === sr.name)
              : (WEEK_STRUCTURE.find(w => w.day === day)?.shifts.includes(sr.name) ?? false);

            // Friday evening — special cell
            if (day === 'שישי' && isEvening) {
              tbody += `<td style="background:#F5F0E8;text-align:center;vertical-align:middle;padding:6px;border-top:1px solid ${borderTopColor};font-size:11px;color:#94a3b8">אין ערב בשישי</td>`;
              continue;
            }

            if (!dayHasShift) {
              tbody += `<td style="background:${cellBg};text-align:center;vertical-align:top;padding:6px;border-top:1px solid ${borderTopColor};color:#bbb">—</td>`;
              continue;
            }

            const key = `${day}_${sr.name}`;
            const slots: Slot[] = savedSched[key] || [];
            const assigned = slots.filter(s => s.employeeId !== null);
            const smallFont = assigned.length > 6;

            let cellContent = '';
            if (assigned.length === 0) {
              cellContent = '<span style="color:#ccc;font-size:11px">—</span>';
            } else {
              for (const s of assigned) {
                cellContent += slotCard(s, isMorning || sr.isCustom);
              }
            }

            // Birthday banners (morning shift only — shown regardless of scheduling)
            if (isMorning) {
              const dayDateObj = new Date(sunday.getTime() + di * 86400000);
              const birthdayEmps = employees.filter(e => isBirthdayOnDate(e.birthday, dayDateObj));
              for (const be of birthdayEmps) {
                cellContent += `<div style="margin-top:3px;padding:2px 6px;background:#FEF3E2;border-radius:4px;font-size:10px;color:#c17f3b;font-weight:600;text-align:center">🎂 יום הולדת ${be.name}</div>`;
              }
            }

            tbody += `<td style="background:${cellBg};vertical-align:top;padding:4px;border-top:1px solid ${borderTopColor}${smallFont ? ';font-size:10px' : ''}">${cellContent}</td>`;
          }
          tbody += '</tr>';
        }

        // Today's date for footer
        const now = new Date();
        const printDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

        pages += `<div class="week-page">
          <div style="background:#2D5016;border-radius:10px;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div>
              <div style="font-size:22px;font-weight:700;color:#F5EFD8">נוי השדה — שוהם</div>
              <div style="font-size:13px;color:#A8C97A">לוח שיבוץ משמרות</div>
            </div>
            <div style="font-size:15px;color:#F5EFD8;font-weight:500;text-align:left">${dateRange}</div>
          </div>
          <table style="width:100%;border-collapse:separate;border-spacing:0;border:1.5px solid #C8D8A0;border-radius:10px;overflow:hidden;table-layout:fixed">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
          </table>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:0 4px">
            <div style="font-size:11px;color:#888">הודפס: ${printDate}</div>
            <div style="display:flex;gap:12px;align-items:center;font-size:11px;color:#555">
              <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#F0F7E6;border:1px solid #D4E8A8"></span> בוקר</span>
              <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#FDF6E3;border:1px solid #E8D8A0"></span> ערב</span>
              <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#EEEDFE;border:1px solid #C5C3F0"></span> מתלמד/ת</span>
              <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#E6F1FB;border:1px solid #A8D0F0"></span> וולט</span>
            </div>
          </div>
        </div>`;
      }

      const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>שיבוץ משמרות — נוי השדה</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; }
table { border-collapse: separate; border-spacing: 0; }
td, th { border: none; }
.week-page { padding: 12mm; }
.no-print { text-align: center; padding: 16px; }
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .week-page { padding: 0; page-break-after: always; }
  .week-page:last-child { page-break-after: avoid; }
  .no-print { display: none; }
}
</style></head><body>
<div class="no-print">
  <button onclick="window.print()" style="padding:10px 28px;font-size:15px;font-family:'Heebo',Arial,sans-serif;background:#2D5016;color:#F5EFD8;border:none;border-radius:8px;cursor:pointer;font-weight:700;margin:0 6px">🖨️ הדפס</button>
  <button onclick="window.close()" style="padding:10px 28px;font-size:15px;font-family:'Heebo',Arial,sans-serif;background:#f5f0e8;color:#475569;border:1px solid #e8e0d4;border-radius:8px;cursor:pointer;font-weight:600;margin:0 6px">✕ סגור</button>
</div>
${pages}
</body></html>`;

      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
      else alert('לא ניתן לפתוח חלון חדש. בדוק חוסם פופ-אפים.');
    } catch (err) {
      alert('שגיאה: ' + (err as any).message);
    }
  }

  function renderSlotRow(
    day: string,
    shift: string,
    slot: Slot,
    slotIdx: number,
    stations: string[],
  ) {
    const isLockedSlot = slot.locked === true;
    const isMiyaFixed = isLockedSlot && slot.employeeId !== null;
    const isTraineeSlot = slot.station === 'התלמדות';
    const isFixedSlot = slot.isFixed === true;
    const isEmpty = slot.employeeId === null;
    const slotEmp = slot.employeeId !== null ? employees.find(e => e.id === slot.employeeId) : null;
    const empName = isMiyaFixed ? 'מיה' : slotEmp?.name || null;
    const dayDate = weekDays.find(wd => wd.day === day)?.date;
    const isBirthday = !isEmpty && slotEmp && dayDate ? isBirthdayOnDate(slotEmp.birthday, dayDate) : false;
    const isEditing = editingSlot?.day === day && editingSlot?.shift === shift && editingSlot?.slotIdx === slotIdx;
    const slotKey = `${day}_${shift}_${slotIdx}`;
    const isHovered = hoveredSlot === slotKey;

    const stationLabel = getStationBadge(slot.station);

    const shiftSlots = schedule[`${day}_${shift}`] || [];

    // Card background & border
    const cardBg = isMiyaFixed ? '#f0fdf4' : isTraineeSlot ? '#fff7ed' : isFixedSlot ? '#E6F1FB' : 'white';
    const cardBorder = isMiyaFixed
      ? '1px solid #a7d5b8'
      : isTraineeSlot
      ? '1px solid #fed7aa'
      : isFixedSlot
      ? '1px solid #B3D4F0'
      : isEmpty
      ? '1px dashed #cbd5e1'
      : isHovered
      ? '1px solid #4a7c59'
      : '1px solid #e8e0d4';

    const popoverInputStyle: React.CSSProperties = { width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #e8e0d4', borderRadius: 4, color: '#1a1a1a' };
    const popoverSelectStyle: React.CSSProperties = { ...popoverInputStyle };
    const popoverLabelStyle: React.CSSProperties = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 };

    function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
      if (isEditing) {
        closePopover(true);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const popW = isMobile ? 260 : 220;
      const popH = 280;
      let top = rect.bottom + 4;
      let left = rect.right - popW;
      if (top + popH > window.innerHeight) top = rect.top - popH - 4;
      if (left < 8) left = 8;
      if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
      setPopoverPos({ top, left });
      setEditingSlot({ day, shift, slotIdx, isNew: isEmpty });
      setTempSlotData({ employeeId: slot.employeeId, arrivalTime: slot.arrivalTime, departureTime: slot.departureTime, station: slot.station, voltResponsible: slot.voltResponsible });
      setSlotDirtyBoth(false);
      setPopoverValidationError(false);
    }

    return (
      <div key={slotIdx} style={{ marginBottom: 3, position: 'relative' }}
        onMouseEnter={() => setHoveredSlot(slotKey)}
        onMouseLeave={() => setHoveredSlot(null)}
      >
        {/* Delete X on card — hover only, not on locked Miya slots */}
        {isHovered && !isLockedSlot && !isEmpty && (
          <button
            onClick={e => { e.stopPropagation(); removeSlot(day, shift, slotIdx); }}
            style={{
              position: 'absolute', top: -5, left: -5, zIndex: 10,
              width: 18, height: 18, borderRadius: '50%',
              background: '#ef4444', color: 'white', border: 'none',
              cursor: 'pointer', fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, lineHeight: 1,
            }}
          >✕</button>
        )}
        {/* Card */}
        <div
          ref={isEditing ? cardRef : undefined}
          onClick={handleCardClick}
          style={{
            borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
            background: cardBg,
            border: cardBorder,
            boxShadow: isHovered ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            transition: 'box-shadow 0.15s, border-color 0.15s',
          }}
        >
          {isEmpty ? (
            <span style={{ color: '#94a3b8', fontSize: 12 }}>ריק</span>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a4a2e', lineHeight: 1.3 }}>
                {isBirthday && <span>🎂 </span>}{empName}
              </div>
              {isBirthday && (
                <div style={{ fontSize: 10, color: '#c17f3b', fontWeight: 600, lineHeight: 1.2 }}>יום הולדת!</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {slot.arrivalTime && slot.arrivalTime !== '0' ? slot.arrivalTime : '—'} → {slot.departureTime && slot.departureTime !== '0' ? slot.departureTime : '—'}
                </span>
                <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  {isFixedSlot && (
                    <span style={{ fontSize: 9, background: '#0C447C', color: 'white', padding: '1px 5px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>קבוע</span>
                  )}
                  {isTraineeSlot && (
                    <span style={{ fontSize: 9, background: '#c17f3b', color: 'white', padding: '1px 5px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>מתלמד</span>
                  )}
                  {stationLabel && (
                    <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {stationLabel}
                    </span>
                  )}
                  {(slot.voltResponsible || (!slot.locked && slot.station === 'קופה 1' && slot.voltResponsible !== false)) && (
                    <span style={{ fontSize: 9, background: '#7c3aed', color: 'white', padding: '1px 5px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>וולט</span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Popover via Portal */}
        {isEditing && popoverPos && createPortal(
          <>
            {/* Backdrop (mobile: dim overlay, desktop: transparent click catcher) */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998, background: isMobile ? 'rgba(0,0,0,0.3)' : 'transparent' }}
              onClick={() => { if (slotDirty) { setUnsavedTarget('slot'); } else { closePopover(true); } }}
            />
            <div
              ref={popoverRef}
              style={{
                position: 'fixed',
                top: isMobile ? '50%' : popoverPos.top,
                left: isMobile ? '50%' : popoverPos.left,
                transform: isMobile ? 'translate(-50%, -50%)' : undefined,
                zIndex: 9999,
                background: 'white',
                border: '1px solid #e8e0d4',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                padding: isMobile ? 12 : 10,
                width: isMobile ? 260 : 220,
                direction: 'rtl',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* X close button — closes without saving */}
              <button
                onClick={() => { if (slotDirty) { setUnsavedTarget('slot'); } else { closePopover(true); } }}
                style={{ float: 'left', width: 22, height: 22, borderRadius: '50%', background: '#f5f0e8', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', padding: 0, marginBottom: 4 }}
              >✕</button>

              {isLockedSlot ? (
                <>
                  {/* Locked (Miya) slot — uses tempSlotData */}
                  <label style={popoverLabelStyle}>עובדת:</label>
                  <div style={{ fontWeight: 700, fontSize: 13, color: isMiyaFixed ? '#1a4a2e' : '#94a3b8', marginBottom: 8 }}>
                    {isMiyaFixed ? 'מיה (קבועה)' : 'ריק (סלוט מיה)'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <div style={{ flex: 1 }}>
                      <label style={popoverLabelStyle}>התחלה:</label>
                      <input type="time" value={tempSlotData.arrivalTime}
                        onChange={e => { setTempSlotData(prev => ({ ...prev, arrivalTime: e.target.value })); setSlotDirtyBoth(true); }}
                        style={popoverInputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={popoverLabelStyle}>סיום:</label>
                      <input type="time" value={tempSlotData.departureTime}
                        onChange={e => { setTempSlotData(prev => ({ ...prev, departureTime: e.target.value })); setSlotDirtyBoth(true); }}
                        style={popoverInputStyle} />
                    </div>
                  </div>
                  <label style={popoverLabelStyle}>עמדה:</label>
                  <select value={tempSlotData.station}
                    onChange={e => { setTempSlotData(prev => ({ ...prev, station: e.target.value })); setSlotDirtyBoth(true); }}
                    style={{ ...popoverSelectStyle, marginBottom: 4 }}>
                    <option value="">— בחר —</option>
                    {stations.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {isMiyaFixed && (
                      <button
                        onClick={() => { updateSlotField(day, shift, slotIdx, { employeeId: null, station: '' }); closePopover(false); }}
                        style={{ width: '100%', padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#fff7ed', color: '#c17f3b', border: '1px solid #fed7aa', borderRadius: 5, cursor: 'pointer' }}
                      >נקה משמרת</button>
                    )}
                    {!isMiyaFixed && (
                      <button
                        onClick={() => { updateSlotField(day, shift, slotIdx, { employeeId: miyaId, station: 'אחר' }); closePopover(false); }}
                        style={{ width: '100%', padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#f0fdf4', color: '#16a34a', border: '1px solid #a7d5b8', borderRadius: 5, cursor: 'pointer' }}
                      >שבץ מיה חזרה</button>
                    )}
                    <button
                      onClick={() => { if (slotDirty) { setUnsavedTarget('slot'); } else { closePopover(false); } }}
                      style={{ width: '100%', padding: '6px 10px', fontSize: 12, fontWeight: 600, background: 'white', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 5, cursor: 'pointer' }}
                    >ביטול</button>
                    <button
                      onClick={() => {
                        const key = `${day}_${shift}`;
                        const slots = getOrInitializeSlots(day, shift);
                        const newSlots = slots.map((s, i) => i === slotIdx ? { ...s, arrivalTime: tempSlotData.arrivalTime, departureTime: tempSlotData.departureTime, station: tempSlotData.station, voltResponsible: tempSlotData.voltResponsible } : s);
                        const updatedSchedule = { ...schedule, [key]: newSlots };
                        saveSchedule(updatedSchedule);
                        closePopover(false);
                        setSlotSaveToast(true);
                        setTimeout(() => setSlotSaveToast(false), 2000);
                        checkShiftSync(day, updatedSchedule, shift as 'בוקר' | 'ערב');
                      }}
                      style={{ width: '100%', padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer' }}
                    >שמור שינויים</button>
                  </div>
                </>
              ) : (() => {
                /* Non-locked slot — uses tempSlotData */
                const tempEmpId = tempSlotData.employeeId;
                const tempIsDuplicate = tempEmpId !== null && (() => {
                  // Check same shift
                  if (shiftSlots.some((s, i) => i !== slotIdx && s.employeeId !== null && s.employeeId === tempEmpId)) return true;
                  // Check other shifts on the same day
                  const dayShifts = WEEK_STRUCTURE.find(w => w.day === day)?.shifts || [];
                  for (const otherShift of dayShifts) {
                    if (otherShift === shift) continue;
                    const otherSlots = schedule[`${day}_${otherShift}`] || [];
                    if (otherSlots.some(s => s.employeeId !== null && s.employeeId === tempEmpId)) return true;
                  }
                  return false;
                })();
                const tempDuplicateName = tempIsDuplicate ? (employees.find(e => e.id === tempEmpId)?.name || '') : '';
                const tempStationTaken = !!tempSlotData.station && tempSlotData.station !== 'התלמדות' && shiftSlots.some((s, i) =>
                  i !== slotIdx && !s.locked && s.station === tempSlotData.station && s.employeeId !== null
                );
                const tempOnVacation = tempEmpId !== null && (() => {
                  const emp = employees.find(e => e.id === tempEmpId);
                  return emp ? isOnVacation(emp, weekKey) : false;
                })();
                const tempIsIncomplete = tempEmpId === null || !tempSlotData.arrivalTime || !tempSlotData.departureTime || !tempSlotData.station;
                return (
                  <>
                    {/* Employee — grouped by preference */}
                    <label style={popoverLabelStyle}>עובדת:</label>
                    {(() => {
                      const requested: typeof employees = [];
                      const others: typeof employees = [];
                      for (const e of employees) {
                        if (e.id === miyaId) continue;
                        const empPrefs = preferences[e.id];
                        const dayPrefs = empPrefs?.[day] || [];
                        if (dayPrefs.some((pr: any) => (typeof pr === 'string' ? pr : pr.shift) === shift)) {
                          requested.push(e); continue;
                        }
                        others.push(e);
                      }
                      return (
                        <select
                          value={tempEmpId ?? ''}
                          onChange={e => {
                            const newId = e.target.value !== '' ? e.target.value : null;
                            setTempSlotData(prev => ({ ...prev, employeeId: newId }));
                            setPopoverValidationError(false);
                            setSlotDirtyBoth(true);
                          }}
                          style={{ ...popoverSelectStyle, marginBottom: 4, ...(tempIsDuplicate || (popoverValidationError && tempEmpId === null) ? { borderColor: '#ef4444' } : {}) }}
                        >
                          <option value="">— ריק —</option>
                          {requested.length > 0 && <optgroup label="ביקשו משמרת זו">
                            {requested.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </optgroup>}
                          <optgroup label="שאר העובדות">
                            {others.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </optgroup>
                        </select>
                      );
                    })()}
                    {tempIsDuplicate && (
                      <div style={{ fontSize: 10, color: '#dc2626', marginBottom: 4, fontWeight: 600 }}>
                        ⚠️ {tempDuplicateName} כבר משובצת ביום זה
                      </div>
                    )}
                    {tempOnVacation && (
                      <div style={{ fontSize: 10, color: '#c17f3b', marginBottom: 4, fontWeight: 600 }}>
                        ⚠️ עובדת זו בחופש בתאריכים אלו
                      </div>
                    )}
                    {popoverValidationError && !tempIsDuplicate && tempEmpId === null && (
                      <div style={{ fontSize: 10, color: '#dc2626', marginBottom: 4 }}>שדה חובה</div>
                    )}

                    {/* Times */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                      <div style={{ flex: 1 }}>
                        <label style={popoverLabelStyle}>התחלה:</label>
                        <input
                          type="time"
                          value={tempSlotData.arrivalTime}
                          onChange={e => { setTempSlotData(prev => ({ ...prev, arrivalTime: e.target.value })); setPopoverValidationError(false); setSlotDirtyBoth(true); }}
                          style={{ ...popoverInputStyle, ...(popoverValidationError && !tempSlotData.arrivalTime ? { borderColor: '#ef4444' } : {}) }}
                        />
                        {popoverValidationError && !tempSlotData.arrivalTime && (
                          <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>שדה חובה</div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={popoverLabelStyle}>סיום:</label>
                        <input
                          type="time"
                          value={tempSlotData.departureTime}
                          onChange={e => { setTempSlotData(prev => ({ ...prev, departureTime: e.target.value })); setPopoverValidationError(false); setSlotDirtyBoth(true); }}
                          style={{ ...popoverInputStyle, ...(popoverValidationError && !tempSlotData.departureTime ? { borderColor: '#ef4444' } : {}) }}
                        />
                        {popoverValidationError && !tempSlotData.departureTime && (
                          <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>שדה חובה</div>
                        )}
                      </div>
                    </div>

                    {/* Station */}
                    <label style={popoverLabelStyle}>עמדה:</label>
                    <select
                      value={tempSlotData.station}
                      onChange={e => { setTempSlotData(prev => ({ ...prev, station: e.target.value })); setPopoverValidationError(false); setSlotDirtyBoth(true); }}
                      style={{ ...popoverSelectStyle, marginBottom: 4, ...((popoverValidationError && !tempSlotData.station) || tempStationTaken ? { borderColor: '#ef4444' } : {}) }}
                    >
                      <option value="">— בחר —</option>
                      {stations.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {popoverValidationError && !tempSlotData.station && (
                      <div style={{ fontSize: 10, color: '#dc2626', marginBottom: 4 }}>שדה חובה</div>
                    )}
                    {tempStationTaken && (
                      <div style={{ fontSize: 10, color: '#dc2626', marginBottom: 4, fontWeight: 600 }}>
                        ⚠️ עמדה זו כבר תפוסה — בחר עמדה אחרת
                      </div>
                    )}

                    {/* Volt responsibility */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#7c3aed', cursor: 'pointer', marginBottom: 4, marginTop: 2 }}>
                      <input type="checkbox" checked={tempSlotData.voltResponsible ?? (tempSlotData.station === 'קופה 1')} onChange={e => {
                        const newVal = e.target.checked;
                        if (newVal) {
                          // Check if there's already a volt responsible slot in this shift
                          const shiftSlots = getOrInitializeSlots(day, shift);
                          const existingVolt = shiftSlots
                            .map((s, i) => ({ s, i }))
                            .filter(({ s, i }) => i !== slotIdx && (s.voltResponsible || (!s.locked && s.station === 'קופה 1' && s.voltResponsible !== false)));
                          if (existingVolt.length > 0) {
                            // Build conflict list
                            const voltSlots = [
                              ...existingVolt.map(({ s, i }) => ({
                                idx: i,
                                empName: s.locked ? 'מיה' : employees.find(emp => emp.id === s.employeeId)?.name || '?',
                                station: s.station,
                                checked: true,
                              })),
                              { idx: slotIdx, empName: employees.find(emp => emp.id === tempSlotData.employeeId)?.name || '?', station: tempSlotData.station, checked: true },
                            ];
                            setVoltConflictModal({ day, shift, slots: voltSlots });
                            return;
                          }
                        }
                        setTempSlotData(prev => ({ ...prev, voltResponsible: newVal }));
                        setSlotDirtyBoth(true);
                      }} style={{ width: 13, height: 13, accentColor: '#7c3aed' }} />
                      אחראית וולט
                    </label>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => {
                          if (tempIsIncomplete || tempIsDuplicate || tempStationTaken) {
                            setPopoverValidationError(true);
                            return;
                          }
                          const key = `${day}_${shift}`;
                          const slots = getOrInitializeSlots(day, shift);
                          const newSlots = slots.map((s, i) => i === slotIdx ? { ...s, employeeId: tempSlotData.employeeId, arrivalTime: tempSlotData.arrivalTime, departureTime: tempSlotData.departureTime, station: tempSlotData.station, voltResponsible: tempSlotData.voltResponsible } : s);
                          const updatedSchedule = { ...schedule, [key]: newSlots };
                          saveSchedule(updatedSchedule);
                          const addedName = employees.find(e => e.id === tempSlotData.employeeId)?.name || '';
                          setEditingSlot(null); setPopoverPos(null); setPopoverValidationError(false);
                          if (editingSlot?.isNew) {
                            setSlotAddToast(addedName);
                            setTimeout(() => setSlotAddToast(null), 2000);
                          }
                          checkShiftSync(day, updatedSchedule, shift as 'בוקר' | 'ערב');
                        }}
                        style={{ flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer' }}
                      >
                        {editingSlot?.isNew ? 'הוסף' : 'עדכן'}
                      </button>
                    </div>
                    {/* Save as fixed shift button */}
                    {!isEmpty && !editingSlot?.isNew && refreshEmployees && (
                      <button
                        onClick={async () => {
                          const emp = employees.find(e => e.id === slot.employeeId);
                          if (!emp) return;
                          // Save fixed shift to Supabase (store as JSON — future: dedicated table)
                          // For now, just update local state and refresh
                          updateSlotField(day, shift, slotIdx, { isFixed: true });
                          setEditingSlot(null); setPopoverPos(null); setPopoverValidationError(false);
                          setFixedShiftToast(emp.name);
                          setTimeout(() => setFixedShiftToast(null), 2500);
                        }}
                        style={{ width: '100%', marginTop: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 5, cursor: 'pointer' }}
                      >
                        קבע כמשמרת קבועה
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </>,
          document.body,
        )}
      </div>
    );
  }

  const visibleDays = isMobile ? [weekDays[mobileDayIndex]] : weekDays;

  return (
    <div dir="rtl" style={{ padding: '16px', fontFamily: 'inherit' }}>
      {/* Manual shortage alerts */}
      {manualShortages.length > 0 && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#991b1b' }}>חוסרים לטיפול ידני:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {manualShortages.map(s => {
              const { openSlots, transferOptions } = getBoardShortageProposals(s);
              const hasOptions = openSlots.length > 0 || transferOptions.length > 0;
              return (
                <div key={s.emp.id} style={{ background: 'white', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasOptions ? 6 : 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: '#991b1b' }}>
                      {s.emp.name} — חסרות {s.needed - s.got} משמרות
                    </span>
                    <button
                      onClick={() => setManualShortages(prev => prev.filter(x => x.emp.id !== s.emp.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 14, padding: '0 4px' }}
                      title="סגור"
                    >✕</button>
                  </div>

                  {openSlots.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                      {openSlots.map(os => (
                        <button
                          key={`${os.day}_${os.shift}_${os.slotIdx}`}
                          onClick={() => boardAssignSlot(s, os.day, os.shift, os.slotIdx)}
                          style={{ padding: '4px 10px', fontSize: 11, background: '#16a34a', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                        >
                          שבץ ל{os.day} {os.shift}
                        </button>
                      ))}
                    </div>
                  )}

                  {transferOptions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                      {transferOptions.map(to => (
                        <button
                          key={`${to.fromEmp.id}_${to.day}_${to.shift}_${to.slotIdx}`}
                          onClick={() => boardTransferSlot(s, to.fromEmp.id, to.day, to.shift, to.slotIdx)}
                          style={{ padding: '4px 10px', fontSize: 11, background: '#c17f3b', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                        >
                          קבל מ{to.fromEmp.name} — {to.day} {to.shift}
                        </button>
                      ))}
                    </div>
                  )}

                  {!hasOptions && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      אין סלוטים פנויים מתאימים — שבץ ידנית בלוח
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          style={{ padding: '6px 14px', cursor: 'pointer', background: 'white', border: '1px solid #e8e0d4', borderRadius: 6, fontSize: 13, fontWeight: 500, color: '#475569' }}
        >
          ← שבוע קודם
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: isMobile ? 13 : 16, color: '#1a4a2e' }}>
            לוח שיבוץ שבועי — {formatDate(weekStart)}–{formatDate(new Date(weekStart.getTime() + 5 * 86400000))}.{weekStart.getFullYear()}
          </div>
          {(() => {
            const badge = getWeekBadge(weekOffset);
            return badge ? (
              <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, background: badge.bg, color: badge.color, fontWeight: 600 }}>
                {badge.label}
              </span>
            ) : null;
          })()}
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', background: 'white', border: '1px solid #e8e0d4', borderRadius: 6, color: '#475569', fontWeight: 500 }}
            >
              היום
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            style={{ padding: '6px 14px', cursor: 'pointer', background: 'white', border: '1px solid #e8e0d4', borderRadius: 6, fontSize: 13, fontWeight: 500, color: '#475569' }}
          >
            שבוע הבא →
          </button>
          <button
            onClick={() => {
              setPlanAheadFrom(getWeekStart(1));
              const to = getWeekStart(4); to.setDate(to.getDate() + 5);
              setPlanAheadTo(to);
              setPlanAheadNoPrefsWarning(false);
              setShowPlanAheadModal(true);
            }}
            style={{ padding: '6px 14px', cursor: 'pointer', background: 'white', border: '2px solid #1a4a2e', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#1a4a2e' }}
          >
            תכנן קדימה
          </button>
        </div>
      </div>

      {/* Holiday banner */}
      {(() => {
        if (holidayDismissed) return null;
        // Only show for current or future weeks
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const weekEndDate = new Date(weekStart); weekEndDate.setDate(weekStart.getDate() + 5);
        if (weekEndDate < today) return null;

        const holidays = ISRAELI_HOLIDAYS.filter(h => {
          const hDate = new Date(h.date + 'T00:00:00');
          return hDate >= weekStart && hDate <= weekEndDate;
        });
        if (holidays.length === 0) return null;

        // Filter out holidays that already have a custom shift with matching name
        const remaining = holidays.filter(h => {
          const hDate = new Date(h.date + 'T00:00:00');
          const dayIdx = hDate.getDay(); // 0=Sun..5=Fri
          if (dayIdx < 0 || dayIdx > 5) return false;
          const dayName = DAY_NAMES[dayIdx];
          const dayCustomShifts = customShifts[dayName] || [];
          return !dayCustomShifts.some(cs => cs.name === h.name);
        });
        if (remaining.length === 0) return null;

        const text = remaining.map(h => {
          const hd = new Date(h.date + 'T00:00:00');
          return `${h.name} (${hd.getDate()}.${hd.getMonth() + 1})`;
        }).join(', ');

        return (
          <div style={{ background: '#FAEEDA', border: '1px solid #EF9F27', borderRadius: 8, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
              🕎 שבוע זה יש: {text}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => {
                  // Pre-fill custom shift modal with first holiday
                  const h = remaining[0];
                  const hDate = new Date(h.date + 'T00:00:00');
                  const dayIdx = hDate.getDay();
                  const dayName = dayIdx >= 0 && dayIdx <= 5 ? DAY_NAMES[dayIdx] : 'ראשון';
                  setCustomShiftModalDay(dayName);
                  setCustomShiftForm({ name: h.name, startTime: '', endTime: '', requiredCount: 2 });
                  setShowCustomShiftModal(true);
                }}
                style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: '#1a4a2e', color: 'white', cursor: 'pointer' }}
              >
                הוסף משמרת מיוחדת
              </button>
              <button
                onClick={() => setHolidayDismissed(true)}
                style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid #e8e0d4', background: '#f5f0e8', color: '#475569', cursor: 'pointer' }}
              >
                התעלם
              </button>
            </div>
          </div>
        );
      })()}

      {/* Preferences status indicator */}
      {(() => {
        const nonMiya = employees.filter(e => e.id !== miyaId);
        const withPrefs = nonMiya.filter(e => {
          const empPrefs = preferences[e.id];
          return empPrefs && Object.values(empPrefs).flat().length > 0;
        });
        const weekEndDate = new Date(weekStart);
        weekEndDate.setDate(weekStart.getDate() + 5);
        const rangeText = `${formatDate(weekStart)}–${formatDate(weekEndDate)}`;

        const statusColor = withPrefs.length === 0 ? '#94a3b8' : withPrefs.length === nonMiya.length ? '#16a34a' : '#c17f3b';
        const statusBg = withPrefs.length === 0 ? '#f5f0e8' : withPrefs.length === nonMiya.length ? '#dcfce7' : '#fffbeb';
        const statusText = withPrefs.length === 0
          ? 'לא הוזנו העדפות לשבוע זה'
          : withPrefs.length === nonMiya.length
          ? `העדפות מוזנות לתאריכים ${rangeText}`
          : `העדפות חלקיות — ${rangeText} (${withPrefs.length}/${nonMiya.length} עובדות)`;

        return (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 10,
            fontSize: 13,
            fontWeight: 600,
            background: statusBg,
            color: statusColor === '#94a3b8' ? '#64748b' : statusColor === '#16a34a' ? '#166534' : '#92400e',
            borderRight: `4px solid ${statusColor}`,
          }}>
            {statusText}
          </div>
        );
      })()}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => autoSchedule()}
          disabled={!prefsLoaded}
          style={{ padding: '8px 16px', background: prefsLoaded ? '#1a4a2e' : '#94a3b8', color: 'white', border: 'none', borderRadius: 6, cursor: prefsLoaded ? 'pointer' : 'wait', fontWeight: 700, fontSize: 13, opacity: prefsLoaded ? 1 : 0.7 }}
        >
          {prefsLoaded ? 'שבץ אוטומטית' : 'טוען העדפות...'}
        </button>
        <button
          onClick={() => setShowConstraintsModal(true)}
          style={{ position: 'relative', padding: '8px 16px', background: 'white', color: '#1a4a2e', border: '2px solid #1a4a2e', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
        >
          הנחיות שיבוץ
          {schedulingConstraints.length > 0 && (
            <span style={{
              position: 'absolute', top: -8, left: -8,
              background: '#c17f3b', color: 'white',
              borderRadius: '50%', width: 20, height: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, lineHeight: 1,
            }}>
              {schedulingConstraints.length}
            </span>
          )}
        </button>
        <button
          onClick={resetSchedule}
          style={{ padding: '8px 16px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
        >
          אפס שיבוץ
        </button>
      </div>

      {/* Mobile day navigation */}
      {isMobile && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button
            onClick={() => setMobileDayIndex(i => Math.max(0, i - 1))}
            disabled={mobileDayIndex === 0}
            style={{ padding: '6px 14px', cursor: mobileDayIndex === 0 ? 'not-allowed' : 'pointer', background: 'white', border: '1px solid #e8e0d4', borderRadius: 6, fontSize: 13, color: mobileDayIndex === 0 ? '#e8e0d4' : '#475569' }}
          >
            → יום קודם
          </button>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1a4a2e' }}>
            {weekDays[mobileDayIndex].day} {weekDays[mobileDayIndex].dateStr}
          </span>
          <button
            onClick={() => setMobileDayIndex(i => Math.min(weekDays.length - 1, i + 1))}
            disabled={mobileDayIndex === weekDays.length - 1}
            style={{ padding: '6px 14px', cursor: mobileDayIndex === weekDays.length - 1 ? 'not-allowed' : 'pointer', background: 'white', border: '1px solid #e8e0d4', borderRadius: 6, fontSize: 13, color: mobileDayIndex === weekDays.length - 1 ? '#e8e0d4' : '#475569' }}
          >
            יום הבא ←
          </button>
        </div>
      )}

      <div style={{ overflowX: isMobile ? 'auto' : 'hidden' }}>
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <colgroup>
            <col style={{ width: 52 }} />
            {visibleDays.map(d => (
              <col key={d.day} style={{ width: 'calc((100% - 52px) / 6)' }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th style={{ padding: '8px 6px', background: '#1a4a2e', color: 'white', fontWeight: 700, borderTopRightRadius: 8 }}>
                משמרת
              </th>
              {visibleDays.map((d, i) => {
                const allShiftsClosed = (WEEK_STRUCTURE.find(ws => ws.day === d.day)?.shifts || []).every(s => !!closedShifts[`${d.day}_${s}`]);
                return (
                <th
                  key={d.day}
                  style={{ padding: '8px 6px', background: allShiftsClosed ? '#fee2e2' : '#faf7f2', textAlign: 'center', borderBottom: '2px solid #e8e0d4', ...(i === visibleDays.length - 1 ? { borderTopLeftRadius: 8 } : {}) }}
                >
                  {allShiftsClosed ? (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#dc2626' }}>{d.day} — סגור</div>
                      <button
                        onClick={() => openDay(d.day)}
                        style={{ fontSize: 10, fontWeight: 600, color: '#1a4a2e', background: '#EBF3D8', border: '1px solid #C8DBA0', borderRadius: 4, cursor: 'pointer', padding: '2px 10px', marginTop: 4 }}
                      >פתח יום</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a4a2e' }}>{d.day}</div>
                      <div style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8' }}>{d.dateStr}</div>
                      <button
                        onClick={() => closeDay(d.day)}
                        style={{ fontSize: 9, fontWeight: 600, color: '#dc2626', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', padding: '1px 8px', marginTop: 3 }}
                      >סגור יום</button>
                    </>
                  )}
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {getAllShiftRows().map(({ name: shift, isCustom }) => {
              const shiftColor = isCustom ? '#EF9F27' : (shift === 'בוקר' ? '#4a7c59' : '#c17f3b');
              const labelBg = isCustom ? '#EF9F27' : '#1a4a2e';
              return (
                <tr key={shift}>
                  <td style={{ padding: '8px 6px', fontWeight: 700, background: labelBg, color: 'white', verticalAlign: 'top', borderBottom: '1px solid #e8e0d4', borderTop: `3px solid ${isCustom ? '#EF9F27' : shiftColor}`, fontSize: 12, position: 'relative' }}>
                    <div>{shift}</div>
                    {isCustom && <span style={{ fontSize: 8, background: 'rgba(255,255,255,0.3)', padding: '1px 4px', borderRadius: 3, display: 'inline-block', marginTop: 2 }}>מותאם</span>}
                  </td>
                  {visibleDays.map(d => {
                    // Check if this day has this shift
                    const dayHasShift = isCustom
                      ? (customShifts[d.day] || []).some(cs => cs.name === shift)
                      : d.shifts.includes(shift);

                    if (!dayHasShift) {
                      return (
                        <td key={d.day} style={{ padding: 6, textAlign: 'center', color: '#94a3b8', fontSize: 11, background: isCustom ? '#FAEEDA' : '#faf7f2', borderBottom: '1px solid #e8e0d4', borderTop: `3px ${isCustom ? 'dashed' : 'solid'} ${shiftColor}` }}>
                          {!isCustom && shift === 'ערב' && d.day === 'שישי' ? 'אין ערב בשישי' : ''}
                        </td>
                      );
                    }

                    const cellKey = `${d.day}_${shift}`;
                    const slots = getOrInitializeSlots(d.day, shift);
                    const hasVolt = d.day === 'שישי' || !!voltFlags[cellKey];
                    const stations = getStations(d.day, hasVolt);

                    // Dynamic cell coloring
                    const cs = isCustom ? (customShifts[d.day] || []).find(c => c.name === shift) : null;
                    const defaultSlots = isCustom ? (cs?.requiredCount || 0) : (SLOT_DEFAULTS[d.day]?.[shift] || []).length;
                    const requiredCount = isCustom ? defaultSlots : defaultSlots + (shift === 'בוקר' && MIYA_SCHEDULE[d.day] ? 1 : 0);
                    const filledCount = slots.filter(s => s.employeeId !== null && s.station !== 'התלמדות').length;
                    const shiftBg = closedShifts[cellKey] ? '#f0f0f0' : isCustom ? (filledCount >= requiredCount ? '#FFF8ED' : '#FEF2F2') : (filledCount >= requiredCount ? '#f0fdf4' : '#fef2f2');
                    const borderRight = filledCount >= requiredCount ? (isCustom ? '4px solid #EF9F27' : '4px solid #16a34a') : '4px solid #ef4444';

                    return (
                      <td
                        key={d.day}
                        style={{ padding: 6, background: shiftBg, verticalAlign: 'top', borderBottom: '1px solid #e8e0d4', borderTop: `3px ${isCustom ? 'dashed' : 'solid'} ${shiftColor}`, overflow: 'hidden', position: 'relative', ...(borderRight ? { borderRight } : {}) }}
                      >
                        {/* Delete custom shift button (per-day) */}
                        {isCustom && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteCustomShift(d.day, shift); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{ position: 'absolute', top: 4, left: 4, zIndex: 2, fontSize: 14, color: '#A32D2D', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '50%', cursor: 'pointer', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                            title={`מחק משמרת ${shift}`}
                          >
                            ✕
                          </button>
                        )}

                        {closedShifts[cellKey] ? (
                          /* Closed shift overlay */
                          <div style={{ textAlign: 'center', padding: '20px 8px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', marginBottom: 10 }}>🚫 משמרת סגורה</div>
                            <button
                              onClick={() => toggleClosedShift(cellKey)}
                              style={{ fontSize: 11, fontWeight: 600, padding: '4px 14px', borderRadius: 6, border: '1px solid #C8DBA0', background: '#EBF3D8', color: '#1a4a2e', cursor: 'pointer' }}
                            >פתח</button>
                          </div>
                        ) : (
                        <>
                        {/* Slot rows — sorted by station order */}
                        {(() => {
                          const STATION_ORDER: Record<string, number> = { 'קופה 1': 1, 'קופה 2': 2, 'קופה 3': 3, 'קופה 4': 4, 'וולט': 5, 'התלמדות': 6, 'אחר': 7 };
                          const indexed = slots.map((slot, idx) => ({ slot, idx }));
                          indexed.sort((a, b) => {
                            // Locked (Miya) always first
                            if (a.slot.locked && !b.slot.locked) return -1;
                            if (!a.slot.locked && b.slot.locked) return 1;
                            const oa = STATION_ORDER[a.slot.station] ?? 8;
                            const ob = STATION_ORDER[b.slot.station] ?? 8;
                            return oa - ob;
                          });
                          return indexed.map(({ slot, idx }) => renderSlotRow(d.day, shift, slot, idx, stations));
                        })()}

                        {/* Add slot button */}
                        <button
                          onClick={(e) => {
                            addSlot(d.day, shift);
                            const csForAdd = (customShifts[d.day] || []).find(c => c.name === shift);
                            const defaultArrival = csForAdd ? csForAdd.startTime : (shift === 'בוקר' ? '07:00' : '14:00');
                            const defaultDeparture = csForAdd ? csForAdd.endTime : (shift === 'בוקר' ? '14:00' : '21:00');
                            setTempSlotData({ employeeId: null, arrivalTime: defaultArrival, departureTime: defaultDeparture, station: '' });
                            const rect = e.currentTarget.getBoundingClientRect();
                            const popW = isMobile ? 260 : 220;
                            let top = rect.bottom + 4;
                            let left = rect.right - popW;
                            if (top + 280 > window.innerHeight) top = rect.top - 280 - 4;
                            if (left < 8) left = 8;
                            if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
                            setPopoverPos({ top, left });
                            setEditingSlot({ day: d.day, shift, slotIdx: slots.length, isNew: true });
                            setSlotDirtyBoth(false);
                          }}
                          style={{
                            fontSize: isMobile ? 12 : 10, color: isCustom ? '#EF9F27' : '#4a7c59', background: 'transparent',
                            border: `1px dashed ${isCustom ? '#EF9F27' : '#a7d5b8'}`, borderRadius: 4,
                            cursor: 'pointer', padding: isMobile ? '6px 8px' : '3px 6px', marginTop: 5, width: '100%',
                          }}
                        >
                          + הוסף
                        </button>

                        {/* Close shift button */}
                        <button
                          onClick={() => toggleClosedShift(cellKey)}
                          style={{ fontSize: 9, fontWeight: 600, color: 'white', background: '#1a4a2e', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '3px 8px', marginTop: 5, width: '100%', opacity: 0.7 }}
                        >סגור משמרת</button>
                        </>
                        )}

                        {/* Birthday banners for unscheduled employees (morning shift only) */}
                        {shift === 'בוקר' && (() => {
                          const dayDate = d.date;
                          const scheduledIds = new Set<string>();
                          // Collect all employee IDs assigned to any shift on this day
                          for (const shiftName of d.shifts) {
                            for (const s of (schedule[`${d.day}_${shiftName}`] || [])) {
                              if (s.employeeId) scheduledIds.add(s.employeeId);
                            }
                          }
                          // Also check custom shifts
                          for (const cs of (customShifts[d.day] || [])) {
                            for (const s of (schedule[`${d.day}_${cs.name}`] || [])) {
                              if (s.employeeId) scheduledIds.add(s.employeeId);
                            }
                          }
                          const birthdayEmps = employees.filter(e =>
                            isBirthdayOnDate(e.birthday, dayDate) && !scheduledIds.has(e.id)
                          );
                          if (birthdayEmps.length === 0) return null;
                          return birthdayEmps.map(e => (
                            <div key={e.id} style={{
                              marginTop: 4, padding: '3px 6px', background: '#FEF3E2',
                              borderRadius: 4, fontSize: 10, color: '#c17f3b', fontWeight: 600,
                              textAlign: 'center',
                            }}>
                              🎂 יום הולדת {e.name}
                            </div>
                          ));
                        })()}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Add custom shift row */}
            <tr>
              <td style={{ padding: '6px', background: '#faf7f2', borderBottom: '1px solid #e8e0d4', fontSize: 11, fontWeight: 600, color: '#EF9F27' }}>
                + משמרת
              </td>
              {visibleDays.map(d => (
                <td key={d.day} style={{ padding: 6, background: '#faf7f2', borderBottom: '1px solid #e8e0d4', textAlign: 'center' }}>
                  <button
                    onClick={() => {
                      setCustomShiftModalDay(d.day);
                      setCustomShiftForm({ name: '', startTime: '', endTime: '', requiredCount: 2 });
                      setShowCustomShiftModal(true);
                    }}
                    style={{ fontSize: 12, color: '#EF9F27', background: 'transparent', border: '0.5px dashed #EF9F27', borderRadius: 6, cursor: 'pointer', padding: 6, width: '100%' }}
                  >
                    + הוסף משמרת
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bottom actions */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => {
            const text = generateWhatsAppText();
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(() => {
                setWhatsappToast(true);
                setTimeout(() => setWhatsappToast(false), 3000);
              }).catch(() => {
                setWhatsappFallback(text);
              });
            } else {
              setWhatsappFallback(text);
            }
          }}
          style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          העתק לווטסאפ
        </button>
        <button
          onClick={() => { setPdfWeekChecks([true, false, false, false, false]); setShowPdfModal(true); }}
          style={{ padding: '8px 16px', background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          ייצוא PDF
        </button>
      </div>

      {/* Auto-schedule result modal */}
      {autoResultModal.isOpen && (() => {
        // Compute summary from pending schedule
        let filledCount = 0, totalCount = 0;
        const summaryStructure = WEEK_STRUCTURE.map(ws => ({
          ...ws,
          shifts: [...ws.shifts.slice(0, 1), ...(customShifts[ws.day] || []).map(cs => cs.name), ...ws.shifts.slice(1)]
        }));
        for (const { day, shifts } of summaryStructure) {
          for (const shift of shifts) {
            const slots = autoResultModal.pendingSchedule[`${day}_${shift}`] || [];
            for (const slot of slots) {
              if (slot.locked) continue;
              totalCount++;
              if (slot.employeeId !== null) filledCount++;
            }
          }
        }
        const emptyCount = totalCount - filledCount;

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: 10, width: '95%', maxWidth: 560, padding: '24px', direction: 'rtl', maxHeight: '85vh', overflowY: 'auto' }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: '#1a4a2e' }}>תוצאות שיבוץ אוטומטי</h2>

              {/* Summary bar */}
              <div style={{ background: emptyCount === 0 ? '#dcfce7' : '#fffbeb', border: `1px solid ${emptyCount === 0 ? '#86efac' : '#fbbf24'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>שובצו {filledCount}/{totalCount} משמרות.</span>
                {emptyCount > 0
                  ? <span style={{ color: '#92400e' }}> {emptyCount} משמרות נשארו ריקות — {autoResultModal.emptySlots.map(e => `${e.day} ${e.shift}`).join(', ')}</span>
                  : <span style={{ color: '#166534' }}> כל המשמרות שובצו!</span>
                }
              </div>

              {/* Ties — show one at a time */}
              {autoResultModal.ties.length > 0 && (() => {
                const tie = autoResultModal.ties[0];
                return (
                  <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: '#92400e', fontSize: 14 }}>
                      קשר: {tie.day} — {tie.shift} ({autoResultModal.ties.length} {autoResultModal.ties.length === 1 ? 'קשר נותר' : 'קשרים נותרו'})
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 10, color: '#64748b' }}>בחרי את העובדת המועדפת לשיבוץ:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {tie.candidates.map(c => (
                        <button
                          key={c.id}
                          onClick={() => resolveTie(tie, c)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'white', border: '2px solid #fbbf24', borderRadius: 6, cursor: 'pointer', fontSize: 13, width: '100%' }}
                        >
                          <span style={{ fontWeight: 600, color: '#1a4a2e' }}>{c.name}</span>
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>ציון: {tie.scores[c.id].toFixed(3)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Shortages */}
              {autoResultModal.shortages.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: '#991b1b', fontSize: 14 }}>חוסרים ({autoResultModal.shortages.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {autoResultModal.shortages.map(s => {
                      const { openSlots, transferOptions } = getShortageProposals(s);
                      const hasOptions = openSlots.length > 0 || transferOptions.length > 0;
                      return (
                        <div key={s.emp.id} style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, color: '#991b1b' }}>
                            {s.emp.name} — חסרות {s.needed - s.got} משמרות (יש {s.got}/{s.needed})
                          </div>

                          {/* Proposal 1: open slots */}
                          {openSlots.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>משמרות פנויות שביקשה:</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {openSlots.map(os => (
                                  <button
                                    key={`${os.day}_${os.shift}_${os.slotIdx}`}
                                    onClick={() => assignToOpenSlot(s, os.day, os.shift, os.slotIdx)}
                                    style={{ padding: '5px 10px', fontSize: 11, background: '#16a34a', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                  >
                                    שבץ {s.emp.name} ל{os.day} {os.shift}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Proposal 2: transfer from over-assigned */}
                          {transferOptions.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>ויתור אפשרי:</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {transferOptions.map(to => (
                                  <button
                                    key={`${to.fromEmp.id}_${to.day}_${to.shift}_${to.slotIdx}`}
                                    onClick={() => transferSlot(s, to.fromEmp.id, to.day, to.shift, to.slotIdx)}
                                    style={{ padding: '5px 10px', fontSize: 11, background: '#c17f3b', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                  >
                                    העבר מ{to.fromEmp.name} ל{s.emp.name} — {to.day} {to.shift}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* No options explanation */}
                          {!hasOptions && (
                            <div style={{ marginTop: 6, fontSize: 11, color: '#991b1b' }}>
                              כל המשמרות שביקשה כבר תפוסות — שיבוץ ידני בלבד
                            </div>
                          )}

                          {/* Proposal 3: leave manual */}
                          <div style={{ marginTop: 8 }}>
                            <button
                              onClick={() => leaveShortageManual(s)}
                              style={{ padding: '5px 10px', fontSize: 11, background: '#64748b', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                            >
                              השאר חסר — טפל ידנית
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty slots — no candidates */}
              {autoResultModal.emptySlots.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: '#991b1b', fontSize: 14 }}>משמרות ללא מועמדות</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {autoResultModal.emptySlots.map(es => (
                      <div key={`${es.day}_${es.shift}`} style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#991b1b' }}>
                        אין עובדות זמינות ל{es.day} {es.shift}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trainee results */}
              {autoResultModal.traineeResults.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: '#c17f3b', fontSize: 14 }}>מתלמדות</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {autoResultModal.traineeResults.map(tr => (
                      <div key={tr.name} style={{
                        background: tr.assigned ? '#fff7ed' : '#fee2e2',
                        border: `1px solid ${tr.assigned ? '#fed7aa' : '#fca5a5'}`,
                        borderRadius: 6, padding: '6px 12px', fontSize: 12, marginBottom: 0,
                        color: tr.assigned ? '#92400e' : '#991b1b',
                      }}>
                        {tr.assigned
                          ? `${tr.name} — שובצה להתלמדות${tr.reason ? ` (${tr.reason})` : ''}`
                          : `מתלמדת ${tr.name} לא שובצה — ${tr.reason}`
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  onClick={() => setAutoResultModal({ isOpen: false, shortages: [], ties: [], emptySlots: [], pendingSchedule: {}, traineeResults: [] })}
                  style={{ padding: '8px 16px', background: '#f5f0e8', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}
                >
                  בטל
                </button>
                <button
                  onClick={saveAutoResult}
                  style={{ padding: '8px 18px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                >
                  שמור שיבוץ
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reset toast */}
      {resetToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#1a4a2e', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          השיבוץ אופס בהצלחה
        </div>
      )}

      {/* No preferences toast (autoSchedule) */}
      {noPrefsToast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#2D5016', color: '#F5EFD8', padding: '12px 20px', borderRadius: 8, fontSize: 14, maxWidth: 400, textAlign: 'center', direction: 'rtl', pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', fontWeight: 600 }}>
          לא ניתן לשבץ — לא הוזנו העדפות לשבוע זה. עבור ללשונית העדפות והזן העדפות תחילה.
        </div>
      )}

      {/* Slot add toast */}
      {slotAddToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          ✓ {slotAddToast} נוספה למשמרת
        </div>
      )}

      {/* Fixed shift toast */}
      {fixedShiftToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          ✓ המשמרת נשמרה כקבועה עבור {fixedShiftToast}
        </div>
      )}

      {slotSaveToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          ✓ השינויים נשמרו בהצלחה
        </div>
      )}

      {/* WhatsApp copy toast */}
      {whatsappToast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#16a34a', color: 'white', padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          ✓ הועתק ללוח
        </div>
      )}

      {/* WhatsApp clipboard fallback modal */}
      {whatsappFallback && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 500, width: '95%', direction: 'rtl' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#1a4a2e' }}>העתקה ידנית</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>סמני את כל הטקסט והעתיקי (Ctrl+C)</p>
            <textarea
              readOnly
              value={whatsappFallback}
              onFocus={(e) => e.target.select()}
              style={{ width: '100%', height: 300, fontSize: 13, padding: 12, border: '1px solid #e8e0d4', borderRadius: 8, resize: 'none', fontFamily: 'inherit', direction: 'rtl', color: '#1a1a1a' }}
            />
            <button
              onClick={() => setWhatsappFallback('')}
              style={{ marginTop: 12, padding: '8px 20px', background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              סגור
            </button>
          </div>
        </div>
      )}

      {/* Shift sync warning modal */}
      {syncWarningModal && (() => {
        const { day, issues } = syncWarningModal;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 500, width: '95%', direction: 'rtl' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: '#b45309' }}>
                ⚠️ בעיית רצף בעמדה
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                {issues.map((issue, idx) => (
                  <div key={idx} style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, background: '#FFF9F0', borderRadius: 8, padding: '10px 14px', border: '1px solid #FCEBC8' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{issue.station} ביום {day}:</div>
                    <div>בוקר ({issue.morningEmpName}) מסתיים ב-<strong>{issue.morningDeparture}</strong></div>
                    <div>ערב ({issue.eveningEmpName}) מתחיל ב-<strong>{issue.eveningArrival}</strong></div>
                    <div style={{ fontWeight: 600, color: issue.type === 'gap' ? '#b45309' : '#dc2626', marginTop: 4 }}>
                      {issue.type === 'gap'
                        ? `קיים חוסר כיסוי של ${issue.diffMinutes} דקות.`
                        : `קיימת חפיפה של ${issue.diffMinutes} דקות.`}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setSyncWarningModal(null)}
                  style={{ padding: '8px 16px', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', background: '#f5f0e8', color: '#475569', fontWeight: 600, fontSize: 13 }}
                >
                  הבנתי, המשך שמירה
                </button>
                <button
                  onClick={() => {
                    let updatedSched = { ...schedule };
                    const edited = syncWarningModal.editedShift;
                    for (const issue of issues) {
                      if (edited === 'בוקר') {
                        // Miya changed morning departure → evening arrival adapts to it
                        const eveningKey = `${day}_ערב`;
                        const eveningSlots = [...(updatedSched[eveningKey] || [])];
                        eveningSlots[issue.eveningShiftSlotIdx] = { ...eveningSlots[issue.eveningShiftSlotIdx], arrivalTime: issue.morningDeparture };
                        updatedSched = { ...updatedSched, [eveningKey]: eveningSlots };
                      } else {
                        // Miya changed evening arrival → morning departure adapts to it
                        const morningKey = `${day}_בוקר`;
                        const morningSlots = [...(updatedSched[morningKey] || [])];
                        morningSlots[issue.morningShiftSlotIdx] = { ...morningSlots[issue.morningShiftSlotIdx], departureTime: issue.eveningArrival };
                        updatedSched = { ...updatedSched, [morningKey]: morningSlots };
                      }
                    }
                    saveSchedule(updatedSched);
                    setSyncWarningModal(null);
                  }}
                  style={{ padding: '8px 16px', background: '#b45309', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                >
                  תקן אוטומטית
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Plan ahead modal */}
      {showPlanAheadModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 480, width: '100%', position: 'relative', direction: 'rtl' }}>
            <button
              onClick={closePlanAheadFlow}
              style={{ position: 'absolute', right: 12, top: 12, width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
            >
              ✕
            </button>

            {planAheadStep === 'dateRange' && (<>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a4a2e' }}>תכנן קדימה</h3>

            {/* Quick select */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#475569' }}>בחירה מהירה:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'שבוע קדימה', weeks: 1 },
                  { label: 'שבועיים', weeks: 2 },
                  { label: '3 שבועות', weeks: 3 },
                  { label: 'חודש', weeks: 4 },
                ].map(opt => (
                  <button
                    key={opt.weeks}
                    onClick={() => {
                      const from = getWeekStart(1);
                      const to = getWeekStart(opt.weeks);
                      to.setDate(to.getDate() + 5);
                      setPlanAheadFrom(from);
                      setPlanAheadTo(to);
                    }}
                    style={{ padding: '6px 14px', fontSize: 13, border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', background: '#faf7f2', fontWeight: 500, color: '#475569' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom date range */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#475569' }}>או טווח חופשי:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>מתאריך</span>
                <input
                  type="date"
                  value={formatWeekKey(planAheadFrom)}
                  onChange={e => {
                    const d = new Date(e.target.value + 'T00:00:00');
                    if (!isNaN(d.getTime())) {
                      const sunday = new Date(d);
                      sunday.setDate(d.getDate() - d.getDay());
                      sunday.setHours(0, 0, 0, 0);
                      setPlanAheadFrom(sunday);
                    }
                  }}
                  style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4' }}
                />
                <span style={{ fontSize: 13, color: '#64748b' }}>עד תאריך</span>
                <input
                  type="date"
                  value={formatWeekKey(planAheadTo)}
                  onChange={e => {
                    const d = new Date(e.target.value + 'T00:00:00');
                    if (!isNaN(d.getTime())) setPlanAheadTo(d);
                  }}
                  style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4' }}
                />
              </div>
            </div>

            {/* Preview */}
            {(() => {
              const sundays = getWeekSundaysInRange(planAheadFrom, planAheadTo);
              const newCount = sundays.filter(s => !localStorage.getItem(`schedule_${formatWeekKey(s)}`)).length;
              const lastSunday = sundays[sundays.length - 1];
              const lastFriday = lastSunday ? new Date(lastSunday.getTime() + 5 * 86400000) : planAheadTo;
              return (
                <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#1a4a2e' }}>
                  {sundays.length === 0 ? (
                    <span style={{ color: '#94a3b8' }}>אין שבועות בטווח שנבחר</span>
                  ) : (
                    <>
                      {`ייווצרו ${newCount} שבועות חדשים`}
                      {newCount < sundays.length && ` (${sundays.length - newCount} כבר קיימים)`}
                      {`: ${formatDate(sundays[0])} – ${formatDate(lastFriday)}`}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Holiday detection + No preferences — merged block */}
            {(() => {
              const rangeHolidays = ISRAELI_HOLIDAYS.filter(h => {
                const hDate = new Date(h.date + 'T00:00:00');
                return hDate >= planAheadFrom && hDate <= planAheadTo;
              });

              // Filter out holidays that already have a custom shift with matching name
              const uncovered = rangeHolidays.filter(h => {
                const hDate = new Date(h.date + 'T00:00:00');
                const sunday = new Date(hDate);
                sunday.setDate(hDate.getDate() - hDate.getDay());
                sunday.setHours(0, 0, 0, 0);
                const wk = formatWeekKey(sunday);
                const dayName = DAY_NAMES[hDate.getDay()];
                try {
                  const saved = localStorage.getItem(`customShifts_${wk}`);
                  if (!saved) return true;
                  const parsed = JSON.parse(saved);
                  return !(parsed[dayName] || []).some((cs: CustomShiftDef) => cs.name === h.name);
                } catch { return true; }
              });

              const hasHolidays = uncovered.length > 0;
              const hasNoPrefs = planAheadNoPrefsWarning;

              if (!hasHolidays && !hasNoPrefs) return null;

              return (
                <div style={{ background: '#FAEEDA', border: '1px solid #EF9F27', borderRadius: 8, padding: '10px 14px', margin: '12px 0', direction: 'rtl' }}>
                  {hasHolidays && (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e', marginBottom: 6 }}>🕎 נמצאו חגים בטווח זה:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
                        {uncovered.map(h => {
                          const hd = new Date(h.date + 'T00:00:00');
                          const dayName = DAY_NAMES[hd.getDay()];
                          return (
                            <div key={h.date + h.name} style={{ fontSize: 13, color: '#92400e' }}>
                              • {h.name} — {hd.getDate()}.{String(hd.getMonth() + 1).padStart(2, '0')}.{hd.getFullYear()} ({dayName})
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 12, color: '#92400e', marginBottom: 10 }}>האם תרצי להוסיף משמרות מיוחדות לימי החג?</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => {
                            const entries: SpecialShiftEntry[] = uncovered.map(h => {
                              const hd = new Date(h.date + 'T00:00:00');
                              const isFriday = hd.getDay() === 5;
                              return {
                                id: Date.now().toString() + '_' + h.date,
                                name: h.name,
                                date: h.date,
                                startTime: isFriday ? '07:00' : '09:00',
                                endTime: isFriday ? '14:00' : '15:00',
                                requiredCount: 2,
                              };
                            });
                            setSpecialShifts(entries);
                            setPlanAheadStep('specialShifts');
                          }}
                          style={{ padding: '6px 14px', fontSize: 13, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                        >
                          כן, אוסיף משמרות מיוחדות
                        </button>
                        <button
                          onClick={() => {
                            if (!checkPlanAheadPreferences()) { setPlanAheadNoPrefsWarning(true); return; }
                            setPlanAheadStep('question');
                          }}
                          style={{ padding: '6px 14px', fontSize: 13, background: '#f5f0e8', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', fontWeight: 600, color: '#475569' }}
                        >
                          לא, המשך לשיבוץ
                        </button>
                      </div>
                    </>
                  )}

                  {hasHolidays && hasNoPrefs && (
                    <div style={{ borderTop: '1px solid #EF9F27', margin: '12px 0', opacity: 0.4 }} />
                  )}

                  {hasNoPrefs && (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 8, color: '#92400e', fontSize: 13 }}>
                        לא נמצאו העדפות עובדות לטווח הנבחר
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => { setPlanAheadNoPrefsWarning(false); setPlanAheadStep('question'); }}
                          style={{ padding: '6px 14px', fontSize: 13, background: '#f5f0e8', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', fontWeight: 600, color: '#475569' }}
                        >
                          המשך בכל זאת
                        </button>
                        {onNavigateToPreferences && (
                          <button
                            onClick={() => {
                              setShowPlanAheadModal(false);
                              setPlanAheadNoPrefsWarning(false);
                              onNavigateToPreferences();
                            }}
                            style={{ padding: '6px 14px', fontSize: 13, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                          >
                            עבור להעדפות
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Action buttons */}
            {/* Close shifts in advance */}
            <div style={{ borderTop: '1px solid #e8e0d4', paddingTop: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#dc2626' }}>סגירת משמרות מראש:</div>
              {(() => {
                const sundays = getWeekSundaysInRange(planAheadFrom, planAheadTo);
                return (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <select value={paCloseWeek} onChange={e => setPaCloseWeek(e.target.value)} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #e8e0d4' }}>
                      <option value="">שבוע</option>
                      {sundays.map(s => { const k = formatWeekKey(s); return <option key={k} value={k}>{formatDate(s)}</option>; })}
                    </select>
                    <select value={paCloseDay} onChange={e => setPaCloseDay(e.target.value)} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #e8e0d4' }}>
                      {DAY_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select value={paCloseShift} onChange={e => setPaCloseShift(e.target.value)} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #e8e0d4' }}>
                      <option value="">כל היום</option>
                      <option value="בוקר">בוקר</option>
                      <option value="ערב">ערב</option>
                    </select>
                    <button
                      disabled={!paCloseWeek}
                      onClick={() => {
                        if (!paCloseWeek) return;
                        const shifts = paCloseShift ? [paCloseShift] : ['בוקר', 'ערב'];
                        const newEntries = shifts.map(s => ({ weekKey: paCloseWeek, day: paCloseDay, shift: s }));
                        setPlanAheadClosures(prev => [...prev, ...newEntries.filter(ne => !prev.some(p => p.weekKey === ne.weekKey && p.day === ne.day && p.shift === ne.shift))]);
                        // Save to Supabase immediately
                        const rows = newEntries.map(e => ({ week_start: e.weekKey, day: e.day, shift: e.shift }));
                        supabase.from('closed_shifts').upsert(rows, { onConflict: 'week_start,day,shift' });
                      }}
                      style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: paCloseWeek ? 'pointer' : 'not-allowed', background: paCloseWeek ? '#dc2626' : '#d1d5db', color: 'white' }}
                    >סגור</button>
                  </div>
                );
              })()}
              {planAheadClosures.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {planAheadClosures.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#fee2e2', borderRadius: 4, padding: '3px 8px', color: '#dc2626' }}>
                      <span style={{ fontWeight: 600 }}>{c.day} {c.shift}</span>
                      <span style={{ color: '#94a3b8' }}>({c.weekKey})</span>
                      <button onClick={() => {
                        setPlanAheadClosures(prev => prev.filter((_, j) => j !== i));
                        supabase.from('closed_shifts').delete().eq('week_start', c.weekKey).eq('day', c.day).eq('shift', c.shift);
                      }} style={{ marginRight: 'auto', fontSize: 10, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={closePlanAheadFlow}
                style={{ padding: '8px 16px', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', background: '#f5f0e8', color: '#475569', fontWeight: 600 }}
              >
                ביטול
              </button>
              <button
                onClick={() => {
                  if (!checkPlanAheadPreferences()) { setPlanAheadNoPrefsWarning(true); return; }
                  setPlanAheadStep('question');
                }}
                style={{ padding: '8px 16px', background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
              >
                המשך לשיבוץ
              </button>
            </div>
            </>)}

            {/* Question step */}
            {planAheadStep === 'question' && (() => {
              const sundays = getWeekSundaysInRange(planAheadFrom, planAheadTo);
              return (
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1a4a2e' }}>האם יש משמרות מיוחדות בטווח זה?</h3>
                  <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>{`${sundays.length} שבועות | ${formatDate(planAheadFrom)}–${formatDate(planAheadTo)}`}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                    <button
                      onClick={() => setPlanAheadStep('specialShifts')}
                      style={{ padding: '10px 24px', fontSize: 14, background: '#EF9F27', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, width: '100%', maxWidth: 300 }}
                    >
                      כן, אוסיף משמרות מיוחדות
                    </button>
                    <button
                      onClick={() => runPlanAheadAutoSchedule()}
                      style={{ padding: '10px 24px', fontSize: 14, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, width: '100%', maxWidth: 300 }}
                    >
                      לא, המשך לשיבוץ
                    </button>
                    <button
                      onClick={() => setPlanAheadStep('dateRange')}
                      style={{ padding: '8px 16px', fontSize: 13, background: 'transparent', color: '#64748b', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
                    >
                      חזור
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Special shifts step */}
            {planAheadStep === 'specialShifts' && (
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#EF9F27' }}>משמרות מיוחדות</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>{`הוסיפי משמרות מיוחדות לטווח ${formatDate(planAheadFrom)}–${formatDate(planAheadTo)}`}</p>

                {specialShifts.length > 0 && (
                  <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {specialShifts.map(ss => {
                      const isEditing = editingHolidayId === ss.id;
                      if (isEditing && editingDraft) {
                        const draftValid = editingDraft.name.trim() !== '' && editingDraft.date !== '' && editingDraft.startTime !== '' && editingDraft.endTime !== '' && isDateInPlanAheadRange(editingDraft.date) && timeToMinutes(editingDraft.endTime) > timeToMinutes(editingDraft.startTime);
                        return (
                          <div key={ss.id} style={{ background: '#FFF7ED', border: '2px solid #EF9F27', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                              <input type="text" value={editingDraft.name} onChange={e => setEditingDraft(d => d ? { ...d, name: e.target.value } : d)} style={{ flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #e8e0d4' }} />
                              <input type="date" value={editingDraft.date} onChange={e => setEditingDraft(d => d ? { ...d, date: e.target.value } : d)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #e8e0d4' }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#64748b' }}>מ-</span>
                              <input type="time" value={editingDraft.startTime} onChange={e => setEditingDraft(d => d ? { ...d, startTime: e.target.value } : d)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #e8e0d4' }} />
                              <span style={{ fontSize: 11, color: '#64748b' }}>עד</span>
                              <input type="time" value={editingDraft.endTime} onChange={e => setEditingDraft(d => d ? { ...d, endTime: e.target.value } : d)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #e8e0d4' }} />
                              <span style={{ fontSize: 11, color: '#64748b' }}>כמות:</span>
                              <select value={editingDraft.requiredCount} onChange={e => setEditingDraft(d => d ? { ...d, requiredCount: Number(e.target.value) } : d)} style={{ padding: '4px 6px', fontSize: 12, borderRadius: 4, border: '1px solid #e8e0d4' }}>
                                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                              <button
                                onClick={() => {
                                  if (!draftValid) return;
                                  setSpecialShifts(prev => prev.map(s => s.id === ss.id ? { ...editingDraft } : s));
                                  setEditingHolidayId(null); setEditingDraft(null);
                                }}
                                disabled={!draftValid}
                                style={{ padding: '2px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: 'none', background: draftValid ? '#16a34a' : '#d1cdc6', color: 'white', cursor: draftValid ? 'pointer' : 'not-allowed' }}
                              >עדכן</button>
                              <button
                                onClick={() => { setEditingHolidayId(null); setEditingDraft(null); }}
                                style={{ padding: '2px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid #e8e0d4', background: '#f5f0e8', color: '#475569', cursor: 'pointer' }}
                              >בטל</button>
                            </div>
                            {!draftValid && editingDraft.startTime && editingDraft.endTime && timeToMinutes(editingDraft.endTime) <= timeToMinutes(editingDraft.startTime) && (
                              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>שעת סיום חייבת להיות אחרי שעת התחלה</div>
                            )}
                            {!draftValid && editingDraft.date && !isDateInPlanAheadRange(editingDraft.date) && (
                              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>התאריך לא בטווח הנבחר</div>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div key={ss.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFF7ED', border: '1px solid #FCEBC8', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, flex: 1 }}>{ss.name}</span>
                          <span style={{ color: '#64748b' }}>{ss.date.split('-').reverse().join('.')}</span>
                          <span style={{ color: '#64748b' }}>{ss.startTime}–{ss.endTime}</span>
                          <span style={{ color: '#64748b' }}>×{ss.requiredCount}</span>
                          <button
                            onClick={() => {
                              // Auto-save current edit if valid, then open new
                              if (editingHolidayId && editingDraft) {
                                const valid = editingDraft.name.trim() !== '' && editingDraft.date !== '' && editingDraft.startTime !== '' && editingDraft.endTime !== '' && isDateInPlanAheadRange(editingDraft.date) && timeToMinutes(editingDraft.endTime) > timeToMinutes(editingDraft.startTime);
                                if (valid) setSpecialShifts(prev => prev.map(s => s.id === editingHolidayId ? { ...editingDraft } : s));
                              }
                              setEditingHolidayId(ss.id); setEditingDraft({ ...ss });
                            }}
                            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '0.5px solid #e8e0d4', background: 'transparent', cursor: 'pointer', color: '#475569' }}
                          >ערוך</button>
                          <button
                            onClick={() => {
                              if (editingHolidayId === ss.id) { setEditingHolidayId(null); setEditingDraft(null); }
                              setSpecialShifts(prev => prev.filter(s => s.id !== ss.id));
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', padding: '2px 4px' }}
                            title="מחק"
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ borderTop: '1px solid #e8e0d4', margin: '0 0 16px' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="text" placeholder="שם המשמרת" value={specialShiftForm.name} onChange={e => setSpecialShiftForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 1, padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4' }} />
                    <input type="date" value={specialShiftForm.date} onChange={e => { const val = e.target.value; setSpecialShiftForm(f => ({ ...f, date: val, name: f.name || (val ? getDefaultSpecialShiftName(val) : '') })); }} style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>מ-</span>
                    <input type="time" value={specialShiftForm.startTime} onChange={e => setSpecialShiftForm(f => ({ ...f, startTime: e.target.value }))} style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4' }} />
                    <span style={{ fontSize: 12, color: '#64748b' }}>עד</span>
                    <input type="time" value={specialShiftForm.endTime} onChange={e => setSpecialShiftForm(f => ({ ...f, endTime: e.target.value }))} style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4' }} />
                    <span style={{ fontSize: 12, color: '#64748b' }}>כמות:</span>
                    <select value={specialShiftForm.requiredCount} onChange={e => setSpecialShiftForm(f => ({ ...f, requiredCount: Number(e.target.value) }))} style={{ padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4' }}>
                      {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      const { name, date, startTime, endTime, requiredCount } = specialShiftForm;
                      if (!name || !date || !startTime || !endTime) return;
                      if (!isDateInPlanAheadRange(date)) return;
                      if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return;
                      setSpecialShifts(prev => [...prev, { id: Date.now().toString(), name, date, startTime, endTime, requiredCount }]);
                      setSpecialShiftForm({ name: '', date: '', startTime: '', endTime: '', requiredCount: 2 });
                    }}
                    disabled={!specialShiftForm.name || !specialShiftForm.date || !specialShiftForm.startTime || !specialShiftForm.endTime || !isDateInPlanAheadRange(specialShiftForm.date)}
                    style={{ padding: '8px 16px', fontSize: 13, background: '#EF9F27', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, opacity: (!specialShiftForm.name || !specialShiftForm.date || !specialShiftForm.startTime || !specialShiftForm.endTime) ? 0.5 : 1, alignSelf: 'flex-start' }}
                  >
                    + הוסף משמרת
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                  <button onClick={() => { setSpecialShifts([]); setPlanAheadStep('question'); }} style={{ padding: '8px 16px', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', background: '#f5f0e8', color: '#475569', fontWeight: 600 }}>ביטול</button>
                  <button
                    onClick={() => runPlanAheadAutoSchedule()}
                    disabled={specialShifts.length === 0 || editingHolidayId !== null}
                    title={editingHolidayId !== null ? 'סיים את העריכה לפני שמירה' : undefined}
                    style={{ padding: '8px 16px', background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: (specialShifts.length === 0 || editingHolidayId !== null) ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: (specialShifts.length === 0 || editingHolidayId !== null) ? 0.5 : 1 }}
                  >שמור והמשך לשיבוץ</button>
                </div>
              </div>
            )}

            {/* Running step */}
            {planAheadStep === 'running' && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
                <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#1a4a2e' }}>משבץ...</h3>
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                  {`${getWeekSundaysInRange(planAheadFrom, planAheadTo).length} שבועות`}
                  {specialShifts.length > 0 && ` | ${specialShifts.length} משמרות מיוחדות`}
                </p>
              </div>
            )}

            {/* Summary step */}
            {planAheadStep === 'summary' && planAheadSummary && (
              <div>
                <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a4a2e' }}>סיכום שיבוץ</h3>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 14px', fontSize: 13, textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#1a4a2e' }}>{planAheadSummary.weeksScheduled}</div>
                    <div style={{ color: '#64748b' }}>שבועות</div>
                  </div>
                  <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 14px', fontSize: 13, textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#1a4a2e' }}>{planAheadSummary.totalShifts}</div>
                    <div style={{ color: '#64748b' }}>סלוטים</div>
                  </div>
                  {planAheadSummary.specialShiftsCount > 0 && (
                    <div style={{ background: '#FFF7ED', borderRadius: 8, padding: '8px 14px', fontSize: 13, textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 18, color: '#EF9F27' }}>{planAheadSummary.specialShiftsCount}</div>
                      <div style={{ color: '#64748b' }}>מיוחדות</div>
                    </div>
                  )}
                  {planAheadSummary.unfilledSlots > 0 && (
                    <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '8px 14px', fontSize: 13, textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 18, color: '#ef4444' }}>{planAheadSummary.unfilledSlots}</div>
                      <div style={{ color: '#64748b' }}>לא מאוישים</div>
                    </div>
                  )}
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {planAheadSummary.weekDetails.map(wd => (
                    <div key={wd.weekKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: wd.filled === wd.total ? '#f0fdf4' : '#FFFBEB', border: `1px solid ${wd.filled === wd.total ? '#bbf7d0' : '#FCEBC8'}` }}>
                      <span style={{ fontWeight: 600, flex: 1 }}>{wd.weekLabel}</span>
                      <span style={{ color: wd.filled === wd.total ? '#16a34a' : '#b45309' }}>{wd.filled}/{wd.total}</span>
                      {wd.specialCount > 0 && <span style={{ color: '#EF9F27', fontWeight: 600 }}>+{wd.specialCount} מיוחדות</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      const firstSunday = getWeekSundaysInRange(planAheadFrom, planAheadTo)[0];
                      if (firstSunday) {
                        const now = new Date();
                        const thisSunday = new Date(now);
                        thisSunday.setDate(now.getDate() - now.getDay());
                        thisSunday.setHours(0, 0, 0, 0);
                        const diff = Math.round((firstSunday.getTime() - thisSunday.getTime()) / (7 * 86400000));
                        setWeekOffset(diff);
                      }
                      closePlanAheadFlow();
                    }}
                    style={{ padding: '8px 16px', background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
                  >
                    עבור ללוח השיבוץ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Constraints Modal ═══ */}
      {showConstraintsModal && (() => {
        const DAY_OPTIONS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
        const SHIFT_OPTIONS = ['בוקר', 'ערב'];
        const activeEmps = employees.filter(e => e.id !== miyaId);

        const CONSTRAINT_META: Record<string, { label: string; labelPlural: string; color: string; bg: string }> = {
          block: { label: 'חסימה', labelPlural: 'חסימות', color: '#a32d2d', bg: '#fce8e8' },
          limit: { label: 'הגבלה', labelPlural: 'הגבלות', color: '#1d4ed8', bg: '#dbeafe' },
          fix:   { label: 'קיבוע', labelPlural: 'קיבועים', color: '#c2410c', bg: '#fff7ed' },
          hours: { label: 'שעות מותאמות', labelPlural: 'שעות מותאמות', color: '#7c3aed', bg: '#f3e8ff' },
          min:   { label: 'מינימום', labelPlural: 'מינימום', color: '#15803d', bg: '#dcfce7' },
          stationHours: { label: 'שעות עמדה', labelPlural: 'שעות עמדה', color: '#0e7490', bg: '#e0f2fe' },
          close: { label: 'סגירה', labelPlural: 'סגירות', color: '#dc2626', bg: '#fee2e2' },
        };

        const removeConstraint = (id: string) => { setSchedulingConstraints(prev => prev.filter(c => c.id !== id)); setConstraintsDirty(true); };

        const addConstraint = (c: SchedulingConstraint) => {
          setSchedulingConstraints(prev => [...prev, c]);
          setAddingConstraintType(null);
          setConstraintsDirty(true);
        };

        const describeConstraint = (c: SchedulingConstraint): string => {
          const empName = (id: string) => employees.find(e => e.id === id)?.name || '?';
          switch (c.type) {
            case 'block': return `${empName(c.employeeId)} לא תשובץ — ${c.day}${c.shift ? ` ${c.shift}` : ' (כל היום)'}`;
            case 'limit': return `${empName(c.employeeId)} — ${c.shiftType} בלבד`;
            case 'fix': return `${empName(c.employeeId)} → ${c.day} ${c.shift}${c.arrivalTime ? ` (${c.arrivalTime}–${c.departureTime})` : ''}`;
            case 'hours': return `${c.day} ${c.shift} → ${c.newArrival}–${c.newDeparture}${c.employeeId ? ` (${empName(c.employeeId)})` : ''}`;
            case 'min': return `${c.day} ${c.shift} — מינימום ${c.minCount} עובדות`;
            case 'stationHours': return `${c.day} ${c.shift} — ${c.station}: ${c.newArrival}–${c.newDeparture}`;
            case 'close': return `${c.day}${c.shift ? ` ${c.shift}` : ' (כל היום)'} — סגור`;
          }
        };

        const grouped = {
          block: schedulingConstraints.filter(c => c.type === 'block'),
          limit: schedulingConstraints.filter(c => c.type === 'limit'),
          fix: schedulingConstraints.filter(c => c.type === 'fix'),
          hours: schedulingConstraints.filter(c => c.type === 'hours'),
          min: schedulingConstraints.filter(c => c.type === 'min'),
          stationHours: schedulingConstraints.filter(c => c.type === 'stationHours'),
          close: schedulingConstraints.filter(c => c.type === 'close'),
        };

        const modalSelectStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #e8e0d4', background: 'white', color: '#1a1a1a' };
        const modalInputStyle: React.CSSProperties = { ...modalSelectStyle };
        const modalLabelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 };

        // Render mini modal for adding a constraint
        const renderMiniModal = () => {
          if (!addingConstraintType) return null;
          const meta = CONSTRAINT_META[addingConstraintType];
          let title = '';
          let body: React.ReactNode = null;
          let canAdd = false;

          if (addingConstraintType === 'block') {
            title = 'הוסף חסימה';
            canAdd = !!blockForm.employeeId && !!blockForm.day;
            body = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={modalLabelStyle}>עובדת *</label>
                  <select value={blockForm.employeeId} onChange={e => setBlockForm(f => ({ ...f, employeeId: e.target.value }))} style={modalSelectStyle}>
                    <option value="">— בחרי —</option>
                    {activeEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={modalLabelStyle}>יום *</label>
                  <select value={blockForm.day} onChange={e => setBlockForm(f => ({ ...f, day: e.target.value }))} style={modalSelectStyle}>
                    {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={modalLabelStyle}>משמרת (ריק = כל היום)</label>
                  <select value={blockForm.shift} onChange={e => setBlockForm(f => ({ ...f, shift: e.target.value }))} style={modalSelectStyle}>
                    <option value="">כל היום</option>
                    {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            );
          } else if (addingConstraintType === 'limit') {
            title = 'הוסף הגבלה';
            canAdd = !!limitForm.employeeId;
            body = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={modalLabelStyle}>עובדת *</label>
                  <select value={limitForm.employeeId} onChange={e => setLimitForm(f => ({ ...f, employeeId: e.target.value }))} style={modalSelectStyle}>
                    <option value="">— בחרי —</option>
                    {activeEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={modalLabelStyle}>סוג משמרת *</label>
                  <select value={limitForm.shiftType} onChange={e => setLimitForm(f => ({ ...f, shiftType: e.target.value as 'בוקר' | 'ערב' }))} style={modalSelectStyle}>
                    {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            );
          } else if (addingConstraintType === 'fix') {
            title = 'הוסף קיבוע';
            canAdd = !!fixForm.employeeId && !!fixForm.day && !!fixForm.shift;
            body = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={modalLabelStyle}>עובדת *</label>
                  <select value={fixForm.employeeId} onChange={e => setFixForm(f => ({ ...f, employeeId: e.target.value }))} style={modalSelectStyle}>
                    <option value="">— בחרי —</option>
                    {activeEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={modalLabelStyle}>יום *</label>
                    <select value={fixForm.day} onChange={e => setFixForm(f => ({ ...f, day: e.target.value }))} style={modalSelectStyle}>
                      {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabelStyle}>משמרת *</label>
                    <select value={fixForm.shift} onChange={e => setFixForm(f => ({ ...f, shift: e.target.value }))} style={modalSelectStyle}>
                      {(fixForm.day === 'שישי' ? ['בוקר'] : SHIFT_OPTIONS).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={modalLabelStyle}>שעת התחלה</label>
                    <input type="time" value={fixForm.arrivalTime} onChange={e => setFixForm(f => ({ ...f, arrivalTime: e.target.value }))} style={modalInputStyle} />
                  </div>
                  <div>
                    <label style={modalLabelStyle}>שעת סיום</label>
                    <input type="time" value={fixForm.departureTime} onChange={e => setFixForm(f => ({ ...f, departureTime: e.target.value }))} style={modalInputStyle} />
                  </div>
                </div>
              </div>
            );
          } else if (addingConstraintType === 'hours') {
            title = 'הוסף שעות מותאמות';
            canAdd = !!hoursForm.day && !!hoursForm.shift && !!hoursForm.newArrival && !!hoursForm.newDeparture && (hoursForm.mode === 'full' || !!hoursForm.employeeId);
            body = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={modalLabelStyle}>מצב</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setHoursForm(f => ({ ...f, mode: 'full', employeeId: '' }))} style={{ flex: 1, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: hoursForm.mode === 'full' ? '2px solid #7c3aed' : '1px solid #e8e0d4', background: hoursForm.mode === 'full' ? '#f3e8ff' : 'white', color: hoursForm.mode === 'full' ? '#7c3aed' : '#64748b', cursor: 'pointer' }}>
                      משמרת שלמה
                    </button>
                    <button onClick={() => setHoursForm(f => ({ ...f, mode: 'employee' }))} style={{ flex: 1, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: hoursForm.mode === 'employee' ? '2px solid #7c3aed' : '1px solid #e8e0d4', background: hoursForm.mode === 'employee' ? '#f3e8ff' : 'white', color: hoursForm.mode === 'employee' ? '#7c3aed' : '#64748b', cursor: 'pointer' }}>
                      עובדת ספציפית
                    </button>
                  </div>
                </div>
                {hoursForm.mode === 'employee' && (
                  <div>
                    <label style={modalLabelStyle}>עובדת *</label>
                    <select value={hoursForm.employeeId} onChange={e => setHoursForm(f => ({ ...f, employeeId: e.target.value }))} style={modalSelectStyle}>
                      <option value="">— בחרי —</option>
                      {activeEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={modalLabelStyle}>יום *</label>
                    <select value={hoursForm.day} onChange={e => setHoursForm(f => ({ ...f, day: e.target.value }))} style={modalSelectStyle}>
                      {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabelStyle}>משמרת *</label>
                    <select value={hoursForm.shift} onChange={e => setHoursForm(f => ({ ...f, shift: e.target.value }))} style={modalSelectStyle}>
                      {(hoursForm.day === 'שישי' ? ['בוקר'] : SHIFT_OPTIONS).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={modalLabelStyle}>שעת התחלה *</label>
                    <input type="time" value={hoursForm.newArrival} onChange={e => setHoursForm(f => ({ ...f, newArrival: e.target.value }))} style={modalInputStyle} />
                  </div>
                  <div>
                    <label style={modalLabelStyle}>שעת סיום *</label>
                    <input type="time" value={hoursForm.newDeparture} onChange={e => setHoursForm(f => ({ ...f, newDeparture: e.target.value }))} style={modalInputStyle} />
                  </div>
                </div>
              </div>
            );
          } else if (addingConstraintType === 'min') {
            title = 'הוסף מינימום';
            canAdd = !!minForm.day && !!minForm.shift && minForm.minCount > 0;
            body = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={modalLabelStyle}>יום *</label>
                    <select value={minForm.day} onChange={e => setMinForm(f => ({ ...f, day: e.target.value }))} style={modalSelectStyle}>
                      {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabelStyle}>משמרת *</label>
                    <select value={minForm.shift} onChange={e => setMinForm(f => ({ ...f, shift: e.target.value }))} style={modalSelectStyle}>
                      {(minForm.day === 'שישי' ? ['בוקר'] : SHIFT_OPTIONS).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={modalLabelStyle}>מינימום עובדות *</label>
                  <select value={minForm.minCount} onChange={e => setMinForm(f => ({ ...f, minCount: Number(e.target.value) }))} style={modalSelectStyle}>
                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            );
          } else if (addingConstraintType === 'stationHours') {
            title = 'הוסף שעות עמדה';
            canAdd = !!stationHoursForm.day && !!stationHoursForm.shift && !!stationHoursForm.station && !!stationHoursForm.newArrival && !!stationHoursForm.newDeparture;
            body = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={modalLabelStyle}>יום *</label>
                    <select value={stationHoursForm.day} onChange={e => setStationHoursForm(f => ({ ...f, day: e.target.value }))} style={modalSelectStyle}>
                      {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabelStyle}>משמרת *</label>
                    <select value={stationHoursForm.shift} onChange={e => setStationHoursForm(f => ({ ...f, shift: e.target.value }))} style={modalSelectStyle}>
                      {(stationHoursForm.day === 'שישי' ? ['בוקר'] : SHIFT_OPTIONS).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={modalLabelStyle}>עמדה *</label>
                  <select value={stationHoursForm.station} onChange={e => setStationHoursForm(f => ({ ...f, station: e.target.value }))} style={modalSelectStyle}>
                    {['קופה 1', 'קופה 2', 'קופה 3', 'קופה 4', 'וולט'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={modalLabelStyle}>שעת התחלה *</label>
                    <input type="time" value={stationHoursForm.newArrival} onChange={e => setStationHoursForm(f => ({ ...f, newArrival: e.target.value }))} style={modalInputStyle} />
                  </div>
                  <div>
                    <label style={modalLabelStyle}>שעת סיום *</label>
                    <input type="time" value={stationHoursForm.newDeparture} onChange={e => setStationHoursForm(f => ({ ...f, newDeparture: e.target.value }))} style={modalInputStyle} />
                  </div>
                </div>
              </div>
            );
          } else if (addingConstraintType === 'close') {
            title = 'הוסף סגירה';
            canAdd = !!closeForm.day;
            body = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={modalLabelStyle}>יום *</label>
                  <select value={closeForm.day} onChange={e => setCloseForm(f => ({ ...f, day: e.target.value }))} style={modalSelectStyle}>
                    {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={modalLabelStyle}>משמרת (ריק = כל היום)</label>
                  <select value={closeForm.shift} onChange={e => setCloseForm(f => ({ ...f, shift: e.target.value }))} style={modalSelectStyle}>
                    <option value="">כל היום</option>
                    {(closeForm.day === 'שישי' ? ['בוקר'] : SHIFT_OPTIONS).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            );
          }

          const handleAdd = () => {
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
            if (addingConstraintType === 'block') {
              addConstraint({ type: 'block', id, employeeId: blockForm.employeeId, day: blockForm.day, shift: blockForm.shift });
              setBlockForm({ employeeId: '', day: 'ראשון', shift: '' });
            } else if (addingConstraintType === 'limit') {
              addConstraint({ type: 'limit', id, employeeId: limitForm.employeeId, shiftType: limitForm.shiftType });
              setLimitForm({ employeeId: '', shiftType: 'בוקר' });
            } else if (addingConstraintType === 'fix') {
              addConstraint({ type: 'fix', id, employeeId: fixForm.employeeId, day: fixForm.day, shift: fixForm.shift, arrivalTime: fixForm.arrivalTime || undefined, departureTime: fixForm.departureTime || undefined });
              setFixForm({ employeeId: '', day: 'ראשון', shift: 'בוקר', arrivalTime: '', departureTime: '' });
            } else if (addingConstraintType === 'hours') {
              addConstraint({ type: 'hours', id, day: hoursForm.day, shift: hoursForm.shift, newArrival: hoursForm.newArrival, newDeparture: hoursForm.newDeparture, employeeId: hoursForm.mode === 'employee' ? hoursForm.employeeId : undefined });
              setHoursForm({ mode: 'full', day: 'ראשון', shift: 'בוקר', newArrival: '', newDeparture: '', employeeId: '' });
            } else if (addingConstraintType === 'min') {
              addConstraint({ type: 'min', id, day: minForm.day, shift: minForm.shift, minCount: minForm.minCount });
              setMinForm({ day: 'ראשון', shift: 'בוקר', minCount: 2 });
            } else if (addingConstraintType === 'stationHours') {
              addConstraint({ type: 'stationHours', id, day: stationHoursForm.day, shift: stationHoursForm.shift, station: stationHoursForm.station, newArrival: stationHoursForm.newArrival, newDeparture: stationHoursForm.newDeparture });
              setStationHoursForm({ day: 'ראשון', shift: 'בוקר', station: 'קופה 1', newArrival: '', newDeparture: '' });
            } else if (addingConstraintType === 'close') {
              addConstraint({ type: 'close', id, day: closeForm.day, shift: closeForm.shift });
              setCloseForm({ day: 'ראשון', shift: '' });
            }
          };

          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setAddingConstraintType(null)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: 20, width: '90%', maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', direction: 'rtl' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: meta.bg, color: meta.color }}>{meta.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1a4a2e' }}>{title}</span>
                </div>
                {body}
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button onClick={() => setAddingConstraintType(null)} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>ביטול</button>
                  <button onClick={handleAdd} disabled={!canAdd} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 700, background: canAdd ? meta.color : '#d1cdc6', color: 'white', border: 'none', borderRadius: 6, cursor: canAdd ? 'pointer' : 'not-allowed' }}>הוסף</button>
                </div>
              </div>
            </div>
          );
        };

        const weekLabel = (() => {
          const s = getWeekStart(weekOffset);
          const e = new Date(s); e.setDate(s.getDate() + 5);
          return `${s.getDate()}.${s.getMonth() + 1} – ${e.getDate()}.${e.getMonth() + 1}`;
        })();

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { if (constraintsDirty) { setUnsavedTarget('constraints'); } else { setShowConstraintsModal(false); setAddingConstraintType(null); } }}>
            <div onClick={e => e.stopPropagation()} dir="rtl" style={{ background: 'white', borderRadius: 14, padding: 24, width: '92%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a4a2e' }}>הנחיות לשיבוץ</h2>
                <button onClick={() => { if (constraintsDirty) { setUnsavedTarget('constraints'); } else { setShowConstraintsModal(false); setAddingConstraintType(null); } }} style={{ width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>✕</button>
              </div>

              {/* Week range */}
              <div style={{ background: '#f8f7f4', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>שבוע:</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1a4a2e' }}>{weekLabel}</span>
              </div>

              {/* Constraints list grouped by type */}
              {schedulingConstraints.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: 13 }}>
                  לא הוגדרו הנחיות. לחצי על כפתור למטה כדי להוסיף.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  {(['block', 'limit', 'fix', 'hours', 'min', 'stationHours', 'close'] as const).map(type => {
                    const items = grouped[type];
                    if (items.length === 0) return null;
                    const meta = CONSTRAINT_META[type];
                    return (
                      <div key={type}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: meta.color, marginBottom: 6 }}>{meta.labelPlural}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {items.map(c => (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: meta.bg, borderRadius: 8, padding: '7px 12px' }}>
                              <span style={{ flex: 1, fontSize: 13, color: '#1a1a1a' }}>{describeConstraint(c)}</span>
                              <button onClick={() => removeConstraint(c.id)} style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>✕</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                {(['block', 'limit', 'fix', 'hours', 'min', 'stationHours', 'close'] as const).map(type => {
                  const meta = CONSTRAINT_META[type];
                  return (
                    <button key={type} onClick={() => setAddingConstraintType(type)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33`, borderRadius: 6, cursor: 'pointer' }}>
                      + {meta.label}
                    </button>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #e8e0d4', paddingTop: 14 }}>
                <button onClick={() => { if (constraintsDirty) { setUnsavedTarget('constraints'); } else { setShowConstraintsModal(false); setAddingConstraintType(null); } }} style={{ padding: '8px 18px', fontSize: 14, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>
                  ביטול
                </button>
                <button
                  onClick={() => {
                    setShowConstraintsModal(false);
                    setAddingConstraintType(null);
                    setConstraintsDirty(false);
                  }}
                  style={{ padding: '8px 22px', fontSize: 14, fontWeight: 700, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                >
                  שמור הנחיות
                </button>
              </div>
            </div>

            {/* Mini modal overlay */}
            {renderMiniModal()}
          </div>
        );
      })()}

      {/* Custom shift modal */}
      {showCustomShiftModal && (() => {
        const isValid = customShiftForm.name.trim() !== ''
          && customShiftForm.startTime !== ''
          && customShiftForm.endTime !== ''
          && customShiftForm.name !== 'בוקר' && customShiftForm.name !== 'ערב'
          && !(customShifts[customShiftModalDay] || []).some(cs => cs.name === customShiftForm.name)
          && (customShiftForm.endTime === '' || customShiftForm.startTime === '' || timeToMinutes(customShiftForm.endTime) > timeToMinutes(customShiftForm.startTime));

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 440, width: '95%', direction: 'rtl' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#EF9F27' }}>הוספת משמרת</h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>המשמרת תתווסף בין הבוקר לערב בהתאם לשעות</p>

              {/* Day select */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>יום</label>
                <select
                  value={customShiftModalDay}
                  onChange={e => setCustomShiftModalDay(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #e8e0d4' }}
                >
                  {WEEK_STRUCTURE.map(w => <option key={w.day} value={w.day}>{w.day}</option>)}
                </select>
              </div>

              {/* Shift name */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>שם משמרת</label>
                <input
                  type="text"
                  placeholder="לדוגמה: צהריים, חפיפה"
                  value={customShiftForm.name}
                  onChange={e => setCustomShiftForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #e8e0d4', boxSizing: 'border-box' }}
                />
                {(customShiftForm.name === 'בוקר' || customShiftForm.name === 'ערב') && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>לא ניתן להשתמש בשם "בוקר" או "ערב"</div>
                )}
                {(customShifts[customShiftModalDay] || []).some(cs => cs.name === customShiftForm.name) && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>שם משמרת כזה כבר קיים ביום {customShiftModalDay}</div>
                )}
              </div>

              {/* Times */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>שעת התחלה</label>
                  <input
                    type="time"
                    value={customShiftForm.startTime}
                    onChange={e => setCustomShiftForm(f => ({ ...f, startTime: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #e8e0d4', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>שעת סיום</label>
                  <input
                    type="time"
                    value={customShiftForm.endTime}
                    onChange={e => setCustomShiftForm(f => ({ ...f, endTime: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #e8e0d4', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              {customShiftForm.startTime && customShiftForm.endTime && timeToMinutes(customShiftForm.endTime) <= timeToMinutes(customShiftForm.startTime) && (
                <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>שעת הסיום חייבת להיות אחרי שעת ההתחלה</div>
              )}

              {/* Required count */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>מספר עובדות</label>
                <select
                  value={customShiftForm.requiredCount}
                  onChange={e => setCustomShiftForm(f => ({ ...f, requiredCount: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #e8e0d4' }}
                >
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              {/* Info note */}
              {customShiftForm.startTime && customShiftForm.endTime && timeToMinutes(customShiftForm.endTime) > timeToMinutes(customShiftForm.startTime) && (
                <div style={{ background: '#EBF3D8', border: '1px solid #C8DBA0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#2D5016', lineHeight: 1.6 }}>
                  ✨ משמרת מיוחדת — תוצג בנוסף למשמרות הבוקר/ערב הקיימות (לא משפיעה על שעותיהן)
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowCustomShiftModal(false)}
                  style={{ padding: '8px 16px', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', background: '#f5f0e8', color: '#475569', fontWeight: 600, fontSize: 13 }}
                >
                  סגור ללא שמירה
                </button>
                <button
                  onClick={createCustomShift}
                  disabled={!isValid}
                  style={{ padding: '8px 16px', background: isValid ? '#EF9F27' : '#d1cdc6', color: 'white', border: 'none', borderRadius: 6, cursor: isValid ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13 }}
                >
                  שמור והוסף משמרת
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PDF export modal */}
      {showPdfModal && (() => {
        const PDF_WEEK_OPTIONS = [
          { label: 'השבוע הנוכחי', offset: 0 },
          { label: 'השבוע הבא', offset: 1 },
          { label: 'עוד שבועיים', offset: 2 },
          { label: 'עוד שלושה שבועות', offset: 3 },
          { label: 'עוד חודש', offset: 4 },
        ];
        const pdfWeekInfos = PDF_WEEK_OPTIONS.map(opt => {
          const sun = getWeekStart(opt.offset);
          const fri = new Date(sun.getTime() + 5 * 86400000);
          const range = `${sun.getDate()}.${sun.getMonth() + 1} – ${fri.getDate()}.${fri.getMonth() + 1}.${sun.getFullYear()}`;
          const key = formatWeekKey(sun);
          return { ...opt, range, key };
        });
        const anyChecked = pdfWeekChecks.some(Boolean);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPdfModal(false)}>
            <div style={{ background: 'white', borderRadius: 12, padding: 28, minWidth: 380, maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a4a2e', marginBottom: 4 }}>ייצוא ל-PDF</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b', marginBottom: 18 }}>בחרי את השבועות לייצוא — כל שבוע יופיע בעמוד נפרד</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pdfWeekInfos.map((w, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: pdfWeekChecks[i] ? '#f0fdf4' : '#fafaf9', border: `1px solid ${pdfWeekChecks[i] ? '#86efac' : '#e8e0d4'}`, transition: 'all 0.15s' }}>
                    <input
                      type="checkbox"
                      checked={pdfWeekChecks[i]}
                      onChange={() => setPdfWeekChecks(prev => prev.map((v, j) => j === i ? !v : v))}
                      style={{ width: 18, height: 18, accentColor: '#1a4a2e', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a4a2e' }}>{w.label}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{w.range}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, borderTop: '1px solid #e8e0d4', paddingTop: 14 }}>
                <button onClick={() => setShowPdfModal(false)} style={{ padding: '8px 18px', fontSize: 14, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>
                  ביטול
                </button>
                <button
                  disabled={!anyChecked}
                  onClick={() => {
                    const selectedKeys = pdfWeekInfos.filter((_, i) => pdfWeekChecks[i]).map(w => w.key);
                    setShowPdfModal(false);
                    generatePDF(selectedKeys);
                  }}
                  style={{ padding: '8px 22px', fontSize: 14, fontWeight: 700, background: anyChecked ? '#1a4a2e' : '#94a3b8', color: 'white', border: 'none', borderRadius: 6, cursor: anyChecked ? 'pointer' : 'not-allowed', opacity: anyChecked ? 1 : 0.6 }}
                >
                  ייצא PDF
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Volt conflict modal */}
      {voltConflictModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div dir="rtl" style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 380, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#7c3aed' }}>כבר יש אחראית וולט במשמרת זו</h3>
            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 12px' }}>בחרי מי תהיה אחראית וולט:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {voltConflictModal.slots.map((vs, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 10px', background: vs.checked ? '#f3e8ff' : '#f5f5f5', borderRadius: 6, border: `1px solid ${vs.checked ? '#c4b5fd' : '#e8e0d4'}` }}>
                  <input type="checkbox" checked={vs.checked} onChange={() => {
                    setVoltConflictModal(prev => prev ? {
                      ...prev,
                      slots: prev.slots.map((s, j) => j === i ? { ...s, checked: !s.checked } : s),
                    } : null);
                  }} style={{ width: 14, height: 14, accentColor: '#7c3aed' }} />
                  <span style={{ fontWeight: 600, color: '#1a4a2e' }}>{vs.empName}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>({vs.station})</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setVoltConflictModal(null)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#f5f0e8', color: '#475569', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer' }}>ביטול</button>
              <button onClick={() => {
                const { day, shift, slots: voltSlots } = voltConflictModal;
                const key = `${day}_${shift}`;
                const currentSlots = getOrInitializeSlots(day, shift);
                const newSlots = currentSlots.map((s, i) => {
                  const vs = voltSlots.find(v => v.idx === i);
                  if (vs) return { ...s, voltResponsible: vs.checked };
                  // Remove volt from slots not in the modal
                  if (s.voltResponsible) return { ...s, voltResponsible: false };
                  return s;
                });
                // Also update tempSlotData for the current editing slot
                const currentVs = voltSlots.find(v => v.idx === (editingSlot?.slotIdx ?? -1));
                if (currentVs) setTempSlotData(prev => ({ ...prev, voltResponsible: currentVs.checked }));
                saveSchedule({ ...schedule, [key]: newSlots });
                setVoltConflictModal(null);
                setSlotDirtyBoth(true);
              }} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>שמור</button>
            </div>
          </div>
        </div>
      )}
      {/* Unsaved changes dialog */}
      {unsavedTarget && (
        <UnsavedChangesDialog
          onDiscard={() => {
            if (unsavedTarget === 'slot') { closePopover(true); }
            else if (unsavedTarget === 'constraints') { setShowConstraintsModal(false); setAddingConstraintType(null); setConstraintsDirty(false); }
            setUnsavedTarget(null);
          }}
          onCancel={() => setUnsavedTarget(null)}
        />
      )}
    </div>
  );
}

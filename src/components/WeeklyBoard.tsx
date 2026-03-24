import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { calculateFairnessScore, calculateFlexibilityScore } from '../utils/fairnessScore';
import { addFairnessEvents } from '../utils/fairnessAccumulator';
import type { Employee } from '../data/employees';
import type { EmployeePrefs } from '../types';

interface WeeklyBoardProps {
  employees: Employee[];
  autoScheduleRequest?: string | null;
  onAutoScheduleHandled?: () => void;
  onNavigateToPreferences?: () => void;
}

const MIYA_ID = 1;

interface Slot {
  employeeId: number | null;
  arrivalTime: string;
  departureTime: string;
  station: string;
  locked?: boolean;
}

type Schedule = Record<string, Slot[]>;
type VoltFlags = Record<string, boolean>;

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
    'בוקר': [{ arrival: '06:30', departure: '14:00' }, { arrival: '07:00', departure: '14:30' }, { arrival: '07:00', departure: '15:00' }],
    'ערב':  [{ arrival: '14:00', departure: '21:00' }, { arrival: '14:30', departure: '21:00' }, { arrival: '15:00', departure: '21:00' }],
  },
  'שישי':   {
    'בוקר': [
      { arrival: '06:30', departure: '15:00' }, { arrival: '06:45', departure: '15:30' },
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

function isEmployeeAvailable(emp: Employee, day: string, shift: string): boolean {
  if (day === 'שישי' && !emp.friday) return false;
  if (emp.shiftType !== 'הכל') {
    if (emp.shiftType === 'בוקר' && shift !== 'בוקר') return false;
    if (emp.shiftType === 'ערב' && shift !== 'ערב') return false;
  }
  return true;
}

interface ShortageItem { emp: Employee; needed: number; got: number; }
interface TieItem { day: string; shift: string; slotIdx: number; candidates: Employee[]; scores: Record<number, number>; }
interface TraineeResult { name: string; assigned: boolean; reason?: string; }
interface AutoResultModal { isOpen: boolean; shortages: ShortageItem[]; ties: TieItem[]; emptySlots: { day: string; shift: string }[]; pendingSchedule: Schedule; traineeResults: TraineeResult[]; }

function calculateNewStabilityScore(emp: Employee): number {
  const now = new Date();
  let seniority = 0;
  if (emp.availableFromDate) {
    const fromDate = new Date(emp.availableFromDate);
    const months = (now.getTime() - fromDate.getTime()) / (30 * 24 * 60 * 60 * 1000);
    seniority = Math.min(Math.max(months / 12, 0), 1.0);
  }
  let bonus = 1.0;
  if (emp.availableToDate) {
    const toDate = new Date(emp.availableToDate);
    const months = (toDate.getTime() - now.getTime()) / (30 * 24 * 60 * 60 * 1000);
    bonus = Math.min(Math.max(months / 12, 0), 1.0);
  }
  return ((seniority + bonus) / 2) * 4;
}

function calculateCompositeScore(emp: Employee): number {
  const stability = calculateNewStabilityScore(emp) / 4;
  const flexibility = calculateFlexibilityScore(emp) / 100;
  const fairness = calculateFairnessScore(emp);
  return 0.5 * stability + 0.4 * flexibility + 0.1 / (1 + fairness);
}

export function WeeklyBoard({ employees, autoScheduleRequest, onAutoScheduleHandled, onNavigateToPreferences }: WeeklyBoardProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedule, setSchedule] = useState<Schedule>({});
  const [voltFlags, setVoltFlags] = useState<VoltFlags>({});
  const [copied, setCopied] = useState(false);

  const [preferences, setPreferences] = useState<Record<number, EmployeePrefs>>({});
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
  const [planAheadToast, setPlanAheadToast] = useState<{ show: boolean; count: number }>({ show: false, count: 0 });
  const [planAheadNoPrefsWarning, setPlanAheadNoPrefsWarning] = useState(false);
  const [noPrefsToast, setNoPrefsToast] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const [mobileDayIndex, setMobileDayIndex] = useState(0);
  const pendingAutoScheduleRef = useRef(false);
  const [editingSlot, setEditingSlot] = useState<{ day: string; shift: string; slotIdx: number; isNew?: boolean } | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [popoverValidationError, setPopoverValidationError] = useState(false);
  const [slotAddToast, setSlotAddToast] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!editingSlot) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditingSlot(null);
        setPopoverPos(null);
        setPopoverValidationError(false);
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
  }, [editingSlot, calcPopoverPos, schedule]);

  const weekStart = getWeekStart(weekOffset);
  const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

  function formatWeekKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
        if (emp.id === MIYA_ID) continue;
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

  function createPlanAheadWeeks(force?: boolean) {
    if (!force && !checkPlanAheadPreferences()) {
      setPlanAheadNoPrefsWarning(true);
      return;
    }
    const sundays = getWeekSundaysInRange(planAheadFrom, planAheadTo);
    let created = 0;
    for (const sunday of sundays) {
      const key = formatWeekKey(sunday);
      if (localStorage.getItem(`schedule_${key}`)) continue; // skip existing
      const emptySchedule: Schedule = {};
      for (const { day, shifts } of WEEK_STRUCTURE) {
        for (const shift of shifts) {
          emptySchedule[`${day}_${shift}`] = initializeSlots(day, shift);
        }
      }
      localStorage.setItem(`schedule_${key}`, JSON.stringify(emptySchedule));
      created++;
    }
    setPlanAheadNoPrefsWarning(false);
    setShowPlanAheadModal(false);
    if (created > 0) {
      setPlanAheadToast({ show: true, count: created });
      setTimeout(() => setPlanAheadToast({ show: false, count: 0 }), 3000);
    }
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
    const saved = localStorage.getItem(`schedule_${weekKey}`);
    setSchedule(saved ? JSON.parse(saved) : {});

    const savedVolt = localStorage.getItem(`voltFlags_${weekKey}`);
    setVoltFlags(savedVolt ? JSON.parse(savedVolt) : {});

    const prefForWeek: Record<number, EmployeePrefs> = {};
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
    setPreferences(prefForWeek);

    // If an auto-schedule was requested from PreferencesTab, run it now with fresh prefs
    if (pendingAutoScheduleRef.current) {
      pendingAutoScheduleRef.current = false;
      // Use setTimeout to ensure React has committed the state updates
      setTimeout(() => autoSchedule(prefForWeek), 0);
    }
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
    return { ...d, dateStr: formatDate(date) };
  });

  function saveSchedule(newSchedule: Schedule) {
    setSchedule(newSchedule);
    localStorage.setItem(`schedule_${weekKey}`, JSON.stringify(newSchedule));
  }

  function resetSchedule() {
    if (!confirm('האם לאפס את כל השיבוץ השבועי? פעולה זו לא ניתנת לביטול')) return;
    const resetted: Schedule = {};
    for (const key of Object.keys(schedule)) {
      resetted[key] = (schedule[key] || []).map(slot =>
        slot.locked ? slot : { ...slot, employeeId: null, station: '' }
      );
    }
    saveSchedule(resetted);
    setManualShortages([]);
    setResetToast(true);
    setTimeout(() => setResetToast(false), 3000);
  }

  function saveVoltFlags(newFlags: VoltFlags) {
    setVoltFlags(newFlags);
    localStorage.setItem(`voltFlags_${weekKey}`, JSON.stringify(newFlags));
  }

  function initializeSlots(day: string, shift: string): Slot[] {
    const slots: Slot[] = [];
    if (shift === 'בוקר') {
      const miya = MIYA_SCHEDULE[day];
      if (miya) {
        slots.push({ employeeId: MIYA_ID, arrivalTime: miya.arrival, departureTime: miya.departure, station: 'קופה 1', locked: true });
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
    saveSchedule({ ...schedule, [key]: [...slots, { employeeId: null, arrivalTime: '', departureTime: '', station: '' }] });
  }

  function removeSlot(day: string, shift: string, slotIdx: number) {
    const key = `${day}_${shift}`;
    const slots = getOrInitializeSlots(day, shift);
    if (slots[slotIdx]?.locked) return;
    saveSchedule({ ...schedule, [key]: slots.filter((_, i) => i !== slotIdx) });
  }

  function toggleVolt(cellKey: string) {
    saveVoltFlags({ ...voltFlags, [cellKey]: !voltFlags[cellKey] });
  }

  function autoSchedule(overridePrefs?: Record<number, EmployeePrefs>) {
    const prefs = overridePrefs ?? preferences;

    // Check if any employee has preferences for this week
    const hasAnyPrefs = employees.some(e => {
      if (e.id === MIYA_ID) return false;
      const empPrefs = prefs[e.id];
      return empPrefs && Object.values(empPrefs).flat().length > 0;
    });
    if (!hasAnyPrefs) {
      setNoPrefsToast(true);
      setTimeout(() => setNoPrefsToast(false), 5000);
      return;
    }

    // Always use canonical initializeSlots — never depend on saved schedule state.
    // This ensures every shift has the correct default number of open slots.
    const workingSlots: Record<string, Slot[]> = {};
    for (const { day, shifts } of WEEK_STRUCTURE) {
      for (const shift of shifts) {
        const key = `${day}_${shift}`;
        workingSlots[key] = initializeSlots(day, shift);
        console.log(`[AutoSchedule] ${day} ${shift}: ${workingSlots[key].filter(s => !s.locked).length} open slots`);
      }
    }

    // Count only locked (Miya) slots — everyone else starts at 0
    const assignedCount: Record<number, number> = {};
    for (const slots of Object.values(workingSlots)) {
      for (const slot of slots) {
        if (slot.employeeId !== null && slot.locked)
          assignedCount[slot.employeeId] = (assignedCount[slot.employeeId] || 0) + 1;
      }
    }

    // Only schedule employees who submitted at least one preference this week
    const activeEmployees = employees.filter(e => {
      if (e.id === MIYA_ID) return false;
      const empPrefs = prefs[e.id];
      return empPrefs && Object.values(empPrefs).flat().length > 0;
    });
    const regularEmployees = activeEmployees.filter(e => !e.isTrainee);
    const traineeEmployees = activeEmployees.filter(e => e.isTrainee);
    console.log('[AutoSchedule] active employees this week:', activeEmployees.length,
      '(regular:', regularEmployees.length, ', trainees:', traineeEmployees.length, ')');

    const shortages: ShortageItem[] = [];

    // ── Phase 1: guarantee minimum shifts per employee (round-robin) ──
    const neededMap: Record<number, number> = {};
    const originalNeeded: Record<number, number> = {};
    // Count total requested slots per employee (for margin-based priority)
    const totalRequested: Record<number, number> = {};
    for (const emp of regularEmployees) {
      const minimum = Math.ceil(emp.shiftsPerWeek * 0.75);
      const n = Math.max(0, minimum - (assignedCount[emp.id] || 0));
      neededMap[emp.id] = n;
      originalNeeded[emp.id] = n;
      // Count how many distinct shift slots this employee can actually be assigned to
      // (must match both preference AND availability — same checks as findNextSlot)
      let count = 0;
      for (const { day, shifts } of WEEK_STRUCTURE) {
        for (const shift of shifts) {
          if (!isEmployeeAvailable(emp, day, shift)) continue;
          if ((prefs[emp.id]?.[day] || []).some(p => p.shift === shift)) count++;
        }
      }
      totalRequested[emp.id] = count;
    }

    // Find next available requested open slot for an employee
    const findNextSlot = (emp: Employee) => {
      for (const { day, shifts } of WEEK_STRUCTURE) {
        for (const shift of shifts) {
          if (!isEmployeeAvailable(emp, day, shift)) continue;
          if (!(prefs[emp.id]?.[day] || []).some(p => p.shift === shift)) continue;
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
      const displaceSlots: { key: string; day: string; shift: string; slotIdx: number; currentEmpId: number }[] = [];
      for (const { day, shifts } of WEEK_STRUCTURE) {
        for (const shift of shifts) {
          if (!isEmployeeAvailable(emp, day, shift)) continue;
          if (!(prefs[emp.id]?.[day] || []).some(p => p.shift === shift)) continue;
          const key = `${day}_${shift}`;
          const slots = workingSlots[key];
          if (slots.some(s => s.employeeId === emp.id)) continue;
          for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (slot.locked) continue;
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
    for (const { day, shifts } of WEEK_STRUCTURE) {
      for (const shift of shifts) {
        const key = `${day}_${shift}`;
        const slots = workingSlots[key];
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].locked || slots[i].employeeId !== null) continue;
          const alreadyInShift = new Set(
            slots.map(s => s.employeeId).filter((id): id is number => id !== null)
          );
          const candidates = regularEmployees.filter(e =>
            isEmployeeAvailable(e, day, shift) &&
            !alreadyInShift.has(e.id) &&
            (prefs[e.id]?.[day] || []).some(p => p.shift === shift)
          );
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
          const scores: Record<number, number> = {};
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
    for (const { day, shifts } of WEEK_STRUCTURE) {
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
          slots[i] = { ...slots[i], station: stIdx < availableStations.length ? availableStations[stIdx++] : '' };
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

      for (const { day, shifts } of WEEK_STRUCTURE) {
        for (const shift of shifts) {
          if (!isEmployeeAvailable(trainee, day, shift)) continue;
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

    // Always show the result modal for review
    setAutoResultModal({ isOpen: true, shortages, ties, emptySlots, pendingSchedule: { ...workingSlots }, traineeResults });
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
    const counts: Record<number, number> = {};
    for (const { day, shifts } of WEEK_STRUCTURE) {
      for (const shift of shifts) {
        for (const slot of sched[`${day}_${shift}`] || []) {
          if (slot.employeeId !== null && !slot.locked)
            counts[slot.employeeId] = (counts[slot.employeeId] || 0) + 1;
        }
      }
    }

    const canWork = (day: string, shift: string) => {
      if (day === 'שישי' && !emp.friday) return false;
      if (emp.shiftType !== 'הכל' && emp.shiftType !== shift) return false;
      return true;
    };

    const hasRequested = (day: string, shift: string) =>
      (preferences[emp.id]?.[day] || []).some(p => p.shift === shift);

    const openSlots: { day: string; shift: string; slotIdx: number }[] = [];
    const transferOptions: { fromEmp: Employee; day: string; shift: string; slotIdx: number }[] = [];

    for (const { day, shifts } of WEEK_STRUCTURE) {
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

  function transferSlot(shortage: ShortageItem, fromEmpId: number, day: string, shift: string, slotIdx: number) {
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
    const counts: Record<number, number> = {};
    for (const { day, shifts } of WEEK_STRUCTURE) {
      for (const shift of shifts) {
        for (const slot of schedule[`${day}_${shift}`] || []) {
          if (slot.employeeId !== null && !slot.locked)
            counts[slot.employeeId] = (counts[slot.employeeId] || 0) + 1;
        }
      }
    }
    const canWork = (day: string, shift: string) => {
      if (day === 'שישי' && !emp.friday) return false;
      if (emp.shiftType !== 'הכל' && emp.shiftType !== shift) return false;
      return true;
    };
    const openSlots: { day: string; shift: string; slotIdx: number }[] = [];
    const transferOptions: { fromEmp: Employee; day: string; shift: string; slotIdx: number }[] = [];
    for (const { day, shifts } of WEEK_STRUCTURE) {
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

  function boardTransferSlot(shortage: ShortageItem, fromEmpId: number, day: string, shift: string, slotIdx: number) {
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
    for (const { day, shifts } of WEEK_STRUCTURE) {
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
    setAutoResultModal({ isOpen: false, shortages: [], ties: [], emptySlots: [], pendingSchedule: {}, traineeResults: [] });
  }

  function generateWhatsAppText(): string {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    let text = `שיבוץ שבוע ${formatDate(weekStart)}–${formatDate(weekEnd)}.${weekStart.getFullYear()}\n\n`;
    for (const d of weekDays) {
      text += `${d.day} ${d.dateStr}:\n`;
      for (const shift of d.shifts) {
        const slots = getOrInitializeSlots(d.day, shift);
        const assigned = slots.filter(s => s.employeeId !== null);
        if (assigned.length > 0) {
          text += `${shift}:\n`;
          for (const slot of assigned) {
            const name = (slot.locked && slot.employeeId !== null)
              ? 'מיה'
              : employees.find(e => e.id === slot.employeeId)?.name || '?';
            const station = slot.station ? ` (${slot.station})` : '';
            text += `  ${slot.arrivalTime} ${name}${station} → ${slot.departureTime || '?'}\n`;
          }
        }
      }
      text += '\n';
    }
    return text.trim();
  }

  function generatePDF() {
    try {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 5);
      const title = `שיבוץ משמרות - שבוע ${weekStart.getDate()}.${weekStart.getMonth() + 1}–${weekEnd.getDate()}.${weekEnd.getMonth() + 1}.${weekStart.getFullYear()}`;

      const days = weekDays.map(d => d.day);
      let rows = '';
      rows += '<tr style="background:#ddd;font-weight:bold">';
      rows += '<td style="padding:10px;border:1px solid #999;text-align:center">משמרה</td>';
      for (const day of days) rows += `<td style="padding:10px;border:1px solid #999;text-align:center">${day}</td>`;
      rows += '</tr>';

      for (const shift of ['בוקר', 'ערב']) {
        rows += `<tr><td style="padding:10px;border:1px solid #999;background:#f5f5f5;font-weight:bold;text-align:center">${shift}</td>`;
        for (const day of days) {
          const dayObj = WEEK_STRUCTURE.find(w => w.day === day);
          if (!dayObj?.shifts.includes(shift)) {
            rows += '<td style="padding:10px;border:1px solid #999;text-align:center;color:#bbb">—</td>';
            continue;
          }
          const slots = getOrInitializeSlots(day, shift);
          const content = slots
            .filter(s => s.employeeId !== null)
            .map(s => {
              const name = (s.locked && s.employeeId !== null) ? 'מיה' : employees.find(e => e.id === s.employeeId)?.name || '?';
              return `${s.arrivalTime} ${name}${s.station ? ` [${s.station}]` : ''}`;
            }).join('<br>');
          const empty = slots.every(s => s.employeeId === null);
          rows += `<td style="padding:10px;border:1px solid #999;background:${empty ? '#ffcccc' : '#fff'};text-align:center">${content || '---'}</td>`;
        }
        rows += '</tr>';
      }

      const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;direction:rtl;padding:20px}table{width:100%;border-collapse:collapse}td{font-size:13px}
@media print{.btns{display:none}}</style></head><body>
<h1 style="text-align:center">${title}</h1>
<table>${rows}</table>
<div class="btns" style="text-align:center;margin-top:20px">
<button onclick="window.print()">🖨️ הדפס</button> <button onclick="window.close()">✕ סגור</button>
</div></body></html>`;

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
    const isEmpty = slot.employeeId === null;
    const empName = isMiyaFixed ? 'מיה' : employees.find(e => e.id === slot.employeeId)?.name || null;
    const isEditing = editingSlot?.day === day && editingSlot?.shift === shift && editingSlot?.slotIdx === slotIdx;
    const slotKey = `${day}_${shift}_${slotIdx}`;
    const isHovered = hoveredSlot === slotKey;

    const stationLabel = getStationBadge(slot.station);

    // Duplicate check: is this employee already in another slot of the same shift?
    // Compare by numeric ID; skip locked (Miya) slots in comparison
    const shiftSlots = schedule[`${day}_${shift}`] || [];
    const currentEmpId = slot.employeeId !== null ? Number(slot.employeeId) : null;
    const isDuplicate = !isLockedSlot && currentEmpId !== null && shiftSlots.some((s, i) =>
      i !== slotIdx && !s.locked && s.employeeId !== null && Number(s.employeeId) === currentEmpId
    );
    const duplicateName = isDuplicate ? (employees.find(e => e.id === slot.employeeId)?.name || '') : '';

    // Card background & border
    const cardBg = isMiyaFixed ? '#f0fdf4' : isTraineeSlot ? '#fff7ed' : 'white';
    const cardBorder = isMiyaFixed
      ? '1px solid #a7d5b8'
      : isTraineeSlot
      ? '1px solid #fed7aa'
      : isEmpty
      ? '1px dashed #cbd5e1'
      : isHovered
      ? '1px solid #4a7c59'
      : '1px solid #e8e0d4';

    const popoverInputStyle: React.CSSProperties = { width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #e8e0d4', borderRadius: 4 };
    const popoverSelectStyle: React.CSSProperties = { ...popoverInputStyle };
    const popoverLabelStyle: React.CSSProperties = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 };

    // Validation: locked (Miya) slots are always valid
    const isIncomplete = !isLockedSlot && (slot.employeeId === null || !slot.arrivalTime || !slot.departureTime || !slot.station);
    function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
      if (isEditing) {
        setEditingSlot(null); setPopoverPos(null); setPopoverValidationError(false);
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
                {empName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {slot.arrivalTime || '—'} ← {slot.departureTime || '—'}
                </span>
                <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  {isTraineeSlot && (
                    <span style={{ fontSize: 9, background: '#c17f3b', color: 'white', padding: '1px 5px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>מתלמד</span>
                  )}
                  {stationLabel && (
                    <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {stationLabel}
                    </span>
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
              onClick={() => { setEditingSlot(null); setPopoverPos(null); setPopoverValidationError(false); }}
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
              {/* X close button — closes without saving, no confirm */}
              <button
                onClick={() => { setEditingSlot(null); setPopoverPos(null); setPopoverValidationError(false); }}
                style={{ float: 'left', width: 22, height: 22, borderRadius: '50%', background: '#f5f0e8', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', padding: 0, marginBottom: 4 }}
              >✕</button>

              {/* Employee */}
              <label style={popoverLabelStyle}>עובדת:</label>
              {isLockedSlot ? (
                <div style={{ fontWeight: 700, fontSize: 13, color: isMiyaFixed ? '#1a4a2e' : '#94a3b8', marginBottom: 8 }}>
                  {isMiyaFixed ? 'מיה (קבועה)' : 'ריק (סלוט מיה)'}
                </div>
              ) : (
                <>
                  <select
                    value={slot.employeeId ?? ''}
                    onChange={e => {
                      const newId = e.target.value !== '' ? Number(e.target.value) : null;
                      updateSlotField(day, shift, slotIdx, { employeeId: newId });
                      setPopoverValidationError(false);
                    }}
                    style={{ ...popoverSelectStyle, marginBottom: 4, ...(isDuplicate || (popoverValidationError && slot.employeeId === null) ? { borderColor: '#ef4444' } : {}) }}
                  >
                    <option value="">— ריק —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  {isDuplicate && (
                    <div style={{ fontSize: 10, color: '#dc2626', marginBottom: 4, fontWeight: 600 }}>
                      ⚠️ {duplicateName} כבר משובצת במשמרת זו
                    </div>
                  )}
                  {popoverValidationError && !isDuplicate && slot.employeeId === null && (
                    <div style={{ fontSize: 10, color: '#dc2626', marginBottom: 4 }}>שדה חובה</div>
                  )}
                </>
              )}

              {/* Times */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <label style={popoverLabelStyle}>התחלה:</label>
                  <input
                    type="time"
                    value={slot.arrivalTime}
                    onChange={e => { updateSlotField(day, shift, slotIdx, { arrivalTime: e.target.value }); setPopoverValidationError(false); }}
                    disabled={shift === 'בוקר' && !isMiyaFixed}
                    style={{ ...popoverInputStyle, ...(shift === 'בוקר' && !isMiyaFixed ? { background: '#f5f5f5', color: '#94a3b8' } : {}), ...(popoverValidationError && !slot.arrivalTime && !(shift === 'בוקר' && !isMiyaFixed) ? { borderColor: '#ef4444' } : {}) }}
                  />
                  {popoverValidationError && !slot.arrivalTime && !(shift === 'בוקר' && !isMiyaFixed) && (
                    <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>שדה חובה</div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <label style={popoverLabelStyle}>סיום:</label>
                  <input
                    type="time"
                    value={slot.departureTime}
                    onChange={e => { updateSlotField(day, shift, slotIdx, { departureTime: e.target.value }); setPopoverValidationError(false); }}
                    style={{ ...popoverInputStyle, ...(popoverValidationError && !slot.departureTime ? { borderColor: '#ef4444' } : {}) }}
                  />
                  {popoverValidationError && !slot.departureTime && (
                    <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>שדה חובה</div>
                  )}
                </div>
              </div>

              {/* Station */}
              <label style={popoverLabelStyle}>עמדה:</label>
              <select
                value={slot.station}
                onChange={e => { updateSlotField(day, shift, slotIdx, { station: e.target.value }); setPopoverValidationError(false); }}
                style={{ ...popoverSelectStyle, marginBottom: 4, ...(popoverValidationError && !slot.station ? { borderColor: '#ef4444' } : {}) }}
              >
                <option value="">— בחר —</option>
                {stations.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {popoverValidationError && !slot.station && !isLockedSlot && (
                <div style={{ fontSize: 10, color: '#dc2626', marginBottom: 4 }}>שדה חובה</div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {!isLockedSlot && (
                  <button
                    onClick={() => {
                      if (isIncomplete || isDuplicate) {
                        setPopoverValidationError(true);
                        return;
                      }
                      const addedName = employees.find(e => e.id === slot.employeeId)?.name || '';
                      setEditingSlot(null); setPopoverPos(null); setPopoverValidationError(false);
                      if (editingSlot?.isNew) {
                        setSlotAddToast(addedName);
                        setTimeout(() => setSlotAddToast(null), 2000);
                      }
                    }}
                    style={{ flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer' }}
                  >
                    {editingSlot?.isNew ? 'הוסף' : 'עדכן'}
                  </button>
                )}
                {isLockedSlot && (
                  <button
                    onClick={() => { setEditingSlot(null); setPopoverPos(null); setPopoverValidationError(false); }}
                    style={{ flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer' }}
                  >
                    סגור
                  </button>
                )}
                {isLockedSlot && isMiyaFixed && (
                  <button
                    onClick={() => { updateSlotField(day, shift, slotIdx, { employeeId: null, station: '' }); setEditingSlot(null); setPopoverPos(null); }}
                    style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#fff7ed', color: '#c17f3b', border: '1px solid #fed7aa', borderRadius: 5, cursor: 'pointer' }}
                  >
                    נקה משמרת
                  </button>
                )}
                {isLockedSlot && !isMiyaFixed && (
                  <button
                    onClick={() => { updateSlotField(day, shift, slotIdx, { employeeId: MIYA_ID, station: 'קופה 1' }); setEditingSlot(null); setPopoverPos(null); }}
                    style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#f0fdf4', color: '#16a34a', border: '1px solid #a7d5b8', borderRadius: 5, cursor: 'pointer' }}
                  >
                    שבץ מיה חזרה
                  </button>
                )}
              </div>
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
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1a4a2e' }}>
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

      {/* Preferences status indicator */}
      {(() => {
        const nonMiya = employees.filter(e => e.id !== MIYA_ID);
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => autoSchedule()}
          style={{ padding: '8px 16px', background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
        >
          שבץ אוטומטית
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
              {visibleDays.map((d, i) => (
                <th
                  key={d.day}
                  style={{ padding: '8px 6px', background: '#faf7f2', textAlign: 'center', borderBottom: '2px solid #e8e0d4', ...(i === visibleDays.length - 1 ? { borderTopLeftRadius: 8 } : {}) }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a4a2e' }}>{d.day}</div>
                  <div style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8' }}>{d.dateStr}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['בוקר', 'ערב'] as const).map(shift => {
              const shiftColor = shift === 'בוקר' ? '#4a7c59' : '#c17f3b';
              return (
                <tr key={shift}>
                  <td style={{ padding: '8px 6px', fontWeight: 700, background: '#1a4a2e', color: 'white', verticalAlign: 'top', borderBottom: '1px solid #e8e0d4', borderTop: `3px solid ${shiftColor}`, fontSize: 12 }}>
                    {shift}
                  </td>
                  {visibleDays.map(d => {
                    if (!d.shifts.includes(shift)) {
                      return (
                        <td key={d.day} style={{ padding: 6, textAlign: 'center', color: '#94a3b8', fontSize: 11, background: '#faf7f2', borderBottom: '1px solid #e8e0d4', borderTop: `3px solid ${shiftColor}` }}>אין ערב בשישי</td>
                      );
                    }

                    const cellKey = `${d.day}_${shift}`;
                    const slots = getOrInitializeSlots(d.day, shift);
                    const hasVolt = d.day === 'שישי' || !!voltFlags[cellKey];
                    const stations = getStations(d.day, hasVolt);

                    // Dynamic cell coloring — computed from slots (already derived from schedule state)
                    const requiredCount = (SLOT_DEFAULTS[d.day]?.[shift] || []).length;
                    const filledRegular = slots.filter(s => !s.locked && s.employeeId !== null && s.station !== 'התלמדות').length;
                    const hasAnyAssignment = slots.some(s => !s.locked && s.employeeId !== null);
                    let shiftBg: string;
                    let borderRight: string | undefined;
                    if (!hasAnyAssignment) {
                      // Default — no assignments yet
                      shiftBg = shift === 'בוקר' ? '#e8f4ea' : '#fef3e8';
                    } else if (filledRegular >= requiredCount) {
                      // Green — fully staffed
                      shiftBg = '#f0fdf4';
                      borderRight = '4px solid #16a34a';
                    } else {
                      // Red — under-staffed
                      shiftBg = '#fef2f2';
                      borderRight = '4px solid #ef4444';
                    }

                    return (
                      <td
                        key={d.day}
                        style={{ padding: 6, background: shiftBg, verticalAlign: 'top', borderBottom: '1px solid #e8e0d4', borderTop: `3px solid ${shiftColor}`, overflow: 'hidden', ...(borderRight ? { borderRight } : {}) }}
                      >
                        {/* Volt toggle — not for שישי */}
                        {d.day !== 'שישי' && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginBottom: 5, color: '#64748b', cursor: 'pointer', ...(isMobile ? { width: '100%', padding: '4px 0' } : {}) }}>
                            <input
                              type="checkbox"
                              checked={!!voltFlags[cellKey]}
                              onChange={() => toggleVolt(cellKey)}
                              style={{ width: 14, height: 14, accentColor: '#4a7c59' }}
                            />
                            יש וולט?
                          </label>
                        )}

                        {/* Slot rows */}
                        {slots.map((slot, idx) =>
                          renderSlotRow(d.day, shift, slot, idx, stations)
                        )}

                        {/* Add slot button */}
                        <button
                          onClick={(e) => {
                            addSlot(d.day, shift);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const popW = isMobile ? 260 : 220;
                            let top = rect.bottom + 4;
                            let left = rect.right - popW;
                            if (top + 280 > window.innerHeight) top = rect.top - 280 - 4;
                            if (left < 8) left = 8;
                            if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
                            setPopoverPos({ top, left });
                            setEditingSlot({ day: d.day, shift, slotIdx: slots.length, isNew: true });
                          }}
                          style={{
                            fontSize: isMobile ? 12 : 10, color: '#4a7c59', background: 'transparent',
                            border: '1px dashed #a7d5b8', borderRadius: 4,
                            cursor: 'pointer', padding: isMobile ? '6px 8px' : '3px 6px', marginTop: 5, width: '100%',
                          }}
                        >
                          + הוסף
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom actions */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => {
            navigator.clipboard.writeText(generateWhatsAppText()).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          העתק לווטסאפ
        </button>
        <button
          onClick={generatePDF}
          style={{ padding: '8px 16px', background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          הורד PDF
        </button>
        {copied && <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>הועתק!</span>}
      </div>

      {/* Auto-schedule result modal */}
      {autoResultModal.isOpen && (() => {
        // Compute summary from pending schedule
        let filledCount = 0, totalCount = 0;
        for (const { day, shifts } of WEEK_STRUCTURE) {
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
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxWidth: 500, textAlign: 'center' }}>
          לא ניתן לשבץ — לא הוזנו העדפות לשבוע זה. עבור ללשונית העדפות והזן העדפות תחילה.
        </div>
      )}

      {/* Slot add toast */}
      {slotAddToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          ✓ {slotAddToast} נוספה למשמרת
        </div>
      )}

      {/* Plan ahead toast */}
      {planAheadToast.show && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#1a4a2e', color: 'white', padding: '12px 28px', borderRadius: 8, zIndex: 9999, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          {`נוצרו ${planAheadToast.count} שבועות לתכנון`}
        </div>
      )}

      {/* Plan ahead modal */}
      {showPlanAheadModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 480, width: '100%', position: 'relative', direction: 'rtl' }}>
            <button
              onClick={() => setShowPlanAheadModal(false)}
              style={{ position: 'absolute', right: 12, top: 12, width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
            >
              ✕
            </button>

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

            {/* No preferences warning */}
            {planAheadNoPrefsWarning && (
              <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#92400e' }}>
                  לא נמצאו העדפות עובדות לטווח הנבחר
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => createPlanAheadWeeks(true)}
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
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPlanAheadModal(false)}
                style={{ padding: '8px 16px', border: '1px solid #e8e0d4', borderRadius: 6, cursor: 'pointer', background: '#f5f0e8', color: '#475569', fontWeight: 600 }}
              >
                ביטול
              </button>
              <button
                onClick={() => createPlanAheadWeeks()}
                style={{ padding: '8px 16px', background: '#1a4a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
              >
                צור שבועות
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

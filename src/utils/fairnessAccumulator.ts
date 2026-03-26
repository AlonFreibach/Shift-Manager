import type { Employee } from '../data/employees';

const STORAGE_KEY = 'fairness_scores_history';

export interface AccumulatedHistory {
  fairnessHistory: { date: string; type: 1 | 2 }[];
  flexibilityHistory: { weekStart: string; submitted: number; committed: number }[];
}

export type AccumulatedData = Record<number, AccumulatedHistory>;

export interface FlexibilityEntry {
  weekKey: string;
  submitted: number;
  weeklyShifts: number;
  weekScore: number;
}

export function loadAccumulatedData(): AccumulatedData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveAccumulatedData(data: AccumulatedData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetAccumulatedData(): void {
  localStorage.removeItem(STORAGE_KEY);
  // Also clear all per-employee flexibility keys
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('flexibility_history_')) {
      localStorage.removeItem(k);
      i--; // adjust index after removal
    }
  }
}

/**
 * Called when a schedule is saved. Adds fairness events for each assigned employee.
 * type 1 (3pts) = got a shift assigned this week.
 * One event per assigned shift.
 */
export function addFairnessEvents(
  schedule: Record<string, { employeeId: number | null }[]>,
  weekKey: string,
): void {
  const data = loadAccumulatedData();

  // Count shifts per employee in this schedule
  const shiftCounts: Record<number, number> = {};
  for (const slots of Object.values(schedule)) {
    for (const slot of slots) {
      if (slot.employeeId && slot.employeeId > 0) {
        shiftCounts[slot.employeeId] = (shiftCounts[slot.employeeId] || 0) + 1;
      }
    }
  }

  for (const [empIdStr, count] of Object.entries(shiftCounts)) {
    const empId = Number(empIdStr);
    if (!data[empId]) {
      data[empId] = { fairnessHistory: [], flexibilityHistory: [] };
    }
    // Remove old fairness events for this week (to avoid duplicates on re-save)
    data[empId].fairnessHistory = data[empId].fairnessHistory.filter(
      e => !e.date.startsWith(weekKey)
    );
    // Add one event per shift assigned
    for (let i = 0; i < count; i++) {
      data[empId].fairnessHistory.push({ date: `${weekKey}_${i}`, type: 1 });
    }
  }

  saveAccumulatedData(data);
}

/**
 * Load flexibility history for an employee from per-employee localStorage key.
 */
export function loadFlexibilityHistory(empId: number): FlexibilityEntry[] {
  try {
    const raw = localStorage.getItem(`flexibility_history_${empId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Called when preferences are saved. Updates flexibility history for the employee.
 * Stores up to 8 most recent entries in per-employee localStorage key.
 */
export function updateFlexibility(
  empId: number,
  weekKey: string,
  submittedShifts: number,
  weeklyShifts: number,
): void {
  let history = loadFlexibilityHistory(empId);

  // Remove existing entry for this week (replace, not duplicate)
  history = history.filter(e => e.weekKey !== weekKey);

  // Calculate weekScore
  const weekScore = weeklyShifts > 0
    ? (submittedShifts / weeklyShifts) * 100
    : 0;

  // Add new entry (even if submitted=0, to record that nothing was submitted)
  history.push({
    weekKey,
    submitted: submittedShifts,
    weeklyShifts,
    weekScore,
  });

  // Sort by weekKey descending and keep only 8 most recent
  history.sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  history = history.slice(0, 8);

  localStorage.setItem(`flexibility_history_${empId}`, JSON.stringify(history));
}

/**
 * Called when preferences are deleted. Removes flexibility entry for that employee+week.
 */
export function removeFlexibility(empId: number, weekKey: string): void {
  let history = loadFlexibilityHistory(empId);
  history = history.filter(e => e.weekKey !== weekKey);
  localStorage.setItem(`flexibility_history_${empId}`, JSON.stringify(history));
}

/**
 * Build a virtual Employee with accumulated fairness history merged in.
 */
export function withAccumulatedHistory(employee: Employee): Employee {
  const data = loadAccumulatedData();
  const empData = data[employee.id];
  if (!empData) return employee;
  return {
    ...employee,
    fairnessHistory: empData.fairnessHistory,
  };
}

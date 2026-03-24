import type { Employee } from '../data/employees';

const STORAGE_KEY = 'fairness_scores_history';

export interface AccumulatedHistory {
  fairnessHistory: { date: string; type: 1 | 2 }[];
  flexibilityHistory: { weekStart: string; submitted: number; committed: number }[];
}

export type AccumulatedData = Record<number, AccumulatedHistory>;

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
 * Called when preferences are set/changed. Updates flexibility history for the employee.
 * submitted = number of shift preferences submitted
 * committed = employee's shiftsPerWeek
 */
export function updateFlexibility(
  empId: number,
  weekKey: string,
  submittedShifts: number,
  committed: number,
): void {
  const data = loadAccumulatedData();
  if (!data[empId]) {
    data[empId] = { fairnessHistory: [], flexibilityHistory: [] };
  }
  // Replace existing entry for this week
  data[empId].flexibilityHistory = data[empId].flexibilityHistory.filter(
    e => e.weekStart !== weekKey
  );
  if (submittedShifts > 0) {
    data[empId].flexibilityHistory.push({
      weekStart: weekKey,
      submitted: submittedShifts,
      committed: Math.max(committed, 1),
    });
  }
  saveAccumulatedData(data);
}

/**
 * Called when preferences are deleted. Removes flexibility entry for that employee+week.
 */
export function removeFlexibility(empId: number, weekKey: string): void {
  const data = loadAccumulatedData();
  if (!data[empId]) return;
  data[empId].flexibilityHistory = data[empId].flexibilityHistory.filter(
    e => e.weekStart !== weekKey
  );
  saveAccumulatedData(data);
}

/**
 * Build a virtual Employee with accumulated history merged in, for score calculation.
 */
export function withAccumulatedHistory(employee: Employee): Employee {
  const data = loadAccumulatedData();
  const empData = data[employee.id];
  if (!empData) return employee;
  return {
    ...employee,
    fairnessHistory: empData.fairnessHistory,
    flexibilityHistory: empData.flexibilityHistory,
  };
}

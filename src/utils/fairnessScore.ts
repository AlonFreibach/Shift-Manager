import type { Employee } from '../data/employees';
import { loadFlexibilityHistory } from './fairnessAccumulator';

export function calculateFairnessScore(employee: Employee): number {
  const now = new Date();
  let score = 0;
  for (const event of employee.fairnessHistory) {
    const dateStr = event.date.includes('_') ? event.date.split('_')[0] : event.date;
    const eventDate = new Date(dateStr + 'T00:00:00');
    const ageWeeks = (now.getTime() - eventDate.getTime()) / (7 * 24 * 60 * 60 * 1000);
    let weight = 0.1;
    if (ageWeeks <= 4) weight = 1.0;
    else if (ageWeeks <= 12) weight = 0.75;
    else if (ageWeeks <= 26) weight = 0.5;
    else if (ageWeeks <= 52) weight = 0.25;
    const points = event.type === 1 ? 3 : 1;
    score += weight * points;
  }
  return score;
}

/**
 * Calculates flexibility score from per-employee localStorage data.
 * Returns null if no history exists.
 * Score = weighted average of weekScores (submitted/weeklyShifts × 100) with time decay.
 * Decay: week 1 = 1.00, week 2 = 0.90, ..., week 8 = 0.30
 */
export function calculateFlexibilityScore(employee: Employee): number | null {
  const history = loadFlexibilityHistory(employee.id);
  if (history.length === 0) return null;

  // Already sorted descending by weekKey from storage, take up to 8
  const recent = history.slice(0, 8);

  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < recent.length; i++) {
    const weight = 1.0 - i * 0.1;
    weightedSum += recent[i].weekScore * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}

export function calculateStabilityScore(employee: Employee): number {
  let score = 0;
  const now = new Date();
  if (!employee.availableToDate) {
    score += 2;
  } else {
    const toDate = new Date(employee.availableToDate);
    const months = (toDate.getTime() - now.getTime()) / (30 * 24 * 60 * 60 * 1000);
    if (months > 6) score += 1;
  }
  if (employee.availableFromDate) {
    const fromDate = new Date(employee.availableFromDate);
    const months = (now.getTime() - fromDate.getTime()) / (30 * 24 * 60 * 60 * 1000);
    if (months > 12) score += 2;
    else if (months > 6) score += 1;
  }
  return Math.min(score, 4);
}

function isEmployeeAvailableForShift(emp: Employee, day: string, shift: string, weekStart: Date): boolean {
  if (day === 'שישי' && emp.fridayAvailability === 'never') return false;
  if (emp.shiftType !== 'הכל') {
    if (emp.shiftType === 'בוקר' && shift !== 'בוקר') return false;
    if (emp.shiftType === 'ערב' && shift !== 'ערב') return false;
  }
  // Check date window
  if (emp.availableFromDate) {
    const fromDate = new Date(emp.availableFromDate);
    if (weekStart < fromDate) return false;
  }
  if (emp.availableToDate) {
    const toDate = new Date(emp.availableToDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    if (weekEnd > toDate) return false;
  }
  return true;
}

export function rankEmployeesForShift(employees: Employee[], day: string, shift: string, weekStart: Date): Employee[] {
  const filtered = employees.filter(emp => isEmployeeAvailableForShift(emp, day, shift, weekStart));
  return filtered.sort((a, b) => {
    const fairnessA = calculateFairnessScore(a);
    const fairnessB = calculateFairnessScore(b);
    if (fairnessA !== fairnessB) return fairnessA - fairnessB; // ascending
    const stabilityA = calculateStabilityScore(a);
    const stabilityB = calculateStabilityScore(b);
    if (stabilityA !== stabilityB) return stabilityB - stabilityA; // descending
    const flexibilityA = calculateFlexibilityScore(a) ?? 0;
    const flexibilityB = calculateFlexibilityScore(b) ?? 0;
    return flexibilityB - flexibilityA; // descending
  });
}
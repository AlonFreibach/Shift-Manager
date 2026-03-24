import type { Employee } from '../data/employees';

export function calculateFairnessScore(employee: Employee): number {
  const now = new Date();
  let score = 0;
  for (const event of employee.fairnessHistory) {
    const eventDate = new Date(event.date);
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

export function calculateFlexibilityScore(employee: Employee): number {
  const sortedHistory = employee.flexibilityHistory
    .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime())
    .slice(0, 8);
  let totalWeighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < sortedHistory.length; i++) {
    const decay = 1.0 - i * 0.1;
    const ratio = sortedHistory[i].submitted / sortedHistory[i].committed;
    totalWeighted += ratio * decay;
    totalWeight += decay;
  }
  if (totalWeight === 0) return 0;
  const average = totalWeighted / totalWeight;
  return Math.round(average * 100);
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
  if (day === 'שישי' && !emp.friday) return false;
  if (emp.shiftType !== 'הכל') {
    if (emp.shiftType === 'בוקר' && shift !== 'בוקר') return false;
    if (emp.shiftType === 'ערב' && shift !== 'ערב') return false;
    if (emp.shiftType === 'אמצע' && shift !== 'אמצע') return false;
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
    const flexibilityA = calculateFlexibilityScore(a);
    const flexibilityB = calculateFlexibilityScore(b);
    return flexibilityB - flexibilityA; // descending
  });
}
import type { Employee, AvailabilityForecast } from '../data/employees'

export const MIYA_NAME = 'מיה'
export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'] as const
export const WEEKS_AHEAD = 12

export type DayName = typeof DAYS[number]
export type ShiftType = 'בוקר' | 'ערב'

// Required slots per day×shift (without Miya for morning — Miya is automatic)
// These mirror SLOT_DEFAULTS in WeeklyBoard; total = 30 weekly slots
export const REQUIRED_PER_DAY: Record<DayName, Record<ShiftType, number>> = {
  'ראשון':  { 'בוקר': 2, 'ערב': 2 },
  'שני':    { 'בוקר': 2, 'ערב': 2 },
  'שלישי':  { 'בוקר': 2, 'ערב': 2 },
  'רביעי':  { 'בוקר': 2, 'ערב': 3 },
  'חמישי':  { 'בוקר': 4, 'ערב': 3 },
  'שישי':   { 'בוקר': 6, 'ערב': 0 },
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getSunday(d: Date): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() - copy.getDay())
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

// ═══ Employee availability helpers ═══

export function isActiveOnDay(emp: Employee, dateISO: string): boolean {
  if (emp.name === MIYA_NAME) return false
  if (emp.isTrainee) return false
  const startDate = emp.shiftsStart || emp.availableFromDate
  if (startDate && dateISO < startDate) return false
  if (emp.availableToDate && dateISO > emp.availableToDate) return false
  if (emp.expectedDeparture && dateISO > emp.expectedDeparture) return false
  return true
}

export function isInTraining(emp: Employee, dateISO: string): boolean {
  if (!emp.trainingStart) return false
  const shiftsDate = emp.shiftsStart || emp.availableFromDate || ''
  return dateISO >= emp.trainingStart && (!shiftsDate || dateISO < shiftsDate)
}

export function isOnVacation(emp: Employee, dateISO: string): boolean {
  return (emp.vacationPeriods || []).some(v => v.from <= dateISO && v.to >= dateISO)
}

export function getForecast(emp: Employee, dateISO: string): AvailabilityForecast | undefined {
  return (emp.availabilityForecasts || []).find(f => f.period_from <= dateISO && f.period_to >= dateISO)
}

export function expectedShiftsThisWeek(emp: Employee, weekStartISO: string, weekEndISO: string): number {
  if (!isActiveOnDay(emp, weekEndISO)) return 0
  if (isInTraining(emp, weekStartISO)) return 0
  if (isOnVacation(emp, weekStartISO) && isOnVacation(emp, weekEndISO)) return 0

  const override = emp.forecastOverrides?.[weekStartISO]
  if (override) return override.shifts

  const fc = getForecast(emp, weekStartISO) || getForecast(emp, weekEndISO)
  if (fc) return fc.expected_shifts

  return emp.shiftsPerWeek
}

export function isAvailableForShift(emp: Employee, shift: ShiftType): boolean {
  if (shift === 'בוקר') return emp.shiftType === 'הכל' || emp.shiftType === 'בוקר'
  return emp.shiftType === 'הכל' || emp.shiftType === 'ערב'
}

export function fridayAvailable(emp: Employee, weekStartISO: string): boolean {
  const override = emp.forecastOverrides?.[weekStartISO]
  if (override) return override.friday
  const fc = getForecast(emp, weekStartISO)
  if (fc) return fc.friday_available
  return emp.fridayAvailability !== 'never'
}

// ═══ Gap calculation per day×shift ═══

export interface DayShiftGap {
  day: DayName
  shift: ShiftType
  required: number    // total required across 12 weeks
  covered: number     // total covered (approximate)
  gap: number         // max(0, required - covered)
}

export function calculateGaps(employees: Employee[]): DayShiftGap[] {
  const gaps: DayShiftGap[] = []
  const sunday = getSunday(new Date())

  for (const day of DAYS) {
    const dayIdx = DAYS.indexOf(day)
    for (const shift of ['בוקר', 'ערב'] as ShiftType[]) {
      const req = REQUIRED_PER_DAY[day][shift]
      if (req === 0) continue

      let totalRequired = 0
      let totalCovered = 0

      for (let w = 0; w < WEEKS_AHEAD; w++) {
        const weekStart = addDays(sunday, w * 7)
        const weekStartISO = toISO(weekStart)
        const weekEndISO = toISO(addDays(weekStart, 5))
        const thisDayISO = toISO(addDays(weekStart, dayIdx))

        totalRequired += req

        for (const emp of employees) {
          if (emp.name === MIYA_NAME) continue
          if (!isAvailableForShift(emp, shift)) continue
          if (!isActiveOnDay(emp, thisDayISO)) continue
          if (isInTraining(emp, thisDayISO)) continue
          if (isOnVacation(emp, thisDayISO)) continue

          const empExpected = expectedShiftsThisWeek(emp, weekStartISO, weekEndISO)
          if (empExpected === 0) continue

          if (day === 'שישי' && !fridayAvailable(emp, weekStartISO)) continue

          const availableDays = DAYS.filter(d => {
            if (d === 'שישי') return fridayAvailable(emp, weekStartISO)
            return true
          }).length
          totalCovered += empExpected / (availableDays * (emp.shiftType === 'הכל' ? 2 : 1))
        }
      }

      gaps.push({
        day, shift,
        required: totalRequired,
        covered: Math.round(totalCovered),
        gap: Math.max(0, totalRequired - Math.round(totalCovered)),
      })
    }
  }

  return gaps
}

// ═══ Simulated hire — add a virtual employee and recompute gaps ═══

export interface SimulatedHire {
  weeklyShifts: number                          // 1-6
  shiftType: 'הכל' | 'בוקר' | 'ערב'
  friday: 'always' | 'biweekly' | 'never'
  availableDays: Set<DayName>                   // days the new employee can work
}

/**
 * Simulate hiring a new employee. Allocates her weekly shifts to the
 * day×shift combinations with the biggest gaps (within her availability).
 * Returns updated gaps.
 */
export function simulateHire(baseGaps: DayShiftGap[], hire: SimulatedHire): DayShiftGap[] {
  const updated = baseGaps.map(g => ({ ...g }))

  // Build candidates: (dayShiftGap entry) that the new hire can cover
  const candidates = updated.filter(g => {
    if (!hire.availableDays.has(g.day)) return false
    if (hire.shiftType === 'בוקר' && g.shift !== 'בוקר') return false
    if (hire.shiftType === 'ערב' && g.shift !== 'ערב') return false
    if (g.day === 'שישי' && hire.friday === 'never') return false
    return g.gap > 0
  })

  // Total shifts the new hire contributes over 12 weeks
  // Friday behavior: always=12, biweekly=6, never=0
  const fridayMultiplier = hire.friday === 'always' ? 1 : hire.friday === 'biweekly' ? 0.5 : 0
  const totalContribution = hire.weeklyShifts * WEEKS_AHEAD

  // Allocation: repeatedly pick the largest gap, reduce by 1, until contribution exhausted
  let remaining = totalContribution

  while (remaining > 0 && candidates.some(c => c.gap > 0)) {
    // Sort by gap descending; prioritize Friday if it has gap (it's the hardest to cover)
    candidates.sort((a, b) => {
      // Boost Friday priority slightly (harder to cover)
      const aScore = a.gap + (a.day === 'שישי' ? 0.5 : 0)
      const bScore = b.gap + (b.day === 'שישי' ? 0.5 : 0)
      return bScore - aScore
    })

    const target = candidates[0]
    if (!target || target.gap <= 0) break

    // Friday shifts contribute less per "week" if biweekly
    const shiftCost = target.day === 'שישי' && hire.friday === 'biweekly' ? 2 : 1

    target.gap = Math.max(0, target.gap - 1)
    target.covered += 1
    remaining -= 1

    // For biweekly friday, friday gap "costs" 2 units of weekly contribution
    if (shiftCost > 1 && remaining > 0) {
      remaining -= (shiftCost - 1)
    }
  }

  // Apply friday multiplier cap (if never friday, don't touch Friday gaps)
  if (hire.friday === 'never') {
    // Already filtered out Friday from candidates above
  } else if (hire.friday === 'biweekly') {
    // Already handled via shiftCost above
    void fridayMultiplier
  }

  return updated
}

/**
 * Summary metrics comparing before/after simulation.
 */
export function summarizeGapImpact(before: DayShiftGap[], after: DayShiftGap[]) {
  const totalBefore = before.reduce((s, g) => s + g.gap, 0)
  const totalAfter = after.reduce((s, g) => s + g.gap, 0)
  const totalFridayBefore = before.filter(g => g.day === 'שישי').reduce((s, g) => s + g.gap, 0)
  const totalFridayAfter = after.filter(g => g.day === 'שישי').reduce((s, g) => s + g.gap, 0)
  const gapClosed = totalBefore - totalAfter
  const gapClosedPct = totalBefore > 0 ? Math.round((gapClosed / totalBefore) * 100) : 0

  // Top "remaining" gaps after simulation (critical gaps still open)
  const topRemaining = [...after]
    .filter(g => g.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)

  return {
    totalBefore, totalAfter,
    totalFridayBefore, totalFridayAfter,
    gapClosed, gapClosedPct,
    topRemaining,
  }
}

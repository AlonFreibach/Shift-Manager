import type { Employee } from '../../src/data/employees'

/**
 * Build a test Employee with sensible defaults. Override only what the test
 * cares about. Not a *.test.ts file, so Vitest does not run it directly.
 */
export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'e1',
    name: 'עובדת בדיקה',
    seniority: 12,
    shiftsPerWeek: 4,
    fridayAvailability: 'always',
    shiftType: 'הכל',
    isTrainee: false,
    availableFrom: '',
    availableTo: '',
    availableFromDate: '',
    availableToDate: '',
    fairnessHistory: [],
    flexibilityHistory: [],
    fixedShifts: [],
    vacationPeriods: [],
    availabilityForecasts: [],
    forecastOverrides: {},
    ...overrides,
  }
}

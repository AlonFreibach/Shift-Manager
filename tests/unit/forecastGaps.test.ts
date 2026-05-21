import { describe, it, expect } from 'vitest'
import {
  toISO, getSunday, addDays,
  isActiveOnDay, isInTraining, isOnVacation,
  expectedShiftsThisWeek, isAvailableForShift, fridayAvailable,
  calculateGaps, simulateHire, summarizeGapImpact,
  type DayShiftGap,
} from '../../src/utils/forecastGaps'
import { makeEmployee } from './_employeeFactory'

describe('forecastGaps — date utils', () => {

  it('toISO מפרמט תאריך מקומי', () => {
    expect(toISO(new Date(2026, 4, 7))).toBe('2026-05-07')
  })

  it('getSunday מחזיר את יום ראשון של השבוע', () => {
    // 20.5.2026 הוא יום רביעי → ראשון = 17.5
    expect(toISO(getSunday(new Date(2026, 4, 20)))).toBe('2026-05-17')
  })

  it('getSunday על יום ראשון מחזיר אותו יום', () => {
    expect(toISO(getSunday(new Date(2026, 4, 17)))).toBe('2026-05-17')
  })

  it('addDays מוסיף ימים', () => {
    expect(toISO(addDays(new Date(2026, 4, 17), 5))).toBe('2026-05-22')
  })
})

describe('forecastGaps — זמינות עובדת', () => {

  it('מיה לא נחשבת פעילה (מטופלת בנפרד)', () => {
    expect(isActiveOnDay(makeEmployee({ name: 'מיה' }), '2026-05-20')).toBe(false)
  })

  it('עובדת רגילה פעילה', () => {
    expect(isActiveOnDay(makeEmployee(), '2026-05-20')).toBe(true)
  })

  it('עובדת לפני תאריך התחלה לא פעילה', () => {
    expect(isActiveOnDay(makeEmployee({ availableFromDate: '2026-06-01' }), '2026-05-20')).toBe(false)
  })

  it('עובדת אחרי תאריך סיום לא פעילה', () => {
    expect(isActiveOnDay(makeEmployee({ availableToDate: '2026-05-01' }), '2026-05-20')).toBe(false)
  })

  it('עובדת אחרי עזיבה צפויה לא פעילה', () => {
    expect(isActiveOnDay(makeEmployee({ expectedDeparture: '2026-05-10' }), '2026-05-20')).toBe(false)
  })

  it('isInTraining — בתוך תקופת חפיפה', () => {
    const emp = makeEmployee({ trainingStart: '2026-05-01', shiftsStart: '2026-06-01' })
    expect(isInTraining(emp, '2026-05-15')).toBe(true)
    expect(isInTraining(emp, '2026-06-15')).toBe(false)
  })

  it('isOnVacation', () => {
    const emp = makeEmployee({ vacationPeriods: [{ from: '2026-05-18', to: '2026-05-25' }] })
    expect(isOnVacation(emp, '2026-05-20')).toBe(true)
    expect(isOnVacation(emp, '2026-05-26')).toBe(false)
  })
})

describe('forecastGaps — expectedShiftsThisWeek', () => {

  it('ברירת מחדל = shiftsPerWeek', () => {
    expect(expectedShiftsThisWeek(makeEmployee({ shiftsPerWeek: 5 }), '2026-05-17', '2026-05-22')).toBe(5)
  })

  it('דריסה ידנית גוברת על ברירת המחדל', () => {
    const emp = makeEmployee({
      shiftsPerWeek: 5,
      forecastOverrides: { '2026-05-17': { shifts: 2, friday: false } },
    })
    expect(expectedShiftsThisWeek(emp, '2026-05-17', '2026-05-22')).toBe(2)
  })

  it('בחופשה מלאה = 0', () => {
    const emp = makeEmployee({ vacationPeriods: [{ from: '2026-05-10', to: '2026-05-30' }] })
    expect(expectedShiftsThisWeek(emp, '2026-05-17', '2026-05-22')).toBe(0)
  })

  it('תחזית זמינות גוברת על ברירת המחדל', () => {
    const emp = makeEmployee({
      shiftsPerWeek: 5,
      availabilityForecasts: [{
        period_from: '2026-05-01', period_to: '2026-05-31',
        expected_shifts: 1, friday_available: false, reason: 'מבחנים',
      }],
    })
    expect(expectedShiftsThisWeek(emp, '2026-05-17', '2026-05-22')).toBe(1)
  })
})

describe('forecastGaps — isAvailableForShift', () => {

  it('עובדת בוקר בלבד', () => {
    const emp = makeEmployee({ shiftType: 'בוקר' })
    expect(isAvailableForShift(emp, 'בוקר')).toBe(true)
    expect(isAvailableForShift(emp, 'ערב')).toBe(false)
  })

  it('עובדת ערב בלבד', () => {
    const emp = makeEmployee({ shiftType: 'ערב' })
    expect(isAvailableForShift(emp, 'בוקר')).toBe(false)
    expect(isAvailableForShift(emp, 'ערב')).toBe(true)
  })

  it('עובדת הכל זמינה לשתי המשמרות', () => {
    const emp = makeEmployee({ shiftType: 'הכל' })
    expect(isAvailableForShift(emp, 'בוקר')).toBe(true)
    expect(isAvailableForShift(emp, 'ערב')).toBe(true)
  })
})

describe('forecastGaps — fridayAvailable', () => {

  it('fridayAvailability=never → false', () => {
    expect(fridayAvailable(makeEmployee({ fridayAvailability: 'never' }), '2026-05-17')).toBe(false)
  })

  it('fridayAvailability=always → true', () => {
    expect(fridayAvailable(makeEmployee({ fridayAvailability: 'always' }), '2026-05-17')).toBe(true)
  })

  it('דריסה ידנית גוברת', () => {
    const emp = makeEmployee({
      fridayAvailability: 'always',
      forecastOverrides: { '2026-05-17': { shifts: 3, friday: false } },
    })
    expect(fridayAvailable(emp, '2026-05-17')).toBe(false)
  })
})

describe('forecastGaps — calculateGaps', () => {

  it('מחזיר 11 רשומות (6 ימים × 2 משמרות פחות שישי-ערב)', () => {
    const gaps = calculateGaps([makeEmployee()])
    expect(gaps.length).toBe(11)
    for (const g of gaps) {
      expect(g.required).toBeGreaterThan(0)
      expect(g.gap).toBe(Math.max(0, g.required - g.covered))
    }
  })

  it('ללא עובדות — הפער שווה לתקן המלא', () => {
    const gaps = calculateGaps([])
    for (const g of gaps) expect(g.gap).toBe(g.required)
  })
})

describe('forecastGaps — simulateHire & summarizeGapImpact', () => {

  const baseGaps: DayShiftGap[] = [
    { day: 'ראשון', shift: 'בוקר', required: 24, covered: 20, gap: 4 },
    { day: 'חמישי', shift: 'ערב', required: 36, covered: 30, gap: 6 },
    { day: 'שישי', shift: 'בוקר', required: 72, covered: 60, gap: 12 },
  ]

  it('גיוס עובדת מצמצם את סך הפערים', () => {
    const after = simulateHire(baseGaps, {
      weeklyShifts: 4, shiftType: 'הכל', friday: 'always',
      availableDays: new Set(['ראשון', 'חמישי', 'שישי']),
    })
    const totalBefore = baseGaps.reduce((s, g) => s + g.gap, 0)
    const totalAfter = after.reduce((s, g) => s + g.gap, 0)
    expect(totalAfter).toBeLessThan(totalBefore)
  })

  it('simulateHire לא משנה את מערך הקלט (immutable)', () => {
    simulateHire(baseGaps, {
      weeklyShifts: 4, shiftType: 'הכל', friday: 'always',
      availableDays: new Set(['ראשון']),
    })
    expect(baseGaps[0].gap).toBe(4)
  })

  it('עובדת ללא שישי לא סוגרת את פער שישי', () => {
    const after = simulateHire(baseGaps, {
      weeklyShifts: 6, shiftType: 'הכל', friday: 'never',
      availableDays: new Set(['ראשון', 'חמישי', 'שישי']),
    })
    expect(after.find(g => g.day === 'שישי')!.gap).toBe(12)
  })

  it('summarizeGapImpact מחשב 100% כשכל הפערים נסגרו', () => {
    const after = baseGaps.map(g => ({ ...g, gap: 0 }))
    const summary = summarizeGapImpact(baseGaps, after)
    expect(summary.gapClosedPct).toBe(100)
    expect(summary.totalAfter).toBe(0)
  })
})

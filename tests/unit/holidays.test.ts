import { describe, it, expect } from 'vitest'
import { ISRAELI_HOLIDAYS } from '../../src/data/holidays'

const getHolidaysInWeek = (weekStart: Date, weekEnd: Date) => {
  return ISRAELI_HOLIDAYS.filter(h => {
    const hDate = new Date(h.date)
    return hDate >= weekStart && hDate <= weekEnd
  })
}

describe('חגים ישראליים', () => {

  it('רשימת חגים לא ריקה', () => {
    expect(ISRAELI_HOLIDAYS.length).toBeGreaterThan(10)
  })

  it('פסח נמצא ברשימה', () => {
    const pesach = ISRAELI_HOLIDAYS.find(h => h.name.includes('פסח'))
    expect(pesach).toBeDefined()
  })

  it('שבוע פסח מזוהה נכון', () => {
    const weekStart = new Date('2026-03-29')
    const weekEnd = new Date('2026-04-04')
    const holidays = getHolidaysInWeek(weekStart, weekEnd)
    expect(holidays.length).toBeGreaterThan(0)
  })

  it('שבוע ללא חגים מחזיר מערך ריק', () => {
    const weekStart = new Date('2026-05-17')
    const weekEnd = new Date('2026-05-23')
    const holidays = getHolidaysInWeek(weekStart, weekEnd)
    expect(holidays.length).toBe(0)
  })

})

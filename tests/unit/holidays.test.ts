import { describe, it, expect } from 'vitest'
import { ISRAELI_HOLIDAYS, getHolidayInfo, getDateWorkType } from '../../src/data/holidays'

const getHolidaysInWeek = (weekStart: Date, weekEnd: Date) => {
  return ISRAELI_HOLIDAYS.filter(h => {
    const hDate = new Date(h.date)
    return hDate >= weekStart && hDate <= weekEnd
  })
}

describe('חגים ישראליים — תקינות הרשימה', () => {

  it('רשימת חגים לא ריקה', () => {
    expect(ISRAELI_HOLIDAYS.length).toBeGreaterThan(10)
  })

  it('כל התאריכים בפורמט ISO תקין', () => {
    for (const h of ISRAELI_HOLIDAYS) {
      expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(new Date(h.date).getTime())).toBe(false)
    }
  })

  it('אין תאריכים כפולים', () => {
    const dates = ISRAELI_HOLIDAYS.map(h => h.date)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('הרשימה ממוינת כרונולוגית', () => {
    for (let i = 1; i < ISRAELI_HOLIDAYS.length; i++) {
      expect(ISRAELI_HOLIDAYS[i].date >= ISRAELI_HOLIDAYS[i - 1].date).toBe(true)
    }
  })

  it('לכל חג סוג תקין', () => {
    for (const h of ISRAELI_HOLIDAYS) {
      expect(['holiday', 'holiday_eve', 'memorial']).toContain(h.type)
    }
  })
})

describe('חגים ישראליים — תאריכים מתוקנים (אומת מול Hebcal)', () => {

  it('ערב שבועות 2026 = 21.5', () => {
    expect(getHolidayInfo('2026-05-21')?.name).toBe('ערב שבועות')
  })

  it('שבועות 2026 = 22.5', () => {
    expect(getHolidayInfo('2026-05-22')?.name).toBe('שבועות')
  })

  it('יום השואה 2026 = 14.4', () => {
    expect(getHolidayInfo('2026-04-14')?.name).toBe('יום השואה')
  })

  it('יום הזיכרון 2026 = 21.4', () => {
    expect(getHolidayInfo('2026-04-21')?.name).toContain('יום הזיכרון')
  })

  it('יום העצמאות 2026 = 22.4', () => {
    expect(getHolidayInfo('2026-04-22')?.name).toBe('יום העצמאות')
  })

  it('ראש השנה 2027 = 2.10 (תוקן מחודש שגוי)', () => {
    expect(getHolidayInfo('2027-10-02')?.name).toContain('ראש השנה')
  })

  it('פסח א׳ 2026 = 2.4', () => {
    expect(getHolidayInfo('2026-04-02')?.name).toContain('פסח')
  })
})

describe('חגים ישראליים — חגים בשבוע', () => {

  it('שבוע פסח מזוהה נכון', () => {
    const holidays = getHolidaysInWeek(new Date('2026-03-29'), new Date('2026-04-04'))
    expect(holidays.length).toBeGreaterThan(0)
  })

  it('שבוע ללא חגים מחזיר מערך ריק', () => {
    // אמצע יוני 2026 — אחרי שבועות, הרבה לפני תשעה באב
    const holidays = getHolidaysInWeek(new Date('2026-06-07'), new Date('2026-06-13'))
    expect(holidays.length).toBe(0)
  })

  it('שבוע שבועות (17-23.5.2026) מכיל שני מועדים', () => {
    const holidays = getHolidaysInWeek(new Date('2026-05-17'), new Date('2026-05-23'))
    expect(holidays.length).toBe(2)
  })
})

describe('getDateWorkType', () => {

  it('שבת = shabbat', () => {
    expect(getDateWorkType('2026-05-23')).toBe('shabbat')
  })

  it('יום שישי = friday', () => {
    expect(getDateWorkType('2026-05-29')).toBe('friday')
  })

  it('חג ביום חול (פסח א׳) = shabbat', () => {
    expect(getDateWorkType('2026-04-02')).toBe('shabbat')
  })

  it('ערב חג ביום חול (ערב פסח) = friday', () => {
    expect(getDateWorkType('2026-04-01')).toBe('friday')
  })

  it('יום חול רגיל = regular', () => {
    expect(getDateWorkType('2026-06-10')).toBe('regular')
  })
})

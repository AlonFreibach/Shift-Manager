import { describe, it, expect } from 'vitest'
import { isWeekLocked, formatWeekStart, getSubmissionWindow } from '../../src/utils/submissionWindow'

describe('submissionWindow — isWeekLocked', () => {

  it('שבוע בעבר הרחוק נעול', () => {
    expect(isWeekLocked('2020-01-05')).toBe(true)
  })

  it('שבוע בעתיד הרחוק אינו נעול', () => {
    expect(isWeekLocked('2099-01-04')).toBe(false)
  })

  it('שבוע ברשימת הפתוחים אינו נעול גם אם בעבר', () => {
    expect(isWeekLocked('2020-01-05', ['2020-01-05'])).toBe(false)
  })

  it('שבוע שאינו ברשימת הפתוחים נשאר נעול', () => {
    expect(isWeekLocked('2020-01-05', ['2020-01-12'])).toBe(true)
  })
})

describe('submissionWindow — formatWeekStart', () => {

  it('מפרמט תאריך ל-YYYY-MM-DD', () => {
    expect(formatWeekStart(new Date('2026-05-17T00:00:00Z'))).toBe('2026-05-17')
  })
})

describe('submissionWindow — getSubmissionWindow', () => {

  it('activeWeekStart הוא שבוע אחרי lockedWeekStart', () => {
    const w = getSubmissionWindow()
    const diffDays = (w.activeWeekStart.getTime() - w.lockedWeekStart.getTime()) / (24 * 60 * 60 * 1000)
    expect(diffDays).toBe(7)
  })

  it('activeWeekStart נופל ביום ראשון', () => {
    expect(getSubmissionWindow().activeWeekStart.getDay()).toBe(0)
  })

  it('ה-deadline בשעה 20:00', () => {
    expect(getSubmissionWindow().deadline.getHours()).toBe(20)
  })
})

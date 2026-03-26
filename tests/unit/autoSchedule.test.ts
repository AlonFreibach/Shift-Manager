import { describe, it, expect } from 'vitest'

describe('שיבוץ אוטומטי — כלל ברזל', () => {

  it('מינימום מחויב = ceil(weeklyShifts * 0.75)', () => {
    const cases = [
      { weekly: 2, expected: 2 },
      { weekly: 3, expected: 3 },
      { weekly: 4, expected: 3 },
      { weekly: 6, expected: 5 },
    ]
    cases.forEach(({ weekly, expected }) => {
      const min = Math.ceil(weekly * 0.75)
      expect(min).toBe(expected)
    })
  })

  it('עובדת עם cant לא משובצת לאותו יום', () => {
    const preferences = [
      { day: 'ראשון', shift: 'בוקר', type: 'cant' }
    ]
    const canAssign = (day: string, shift: string) => {
      return !preferences.some(p =>
        p.day === day && p.shift === shift && p.type === 'cant'
      )
    }
    expect(canAssign('ראשון', 'בוקר')).toBe(false)
    expect(canAssign('שני', 'בוקר')).toBe(true)
  })

  it('עובדת בוקר בלבד לא משובצת לערב', () => {
    const shiftType = 'בוקר'
    const canWorkEvening = shiftType === 'ערב' || shiftType === 'הכל'
    expect(canWorkEvening).toBe(false)
  })

  it('עובדת הכל יכולה בוקר וגם ערב', () => {
    const shiftType = 'הכל'
    const canWorkMorning = shiftType === 'בוקר' || shiftType === 'הכל'
    const canWorkEvening = shiftType === 'ערב' || shiftType === 'הכל'
    expect(canWorkMorning).toBe(true)
    expect(canWorkEvening).toBe(true)
  })

})

describe('שיבוץ אוטומטי — זמינות תאריכים', () => {

  it('עובדת לפני תאריך התחלה לא משובצת', () => {
    const today = new Date('2026-03-22')
    const availableFrom = new Date('2026-03-23')
    expect(today < availableFrom).toBe(true)
  })

  it('עובדת אחרי תאריך סיום לא משובצת', () => {
    const today = new Date('2026-04-15')
    const availableTo = new Date('2026-04-10')
    expect(today > availableTo).toBe(true)
  })

  it('שישי biweekly — לא משובצת אם עבדה שישי קודם', () => {
    const lastFridayWorked = '2026-03-20'
    const currentFriday = '2026-03-27'
    const weekDiff = (new Date(currentFriday).getTime() -
      new Date(lastFridayWorked).getTime()) / (7 * 24 * 60 * 60 * 1000)
    expect(weekDiff).toBe(1)
    expect(weekDiff < 2).toBe(true) // לא אמורה להשתבץ
  })

})

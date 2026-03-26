import { describe, it, expect } from 'vitest'

const VALID_SHIFTS = ['בוקר', 'ערב', 'בוקר/ערב', 'שישי']

const validatePreferenceLine = (line: string, weekDates: string[]) => {
  const trimmed = line.trim()
  if (!trimmed) return { valid: true, skip: true }

  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return { valid: false, error: 'missing_shift' }

  const datePart = trimmed.substring(0, spaceIdx).trim()
  const shiftPart = trimmed.substring(spaceIdx + 1).trim()

  const dateRegex = /^(\d{1,2})\.(\d{1,2})$/
  if (!dateRegex.test(datePart)) return { valid: false, error: 'invalid_date' }

  const [day, month] = datePart.split('.').map(Number)
  if (day < 1 || day > 31 || month < 1 || month > 12)
    return { valid: false, error: 'invalid_date' }

  if (!weekDates.includes(`${day}.${month}`))
    return { valid: false, error: 'out_of_range' }

  if (!VALID_SHIFTS.includes(shiftPart))
    return { valid: false, error: 'invalid_shift' }

  return { valid: true }
}

describe('ולידציה הזנת העדפות', () => {

  const weekDates = ['22.3', '23.3', '24.3', '25.3', '26.3', '27.3']

  it('שורה תקינה עוברת ולידציה', () => {
    expect(validatePreferenceLine('22.3 בוקר', weekDates).valid).toBe(true)
    expect(validatePreferenceLine('27.3 שישי', weekDates).valid).toBe(true)
    expect(validatePreferenceLine('24.3 בוקר/ערב', weekDates).valid).toBe(true)
  })

  it('שורה ריקה מדולגת', () => {
    const result = validatePreferenceLine('', weekDates)
    expect(result.skip).toBe(true)
  })

  it('תאריך לא תקין נכשל', () => {
    expect(validatePreferenceLine('abc בוקר', weekDates).error).toBe('invalid_date')
    expect(validatePreferenceLine('32.3 בוקר', weekDates).error).toBe('invalid_date')
  })

  it('תאריך מחוץ לשבוע נכשל', () => {
    expect(validatePreferenceLine('1.1 בוקר', weekDates).error).toBe('out_of_range')
  })

  it('סוג משמרת לא תקין נכשל', () => {
    expect(validatePreferenceLine('22.3 צהריים', weekDates).error).toBe('invalid_shift')
    expect(validatePreferenceLine('22.3 אמצע', weekDates).error).toBe('invalid_shift')
  })

  it('חסר סוג משמרת נכשל', () => {
    expect(validatePreferenceLine('22.3', weekDates).error).toBe('missing_shift')
  })

})

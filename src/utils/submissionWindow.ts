/**
 * Submission Window Logic:
 * Every Sunday at 20:01:
 *   - Opens submission for the week starting Sunday+14
 *   - Closes submission for the week starting Sunday+7
 *
 * Example (Thursday 26.3):
 *   - Window opened 22.3 at 20:01
 *   - Window closes 29.3 at 20:00
 *   - Active week for submission: 5.4–11.4
 */

export function getSubmissionWindow() {
  const now = new Date()
  const day = now.getDay()

  // Find the Sunday that started the current submission window
  let lastSunday: Date
  if (day === 0 && now.getHours() < 20) {
    // Sunday before 20:00 — previous Sunday's window is still active
    lastSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
  } else {
    // Most recent Sunday (or today if Sunday ≥ 20:00)
    lastSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
  }

  // deadline = next Sunday at 20:00
  const deadline = new Date(lastSunday)
  deadline.setDate(deadline.getDate() + 7)
  deadline.setHours(20, 0, 0, 0)

  // activeWeekStart = 2 Sundays ahead from lastSunday
  const activeWeekStart = new Date(lastSunday)
  activeWeekStart.setDate(activeWeekStart.getDate() + 14)

  // lockedWeekStart = 1 Sunday ahead (just got locked)
  const lockedWeekStart = new Date(lastSunday)
  lockedWeekStart.setDate(lockedWeekStart.getDate() + 7)

  const isLocked = now > deadline

  return {
    activeWeekStart,      // השבוע הפעיל להגשה
    deadline,             // מתי נסגר (ראשון הקרוב 20:00)
    isLocked,             // האם עבר ה-deadline?
    lockedWeekStart,      // השבוע שנסגר זה עתה
  }
}

export function isWeekLocked(weekStartISO: string): boolean {
  const unlocked = getUnlockedWeeks()
  if (unlocked.includes(weekStartISO)) return false

  // Deadline for week W = W - 7 days at 20:00
  const targetDate = new Date(weekStartISO + 'T00:00:00')
  const deadline = new Date(targetDate)
  deadline.setDate(deadline.getDate() - 7)
  deadline.setHours(20, 0, 0, 0)

  return new Date() > deadline
}

export function formatWeekStart(date: Date): string {
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}

export function getUnlockedWeeks(): string[] {
  try {
    const raw = localStorage.getItem('unlocked_weeks')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function toggleWeekUnlock(weekStartISO: string, unlock: boolean): void {
  const current = getUnlockedWeeks()
  if (unlock) {
    if (!current.includes(weekStartISO)) {
      current.push(weekStartISO)
    }
  } else {
    const idx = current.indexOf(weekStartISO)
    if (idx >= 0) current.splice(idx, 1)
  }
  localStorage.setItem('unlocked_weeks', JSON.stringify(current))
}

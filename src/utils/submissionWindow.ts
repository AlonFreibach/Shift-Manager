export function getSubmissionWindow() {
  const now = new Date()
  const day = now.getDay() // 0=ראשון

  // מצא את ראשון הקרוב (תחילת שבוע ההגשה הבא)
  const daysUntilSunday = day === 0 ? 7 : 7 - day
  const nextSunday = new Date(now)
  nextSunday.setDate(now.getDate() + daysUntilSunday)
  nextSunday.setHours(0, 0, 0, 0)

  // מצא את ראשון הנוכחי (תחילת חלון ההגשה)
  const currentSunday = new Date(nextSunday)
  currentSunday.setDate(currentSunday.getDate() - 7)

  // האם החלון פתוח?
  const deadline = new Date(currentSunday)
  deadline.setHours(20, 0, 0, 0)

  const targetWeekISO = formatWeekStart(nextSunday)
  const unlocked = getUnlockedWeeks()
  const isManuallyUnlocked = unlocked.includes(targetWeekISO)

  const isLocked = !isManuallyUnlocked && now > deadline

  return {
    targetWeekStart: nextSunday,      // השבוע שאליו מגישים
    deadlineDate: deadline,            // מתי נסגר (ראשון 20:00)
    isLocked,                          // האם נעול?
    canSubmit: !isLocked,
  }
}

export function isWeekLocked(weekStartISO: string): boolean {
  const unlocked = getUnlockedWeeks()
  if (unlocked.includes(weekStartISO)) return false

  // Deadline = שבוע לפני ראשון היעד בשעה 20:00
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

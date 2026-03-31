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

import { supabase } from '../lib/supabaseClient'

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

/**
 * Check if a week is locked, given a pre-fetched list of unlocked weeks.
 * Use fetchUnlockedWeeks() to get the list from Supabase first.
 */
export function isWeekLocked(weekStartISO: string, unlockedWeeks: string[] = []): boolean {
  if (unlockedWeeks.includes(weekStartISO)) return false

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

/**
 * Fetch unlocked weeks from Supabase (single source of truth).
 */
export async function fetchUnlockedWeeks(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('unlocked_weeks')
      .select('week_start')

    if (error) {
      console.error('Failed to fetch unlocked weeks:', error.message)
      // Fallback to localStorage for backwards compatibility
      return getUnlockedWeeksLocal()
    }

    return (data || []).map(row => row.week_start)
  } catch {
    return getUnlockedWeeksLocal()
  }
}

/**
 * Toggle week unlock status in Supabase.
 */
export async function toggleWeekUnlock(weekStartISO: string, unlock: boolean): Promise<void> {
  if (unlock) {
    // Insert (ignore duplicate)
    const { error } = await supabase
      .from('unlocked_weeks')
      .upsert({ week_start: weekStartISO }, { onConflict: 'week_start' })

    if (error) {
      console.error('Failed to unlock week:', error.message)
      // Fallback to localStorage
      toggleWeekUnlockLocal(weekStartISO, true)
    }
  } else {
    const { error } = await supabase
      .from('unlocked_weeks')
      .delete()
      .eq('week_start', weekStartISO)

    if (error) {
      console.error('Failed to lock week:', error.message)
      toggleWeekUnlockLocal(weekStartISO, false)
    }
  }
}

// ── localStorage fallbacks (legacy, used only if Supabase fails) ──

function getUnlockedWeeksLocal(): string[] {
  try {
    const raw = localStorage.getItem('unlocked_weeks')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function toggleWeekUnlockLocal(weekStartISO: string, unlock: boolean): void {
  const current = getUnlockedWeeksLocal()
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

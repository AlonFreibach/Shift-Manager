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

// Marker title used in special_shifts table to store unlock flags
const UNLOCK_MARKER = '__WEEK_UNLOCKED__'
export { UNLOCK_MARKER }

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
 * Fetch unlocked weeks from Supabase via special_shifts table.
 * Uses the existing special_shifts table (which already has proper RLS access
 * for both admin and employee sessions) to store unlock markers.
 */
export async function fetchUnlockedWeeks(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('special_shifts')
      .select('date')
      .eq('title', UNLOCK_MARKER)

    if (error) {
      console.error('Failed to fetch unlocked weeks:', error.message)
      return []
    }

    return (data || []).map(row => row.date)
  } catch {
    return []
  }
}

/**
 * Toggle week unlock status in Supabase via special_shifts table.
 */
export async function toggleWeekUnlock(weekStartISO: string, unlock: boolean): Promise<boolean> {
  if (unlock) {
    // Check if already unlocked
    const { data: existing } = await supabase
      .from('special_shifts')
      .select('id')
      .eq('date', weekStartISO)
      .eq('title', UNLOCK_MARKER)
      .maybeSingle()

    if (existing) return true // Already unlocked

    const { error } = await supabase
      .from('special_shifts')
      .insert({
        date: weekStartISO,
        start_time: '00:00',
        end_time: '00:00',
        title: UNLOCK_MARKER,
      })

    if (error) {
      console.error('Failed to unlock week:', error.message)
      return false
    }
    return true
  } else {
    // Re-lock: delete the unlock marker
    const { error } = await supabase
      .from('special_shifts')
      .delete()
      .eq('date', weekStartISO)
      .eq('title', UNLOCK_MARKER)

    if (error) {
      console.error('Failed to lock week:', error.message)
      return false
    }
    return true
  }
}

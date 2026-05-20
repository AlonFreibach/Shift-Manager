/**
 * Schedule storage — Supabase + localStorage cache.
 *
 * The weekly schedule (assignments) used to live only in localStorage on each
 * device. Now it's mirrored in the `schedules` table in Supabase so Maya can
 * open the board from any device and see the same data.
 *
 * Strategy:
 * - localStorage stays as a fast cache (instant render).
 * - On week load: fetch from Supabase; if empty, migrate from localStorage.
 * - On every save: write to localStorage immediately, then upsert to Supabase.
 * - Realtime subscription pushes changes from other devices into local state.
 */

import { supabase } from './supabaseClient'

export type Slot = {
  employeeId: string | null
  arrivalTime: string
  departureTime: string
  station: string
  locked?: boolean
  isFixed?: boolean
  voltResponsible?: boolean
}

export type Schedule = Record<string, Slot[]>

const LS_PREFIX = 'schedule_'

function lsKey(weekStart: string): string {
  return `${LS_PREFIX}${weekStart}`
}

export function loadScheduleFromLocal(weekStart: string): Schedule | null {
  const raw = localStorage.getItem(lsKey(weekStart))
  if (!raw) return null
  try {
    return JSON.parse(raw) as Schedule
  } catch {
    return null
  }
}

export function saveScheduleToLocal(weekStart: string, schedule: Schedule): void {
  localStorage.setItem(lsKey(weekStart), JSON.stringify(schedule))
}

/**
 * Load a week's schedule from Supabase. Returns null if no row exists.
 */
export async function loadScheduleFromSupabase(
  weekStart: string
): Promise<Schedule | null> {
  const { data, error } = await supabase
    .from('schedules')
    .select('data')
    .eq('week_start', weekStart)
    .maybeSingle()

  if (error || !data) return null
  return (data.data as Schedule) ?? null
}

/**
 * Upsert a week's schedule to Supabase. Fire-and-forget caller is fine,
 * but errors are logged.
 */
export async function saveScheduleToSupabase(
  weekStart: string,
  schedule: Schedule
): Promise<void> {
  const { error } = await supabase.from('schedules').upsert(
    {
      week_start: weekStart,
      data: schedule,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'week_start' }
  )
  if (error) console.warn('saveScheduleToSupabase failed:', error.message)
}

/**
 * Combined load: try Supabase first. If Supabase is empty AND localStorage
 * has data, push localStorage → Supabase (one-time migration) and return it.
 */
export async function loadSchedule(weekStart: string): Promise<Schedule> {
  const remote = await loadScheduleFromSupabase(weekStart)
  if (remote !== null) {
    saveScheduleToLocal(weekStart, remote)
    return remote
  }
  const local = loadScheduleFromLocal(weekStart)
  if (local && Object.keys(local).length > 0) {
    // Migration: push local → remote
    await saveScheduleToSupabase(weekStart, local)
    return local
  }
  return {}
}

/**
 * Save to both local (sync, instant) and Supabase (async, fire-and-forget).
 */
export function saveSchedule(weekStart: string, schedule: Schedule): void {
  saveScheduleToLocal(weekStart, schedule)
  void saveScheduleToSupabase(weekStart, schedule)
}

/**
 * Subscribe to Supabase realtime changes for a single week.
 * Returns an unsubscribe function.
 */
export function subscribeToSchedule(
  weekStart: string,
  onChange: (schedule: Schedule) => void
): () => void {
  const channel = supabase
    .channel(`schedule_${weekStart}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'schedules',
        filter: `week_start=eq.${weekStart}`,
      },
      payload => {
        const newRow = (payload.new as { data?: Schedule } | null) ?? null
        if (newRow && newRow.data) {
          saveScheduleToLocal(weekStart, newRow.data)
          onChange(newRow.data)
        }
      }
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

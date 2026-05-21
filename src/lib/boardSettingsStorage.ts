/**
 * Board settings storage — Supabase + localStorage cache.
 *
 * voltFlags (Friday "volt" toggles) and customShifts (per-week custom shift
 * definitions) used to live only in localStorage on each device. This module
 * mirrors them into the `board_settings` table so the board looks the same on
 * every device — same strategy as scheduleStorage.ts.
 *
 * NOTE: requires the `board_settings` table in Supabase (see MANUAL_TASKS.md).
 * Until that table exists every call degrades gracefully to localStorage, so
 * importing/using this module is safe even before the migration is run.
 *
 * Wiring WeeklyBoard.tsx to use this module is the remaining step — see
 * MANUAL_TASKS.md.
 */

import { supabase } from './supabaseClient'

export type VoltFlags = Record<string, boolean>

export interface CustomShiftDef {
  name: string
  day: string
  startTime: string
  endTime: string
  requiredCount: number
}

export interface BoardSettings {
  voltFlags: VoltFlags
  customShifts: Record<string, CustomShiftDef[]>
}

const VOLT_PREFIX = 'voltFlags_'
const CS_PREFIX = 'customShifts_'

export function loadBoardSettingsFromLocal(weekStart: string): BoardSettings {
  let voltFlags: VoltFlags = {}
  let customShifts: Record<string, CustomShiftDef[]> = {}
  try {
    const v = localStorage.getItem(`${VOLT_PREFIX}${weekStart}`)
    if (v) voltFlags = JSON.parse(v)
  } catch { /* ignore corrupt cache */ }
  try {
    const c = localStorage.getItem(`${CS_PREFIX}${weekStart}`)
    if (c) customShifts = JSON.parse(c)
  } catch { /* ignore corrupt cache */ }
  return { voltFlags, customShifts }
}

export function saveBoardSettingsToLocal(weekStart: string, s: BoardSettings): void {
  localStorage.setItem(`${VOLT_PREFIX}${weekStart}`, JSON.stringify(s.voltFlags))
  localStorage.setItem(`${CS_PREFIX}${weekStart}`, JSON.stringify(s.customShifts))
}

/** Load a week's board settings from Supabase. Returns null if no row / on error. */
export async function loadBoardSettingsFromSupabase(weekStart: string): Promise<BoardSettings | null> {
  const { data, error } = await supabase
    .from('board_settings')
    .select('volt_flags, custom_shifts')
    .eq('week_start', weekStart)
    .maybeSingle()
  if (error || !data) return null
  return {
    voltFlags: (data.volt_flags as VoltFlags) ?? {},
    customShifts: (data.custom_shifts as Record<string, CustomShiftDef[]>) ?? {},
  }
}

/** Upsert a week's board settings to Supabase. Errors are logged, not thrown. */
export async function saveBoardSettingsToSupabase(weekStart: string, s: BoardSettings): Promise<void> {
  const { error } = await supabase.from('board_settings').upsert(
    {
      week_start: weekStart,
      volt_flags: s.voltFlags,
      custom_shifts: s.customShifts,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'week_start' }
  )
  if (error) console.warn('saveBoardSettingsToSupabase failed:', error.message)
}

/**
 * Combined load: try Supabase first; if empty but localStorage has data,
 * migrate localStorage → Supabase once. Always returns a usable object.
 */
export async function loadBoardSettings(weekStart: string): Promise<BoardSettings> {
  const remote = await loadBoardSettingsFromSupabase(weekStart)
  if (remote !== null) {
    saveBoardSettingsToLocal(weekStart, remote)
    return remote
  }
  const local = loadBoardSettingsFromLocal(weekStart)
  const hasLocal =
    Object.keys(local.voltFlags).length > 0 || Object.keys(local.customShifts).length > 0
  if (hasLocal) {
    await saveBoardSettingsToSupabase(weekStart, local)
  }
  return local
}

/** Save to both local (sync, instant) and Supabase (async, fire-and-forget). */
export function saveBoardSettings(weekStart: string, s: BoardSettings): void {
  saveBoardSettingsToLocal(weekStart, s)
  void saveBoardSettingsToSupabase(weekStart, s)
}

/** Subscribe to Supabase realtime changes for a single week. Returns unsubscribe. */
export function subscribeToBoardSettings(
  weekStart: string,
  onChange: (s: BoardSettings) => void
): () => void {
  const channel = supabase
    .channel(`board_settings_${weekStart}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'board_settings',
        filter: `week_start=eq.${weekStart}`,
      },
      payload => {
        const row =
          (payload.new as
            | { volt_flags?: VoltFlags; custom_shifts?: Record<string, CustomShiftDef[]> }
            | null) ?? null
        if (row) {
          const s: BoardSettings = {
            voltFlags: row.volt_flags ?? {},
            customShifts: row.custom_shifts ?? {},
          }
          saveBoardSettingsToLocal(weekStart, s)
          onChange(s)
        }
      }
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

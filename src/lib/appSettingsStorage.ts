/**
 * App settings storage — generic global key/value, Supabase + localStorage cache.
 *
 * Some settings are NOT per-week or per-employee but a single global blob the
 * manager edits (e.g. the forecast "רצוי"/standard overrides — a map of
 * weekISO → desired-shift-count). Those used to live only in localStorage on
 * each device, so they never synced. This module mirrors any such blob into a
 * generic `app_settings` table (key text PK + data jsonb) so it looks the same
 * on every device — same strategy as scheduleStorage.ts / boardSettingsStorage.ts.
 *
 * NOTE: requires the `app_settings` table in Supabase (see MANUAL_TASKS.md).
 * Until that table exists every call degrades gracefully to localStorage, so
 * importing/using this module is safe even before the migration is run.
 */

import { supabase } from './supabaseClient'

const TABLE = 'app_settings'

export function loadSettingFromLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* ignore corrupt cache */ }
  return fallback
}

export function saveSettingToLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore quota / serialization errors */ }
}

/** Load a single setting from Supabase. Returns null if no row / on error. */
export async function loadSettingFromSupabase<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('data')
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return null
  return (data.data as T) ?? null
}

/** Upsert a single setting to Supabase. Errors are logged, not thrown. */
export async function saveSettingToSupabase<T>(key: string, value: T): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert(
    {
      key,
      data: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )
  if (error) console.warn(`saveSettingToSupabase(${key}) failed:`, error.message)
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

/**
 * Combined load: try Supabase first; if empty but localStorage has data,
 * migrate localStorage → Supabase once. Always returns a usable value.
 */
export async function loadSetting<T>(key: string, fallback: T): Promise<T> {
  const remote = await loadSettingFromSupabase<T>(key)
  if (remote !== null) {
    saveSettingToLocal(key, remote)
    return remote
  }
  const local = loadSettingFromLocal<T>(key, fallback)
  if (!isEmpty(local)) {
    await saveSettingToSupabase(key, local)
  }
  return local
}

/** Save to both local (sync, instant) and Supabase (async, fire-and-forget). */
export function saveSetting<T>(key: string, value: T): void {
  saveSettingToLocal(key, value)
  void saveSettingToSupabase(key, value)
}

/** Subscribe to Supabase realtime changes for a single setting. Returns unsubscribe. */
export function subscribeToSetting<T>(key: string, onChange: (value: T) => void): () => void {
  const channel = supabase
    .channel(`app_settings_${key}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: TABLE,
        filter: `key=eq.${key}`,
      },
      payload => {
        const row = (payload.new as { data?: T } | null) ?? null
        if (row && row.data !== undefined) {
          saveSettingToLocal(key, row.data)
          onChange(row.data as T)
        }
      }
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

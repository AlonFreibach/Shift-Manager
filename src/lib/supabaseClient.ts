import { createClient } from '@supabase/supabase-js'

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error('[Supabase] Missing env vars: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are not set.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export interface ForecastExclusion {
  date: string          // YYYY-MM-DD
  shift: 'בוקר' | 'ערב' | 'הכל'
  note?: string
}

export interface AvailabilityForecast {
  period_from: string
  period_to: string
  expected_shifts: number
  friday_available: boolean
  reason: 'מבחנים' | 'חופש' | 'אישי' | 'אחר'
  note?: string
  exclusions?: ForecastExclusion[]
}

export type SupabaseEmployee = {
  id: string
  name: string
  seniority: number
  shifts_per_week?: number
  friday: string
  shift_type: string
  active_from?: string
  active_until?: string
  email?: string
  phone?: string
  temp_password?: string
  role: 'admin' | 'employee'
  created_at: string
  vacation_periods?: { from: string; to: string }[] | null
  fixed_shifts?: { day: string; shift: string; arrivalTime: string; departureTime: string }[] | null
  birthday?: string | null
  availability_forecasts?: AvailabilityForecast[] | null
  expected_departure?: string | null
  employee_note?: string | null
  training_start?: string | null
  shifts_start?: string | null
  forecast_overrides?: Record<string, { shifts: number; friday: boolean }> | null
}

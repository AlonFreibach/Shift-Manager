import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export type SupabaseEmployee = {
  id: string
  name: string
  seniority: number
  friday: string
  shift_type: string
  active_from?: string
  active_until?: string
  email?: string
  temp_password?: string
  role: 'admin' | 'employee'
  created_at: string
}

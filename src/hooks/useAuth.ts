import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { SupabaseEmployee } from '../lib/supabaseClient'
import type { Session, User } from '@supabase/supabase-js'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<'admin' | 'employee' | null>(null)
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [employeeData, setEmployeeData] = useState<SupabaseEmployee | null>(null)
  const [loading, setLoading] = useState(true)

  // Early check: if session exists but no employee record, force sign out
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return
      supabase.from('employees').select('id,role').eq('email', data.session.user.email!).single()
        .then(({ data: emp }) => {
          if (!emp) supabase.auth.signOut()
        })
    })
  }, [])

  const fetchRole = async (email: string) => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('email', email)
      .single()

    if (!error && data) {
      setRole(data.role)
      setEmployeeId(data.id)
      setEmployeeData(data as SupabaseEmployee)
    } else {
      // Unknown user — no matching employee record, auto sign out
      await supabase.auth.signOut()
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user?.email) {
        fetchRole(s.user.email).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user?.email) {
        fetchRole(s.user.email)
      } else {
        setRole(null)
        setEmployeeId(null)
        setEmployeeData(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return { session, user, role, employeeId, employeeData, signOut, loading }
}

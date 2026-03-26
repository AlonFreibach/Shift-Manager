import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { SupabaseEmployee } from '../lib/supabaseClient'

export function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    const verify = async () => {
      const { data, error } = await supabase
        .from('employee_tokens')
        .select('*, employees(*)')
        .eq('token', token)
        .eq('is_active', true)
        .single()

      if (error || !data || !data.employees) {
        setStatus('error')
        return
      }

      const emp = data.employees as SupabaseEmployee
      localStorage.setItem('guest_employee', JSON.stringify(emp))
      navigate('/', { replace: true })
    }

    verify()
  }, [token, navigate])

  if (status === 'loading') {
    return (
      <div dir="rtl" style={{ minHeight: '100vh', background: '#EBF3D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            className="animate-spin"
            style={{ width: 40, height: 40, border: '4px solid #C8DBA0', borderTopColor: '#2D5016', borderRadius: '50%', margin: '0 auto 12px' }}
          />
          <span style={{ fontSize: 14, color: '#5A8A1F', fontWeight: 500 }}>מאמת קישור...</span>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#EBF3D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        background: 'white', borderRadius: 14, padding: 32,
        maxWidth: 380, width: '90%', textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1A3008', margin: '0 0 8px' }}>
          קישור לא תקין
        </h2>
        <p style={{ fontSize: 14, color: '#5A8A1F', margin: '0 0 20px', lineHeight: 1.6 }}>
          הקישור אינו פעיל או שפג תוקפו.<br />
          פני למיה לקבלת קישור חדש.
        </p>
        <button
          onClick={() => navigate('/', { replace: true })}
          style={{
            padding: '10px 24px', borderRadius: 8,
            background: '#2D5016', color: '#C8DBA0',
            border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          חזרה לדף הראשי
        </button>
      </div>
    </div>
  )
}

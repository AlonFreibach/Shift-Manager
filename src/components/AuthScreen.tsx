import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type AuthMode = null | 'admin' | 'employee'

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setError('')
    if (!email.trim() || !password.trim()) {
      setError('אנא מלא/י את כל השדות')
      return
    }
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) {
      setError('אימייל או סיסמא שגויים')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  const badgeBg = mode === 'admin' ? '#2D5016' : '#5A8A1F'
  const badgeText = mode === 'admin' ? '#C8DBA0' : '#EBF3D8'
  const btnLabel = mode === 'admin' ? 'כניסת מנהלת' : 'כניסת עובדת'

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: '#2D5016',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Card */}
      <div
        style={{
          background: '#F5F0E8',
          borderRadius: 16,
          padding: '2.5rem 2rem',
          maxWidth: 360,
          width: '100%',
          margin: '0 16px',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1A3008' }}>
            🌿 נוי השדה
          </div>
          <div style={{ fontSize: 13, color: '#5A8A1F', marginTop: 4, fontWeight: 500 }}>
            מערכת ניהול משמרות
          </div>
        </div>

        {mode === null ? (
          /* ── Role Selection ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => setMode('admin')}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 10,
                border: 'none',
                background: '#2D5016',
                color: '#C8DBA0',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              כניסת מנהלת
            </button>
            <button
              onClick={() => setMode('employee')}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 10,
                border: 'none',
                background: '#5A8A1F',
                color: '#EBF3D8',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              כניסת עובדת
            </button>
          </div>
        ) : (
          /* ── Login Form ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Badge */}
            <div style={{ textAlign: 'center', marginBottom: 2 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 14px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  background: badgeBg,
                  color: badgeText,
                }}
              >
                {btnLabel}
              </span>
            </div>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#1A3008', marginBottom: 4 }}>
                אימייל
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="example@email.com"
                dir="ltr"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #C8DBA0',
                  fontSize: 14,
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#5A8A1F')}
                onBlur={e => (e.currentTarget.style.borderColor = '#C8DBA0')}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#1A3008', marginBottom: 4 }}>
                סיסמא
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="••••••••"
                dir="ltr"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #C8DBA0',
                  fontSize: 14,
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#5A8A1F')}
                onBlur={e => (e.currentTarget.style.borderColor = '#C8DBA0')}
              />
            </div>

            {/* Error */}
            {error && (
              <p style={{ margin: 0, fontSize: 13, textAlign: 'center', fontWeight: 500, color: '#dc2626' }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 10,
                border: 'none',
                background: badgeBg,
                color: badgeText,
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'מתחבר/ת...' : 'התחבר/י'}
            </button>

            {/* Back */}
            <button
              onClick={() => { setMode(null); setError(''); setEmail(''); setPassword('') }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                color: '#5A8A1F',
                padding: 0,
                textAlign: 'center',
              }}
            >
              חזרה
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

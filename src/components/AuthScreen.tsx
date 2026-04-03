import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { SupabaseEmployee } from '../lib/supabaseClient'

type AuthMode = null | 'admin' | 'employee'
type EmployeeLoginMethod = 'pin' | 'password'

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>(null)
  const [empMethod, setEmpMethod] = useState<EmployeeLoginMethod>('pin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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

  const handlePinLogin = async () => {
    setError('')
    if (!email.trim() || !email.includes('@')) {
      setError('אנא הזיני כתובת אימייל תקינה')
      return
    }
    if (!pin.trim() || pin.length !== 4) {
      setError('אנא הזיני קוד PIN בן 4 ספרות')
      return
    }
    setLoading(true)

    try {
      const { data, error: fetchError } = await supabase
        .from('employee_tokens')
        .select('*, employees(*)')
        .eq('email', email.trim())
        .eq('pin', pin.trim())
        .eq('is_active', true)
        .single()

      if (fetchError || !data || !data.employees) {
        setError('אימייל או PIN שגויים')
        setLoading(false)
        return
      }

      // Sign out any existing session
      await supabase.auth.signOut()
      const emp = data.employees as SupabaseEmployee
      localStorage.setItem('guest_employee', JSON.stringify(emp))
      window.location.reload()
    } catch {
      setError('שגיאה בהתחברות')
    }
    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'employee' && empMethod === 'pin') {
        handlePinLogin()
      } else {
        handleLogin()
      }
    }
  }

  const badgeBg = mode === 'admin' ? '#2D5016' : '#5A8A1F'
  const badgeText = mode === 'admin' ? '#C8DBA0' : '#EBF3D8'
  const btnLabel = mode === 'admin' ? 'כניסת מנהלת' : 'כניסת עובד/ת'

  const resetForm = () => {
    setMode(null)
    setEmpMethod('pin')
    setError('')
    setEmail('')
    setPassword('')
    setPin('')
  }

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
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1A3008', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <img src="/logo.png" style={{ height: 36, objectFit: 'contain' }} alt="לוגו נוי השדה" />
            נוי השדה — סניף שוהם
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
              כניסת עובד/ת
            </button>
          </div>
        ) : mode === 'admin' ? (
          /* ── Admin Login Form (email + password) ── */
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
                  color: '#1a1a1a',
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
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="••••••••"
                  dir="ltr"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    borderRadius: 8,
                    border: '1px solid #C8DBA0',
                    fontSize: 14,
                    background: '#ffffff',
                    color: '#1a1a1a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#5A8A1F')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#C8DBA0')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 16, padding: 0, color: '#5A8A1F', lineHeight: 1,
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
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
              onClick={resetForm}
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
        ) : (
          /* ── Employee Login ── */
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

            {/* Method toggle */}
            <div style={{
              display: 'flex',
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid #C8DBA0',
            }}>
              <button
                onClick={() => { setEmpMethod('pin'); setError('') }}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: empMethod === 'pin' ? '#5A8A1F' : '#ffffff',
                  color: empMethod === 'pin' ? '#EBF3D8' : '#5A8A1F',
                  transition: 'all 0.15s',
                }}
              >
                כניסה עם PIN
              </button>
              <button
                onClick={() => { setEmpMethod('password'); setError('') }}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  borderRight: '1px solid #C8DBA0',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: empMethod === 'password' ? '#5A8A1F' : '#ffffff',
                  color: empMethod === 'password' ? '#EBF3D8' : '#5A8A1F',
                  transition: 'all 0.15s',
                }}
              >
                כניסה עם סיסמא
              </button>
            </div>

            {/* Email (shared) */}
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
                  color: '#1a1a1a',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#5A8A1F')}
                onBlur={e => (e.currentTarget.style.borderColor = '#C8DBA0')}
              />
            </div>

            {empMethod === 'pin' ? (
              /* PIN field */
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#1A3008', marginBottom: 4 }}>
                  קוד PIN
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={handleKeyDown}
                  placeholder="••••"
                  dir="ltr"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #C8DBA0',
                    fontSize: 20,
                    fontFamily: 'monospace',
                    letterSpacing: 8,
                    textAlign: 'center',
                    background: '#ffffff',
                    color: '#1a1a1a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#5A8A1F')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#C8DBA0')}
                />
              </div>
            ) : (
              /* Password field */
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
                    color: '#1a1a1a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#5A8A1F')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#C8DBA0')}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <p style={{ margin: 0, fontSize: 13, textAlign: 'center', fontWeight: 500, color: '#dc2626' }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              onClick={empMethod === 'pin' ? handlePinLogin : handleLogin}
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
              onClick={resetForm}
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

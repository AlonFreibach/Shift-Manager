import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { SupabaseEmployee } from '../lib/supabaseClient'

interface CreateUserModalProps {
  employee: SupabaseEmployee
  onClose: () => void
}

function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

const APP_URL = 'shift-manager-nu-pink.vercel.app'

export function CreateUserModal({ employee, onClose }: CreateUserModalProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const hasExistingUser = !!employee.email

  const handleCreateUser = async () => {
    setError('')
    if (!email.trim() || !email.includes('@')) {
      setError('אנא הזן/י כתובת אימייל תקינה')
      return
    }

    setLoading(true)
    const password = generatePassword()

    try {
      // Save email + temp_password + role in employees table
      const { error: updateError } = await supabase
        .from('employees')
        .update({ email, temp_password: password, role: 'employee' })
        .eq('id', employee.id)

      if (updateError) {
        setError('שגיאה בשמירת הפרטים: ' + updateError.message)
        setLoading(false)
        return
      }

      setCreatedCredentials({ email, password })
    } catch (err: any) {
      setError('שגיאה: ' + (err.message || 'משהו השתבש'))
    }
    setLoading(false)
  }

  const handleResetPassword = async () => {
    if (!employee.email) return
    setResetLoading(true)
    const newPassword = generatePassword()

    const { error: updateError } = await supabase
      .from('employees')
      .update({ temp_password: newPassword })
      .eq('id', employee.id)

    setResetLoading(false)
    if (updateError) {
      setError('שגיאה באיפוס סיסמא: ' + updateError.message)
    } else {
      setCreatedCredentials({ email: employee.email, password: newPassword })
      setResetDone(true)
    }
  }

  const handleCopy = () => {
    if (!createdCredentials) return
    const text = `שלח לעובדת:\nאתר: ${APP_URL}\nאימייל: ${createdCredentials.email}\nסיסמא: ${createdCredentials.password}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div dir="rtl" style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        padding: 28,
        maxWidth: 420,
        width: '100%',
        position: 'relative',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', left: 12, top: 12,
            width: 28, height: 28, borderRadius: '50%', background: '#f5f0e8',
            border: 'none', cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
          }}
        >
          ✕
        </button>

        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#1a4a2e' }}>
          הגדר כניסה — {employee.name}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#8b8b8b' }}>
          ניהול פרטי כניסה למערכת
        </p>

        {/* ── Created Successfully ── */}
        {createdCredentials ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 15, color: '#166534', marginTop: 0, marginBottom: 12 }}>
              {resetDone ? 'סיסמא אופסה!' : 'משתמש נוצר!'}
            </p>
            <p style={{ fontSize: 13, color: '#1a4a2e', fontWeight: 500, marginTop: 0, marginBottom: 12 }}>
              שלח/י לעובדת:
            </p>
            <div style={{
              fontSize: 14, lineHeight: 1.8, color: '#1a1a1a',
              background: '#ffffff', borderRadius: 6, padding: 12, border: '1px solid #e8e0d4',
            }}>
              <div><strong>אתר:</strong> <span dir="ltr">{APP_URL}</span></div>
              <div><strong>אימייל:</strong> <span dir="ltr">{createdCredentials.email}</span></div>
              <div><strong>סיסמא:</strong> <span dir="ltr" style={{ fontFamily: 'monospace' }}>{createdCredentials.password}</span></div>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 10, marginBottom: 0 }}>
              לאחר שהעובדת נכנסת בפעם הראשונה, המערכת תבקש ממנה לשנות סיסמא.
            </p>
            <button
              onClick={handleCopy}
              style={{
                marginTop: 12,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                background: copied ? '#166534' : '#1a4a2e',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              {copied ? 'הועתק!' : 'העתק פרטים'}
            </button>
          </div>
        ) : hasExistingUser ? (
          /* ── Existing User ── */
          <div>
            <div style={{ background: '#f8f7f4', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
                <strong>משתמש קיים:</strong> {employee.email}
              </p>
            </div>
            {error && (
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{error}</p>
            )}
            <button
              onClick={handleResetPassword}
              disabled={resetLoading}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                opacity: resetLoading ? 0.5 : 1,
                width: '100%',
              }}
            >
              {resetLoading ? 'מאפס...' : 'אפס סיסמא'}
            </button>
          </div>
        ) : (
          /* ── Create New User ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                אימייל
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com"
                dir="ltr"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 14,
                  border: '1px solid #e8e0d4',
                  borderRadius: 6,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {error && (
              <p style={{ margin: 0, fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{error}</p>
            )}
            <button
              onClick={handleCreateUser}
              disabled={loading}
              style={{
                padding: '8px 20px',
                fontSize: 14,
                fontWeight: 600,
                background: '#1a4a2e',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? 'יוצר משתמש...' : 'צור משתמש'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

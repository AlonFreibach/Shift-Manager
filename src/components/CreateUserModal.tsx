import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { SupabaseEmployee } from '../lib/supabaseClient'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'

interface CreateUserModalProps {
  employee: SupabaseEmployee
  onClose: () => void
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

const APP_URL = 'https://shift-manager-nu-pink.vercel.app'

export function CreateUserModal({ employee, onClose }: CreateUserModalProps) {
  const [email, setEmail] = useState(employee.email || '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [existingPin, setExistingPin] = useState<string | null>(null)
  const [existingEmail, setExistingEmail] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [justCreated, setJustCreated] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showUnsaved, setShowUnsaved] = useState(false)

  const tryClose = () => { if (dirty && !existingPin) { setShowUnsaved(true); } else { onClose(); } }

  // Check for existing PIN on mount
  useEffect(() => {
    const checkExisting = async () => {
      const { data } = await supabase
        .from('employee_tokens')
        .select('pin, email')
        .eq('employee_id', employee.id)
        .eq('is_active', true)
        .not('pin', 'is', null)
        .single()

      if (data?.pin) {
        setExistingPin(data.pin)
        setExistingEmail(data.email || employee.email || null)
      }
      setLoading(false)
    }
    checkExisting()
  }, [employee.id, employee.email])

  const handleCreatePin = async () => {
    setError('')
    if (!email.trim() || !email.includes('@')) {
      setError('אנא הזיני כתובת אימייל תקינה')
      return
    }
    setSaving(true)
    const pin = generatePin()

    try {
      // Check if there's already an active token for this employee
      const { data: existingToken } = await supabase
        .from('employee_tokens')
        .select('id')
        .eq('employee_id', employee.id)
        .eq('is_active', true)
        .single()

      if (existingToken) {
        // Update existing token with PIN + email
        const { error: updateError } = await supabase
          .from('employee_tokens')
          .update({ pin, email: email.trim() })
          .eq('id', existingToken.id)

        if (updateError) {
          setError('שגיאה בשמירה: ' + updateError.message)
          setSaving(false)
          return
        }
      } else {
        // Create new token with PIN + email
        const { error: insertError } = await supabase
          .from('employee_tokens')
          .insert({ employee_id: employee.id, pin, email: email.trim(), is_active: true })

        if (insertError) {
          setError('שגיאה בשמירה: ' + insertError.message)
          setSaving(false)
          return
        }
      }

      // Also update email in employees table if different
      if (email.trim() !== employee.email) {
        await supabase.from('employees').update({ email: email.trim() }).eq('id', employee.id)
      }

      setExistingPin(pin)
      setExistingEmail(email.trim())
      setJustCreated(true)
    } catch (err: any) {
      setError('שגיאה: ' + (err.message || 'משהו השתבש'))
    }
    setSaving(false)
  }

  const handleResetPin = async () => {
    setSaving(true)
    setError('')
    const newPin = generatePin()

    const { error: updateError } = await supabase
      .from('employee_tokens')
      .update({ pin: newPin })
      .eq('employee_id', employee.id)
      .eq('is_active', true)

    if (updateError) {
      setError('שגיאה באיפוס: ' + updateError.message)
    } else {
      setExistingPin(newPin)
      setJustCreated(true)
    }
    setSaving(false)
  }

  const handleCopy = () => {
    const text = `שלח/י לעובד/ת:\nאתר: ${APP_URL}\nאימייל: ${existingEmail}\nPIN: ${existingPin}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
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
          onClick={tryClose}
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
          🔑 הגדר כניסה — {employee.name}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#8b8b8b' }}>
          כניסה עם אימייל + PIN
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#8b8b8b', fontSize: 14 }}>
            טוען...
          </div>
        ) : existingPin ? (
          /* ── Mode B: PIN exists — show credentials ── */
          <div>
            <div style={{
              background: justCreated ? '#f0fdf4' : '#f8f7f4',
              border: `1px solid ${justCreated ? '#bbf7d0' : '#e8e0d4'}`,
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}>
              {justCreated && (
                <p style={{ fontWeight: 600, fontSize: 15, color: '#166534', marginTop: 0, marginBottom: 12 }}>
                  PIN {existingPin.length === 4 && existingEmail ? 'נוצר!' : 'אופס!'}
                </p>
              )}
              <p style={{ fontSize: 13, color: '#1a4a2e', fontWeight: 500, marginTop: 0, marginBottom: 12 }}>
                פרטי כניסה לעובד/ת:
              </p>
              <div style={{
                fontSize: 14, lineHeight: 1.8, color: '#1a1a1a',
                background: '#ffffff', borderRadius: 6, padding: 12, border: '1px solid #e8e0d4',
              }}>
                <div><strong>אתר:</strong> <span dir="ltr">{APP_URL}</span></div>
                <div><strong>אימייל:</strong> <span dir="ltr">{existingEmail}</span></div>
                <div>
                  <strong>PIN:</strong>{' '}
                  <span dir="ltr" style={{
                    fontFamily: 'monospace',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#1a4a2e',
                    letterSpacing: 4,
                  }}>
                    {existingPin}
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{error}</p>
            )}

            <button
              onClick={handleCopy}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                background: copied ? '#166534' : '#1a4a2e',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                width: '100%',
                marginBottom: 8,
              }}
            >
              {copied ? 'הועתק!' : 'העתק פרטי כניסה'}
            </button>

            <button
              onClick={handleResetPin}
              disabled={saving}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                opacity: saving ? 0.5 : 1,
                width: '100%',
              }}
            >
              {saving ? 'מאפס...' : 'אפס PIN'}
            </button>
          </div>
        ) : (
          /* ── Mode A: No PIN — create one ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                אימייל
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setDirty(true); }}
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
              onClick={handleCreatePin}
              disabled={saving}
              style={{
                padding: '8px 20px',
                fontSize: 14,
                fontWeight: 600,
                background: '#1a4a2e',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? 'יוצר PIN...' : 'צור PIN'}
            </button>
          </div>
        )}
      </div>
    </div>
    {showUnsaved && (
      <UnsavedChangesDialog
        onSave={() => { handleCreatePin(); setShowUnsaved(false); }}
        onDiscard={() => { setShowUnsaved(false); onClose(); }}
        onCancel={() => setShowUnsaved(false)}
      />
    )}
    </>
  )
}

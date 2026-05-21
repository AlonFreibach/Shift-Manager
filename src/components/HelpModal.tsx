import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface HelpModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Reusable help/onboarding modal. RTL, branded, closes on Escape, backdrop
 * click, or the "הבנתי" button. Part of the tutorial-system infrastructure.
 */
export function HelpModal({ title, onClose, children }: HelpModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 16,
      }}
    >
      <div
        dir="rtl"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 14,
          padding: 24,
          width: '100%',
          maxWidth: 520,
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a4a2e' }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="סגור"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#6b7280',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>{children}</div>

        <div style={{ marginTop: 18, textAlign: 'left' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 22px',
              borderRadius: 8,
              border: 'none',
              background: '#1a4a2e',
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            הבנתי
          </button>
        </div>
      </div>
    </div>
  )
}

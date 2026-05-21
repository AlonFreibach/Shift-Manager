import { useState } from 'react'
import type { ReactNode } from 'react'

interface UsageGuideProps {
  /** Unique key for persisting the collapsed state, e.g. 'board', 'employees'. */
  storageKey: string
  /** Guide content. */
  children: ReactNode
  /** Optional extra class on the outer box (e.g. 'print-hide'). */
  className?: string
}

/**
 * Collapsible "מדריך שימוש" panel shown at the top of each admin tab.
 * Open by default; once the user collapses it the choice persists in
 * localStorage (per-tab key). Matches the guide style used in ForecastTab.
 */
export function UsageGuide({ storageKey, children, className }: UsageGuideProps) {
  const lsKey = `guide_dismissed_${storageKey}`
  const [show, setShow] = useState<boolean>(() => {
    try {
      return localStorage.getItem(lsKey) !== 'true'
    } catch {
      return true
    }
  })

  function toggle() {
    const next = !show
    setShow(next)
    try {
      if (next) localStorage.removeItem(lsKey)
      else localStorage.setItem(lsKey, 'true')
    } catch {
      /* ignore storage errors */
    }
  }

  return (
    <div
      className={className}
      style={{
        background: 'white',
        border: '1px solid #e8e0d4',
        borderRadius: 12,
        marginBottom: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={toggle}
        aria-expanded={show}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1a4a2e' }}>📖 מדריך שימוש</span>
        <span
          style={{
            fontSize: 16,
            color: '#1a4a2e',
            transform: show ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </span>
      </button>
      {show && (
        <div style={{ padding: '0 18px 16px', fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
          {children}
        </div>
      )}
    </div>
  )
}

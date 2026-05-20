import type { CSSProperties } from 'react'

interface UndoButtonProps {
  onUndo: () => void
  canUndo: boolean
  /** Optional override for the tooltip text. */
  title?: string
  /** Optional inline style overrides. */
  style?: CSSProperties
}

/** Shared "↩ בטל" undo button — consistent across all admin tabs. */
export function UndoButton({
  onUndo,
  canUndo,
  title = 'בטל פעולה אחרונה (Ctrl+Z)',
  style,
}: UndoButtonProps) {
  return (
    <button
      onClick={onUndo}
      disabled={!canUndo}
      title={title}
      aria-label="בטל פעולה אחרונה"
      style={{
        padding: '7px 14px',
        borderRadius: 8,
        border: '1px solid #C8DBA0',
        background: canUndo ? '#1a4a2e' : '#f5f0e8',
        color: canUndo ? 'white' : '#94a3b8',
        fontSize: 13,
        fontWeight: 600,
        cursor: canUndo ? 'pointer' : 'default',
        opacity: canUndo ? 1 : 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        ...style,
      }}
    >
      ↩ בטל
    </button>
  )
}

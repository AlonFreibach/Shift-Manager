import { useState, useId } from 'react'

interface TooltipHintProps {
  /** Help text shown in the tooltip bubble. */
  text: string
}

/**
 * Small "?" badge that reveals a help tooltip on hover, focus, or click.
 * Part of the tutorial-system infrastructure (phase 1) — drop it next to any
 * label or control that needs an inline explanation.
 */
export function TooltipHint({ text }: TooltipHintProps) {
  const [show, setShow] = useState(false)
  const id = useId()

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="עזרה"
        aria-describedby={show ? id : undefined}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={() => setShow(s => !s)}
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: 'none',
          background: '#C8DBA0',
          color: '#1a4a2e',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'help',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          lineHeight: 1,
        }}
      >
        ?
      </button>
      {show && (
        <span
          role="tooltip"
          id={id}
          dir="rtl"
          style={{
            position: 'absolute',
            top: '130%',
            right: 0,
            zIndex: 50,
            background: '#1a4a2e',
            color: 'white',
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.5,
            padding: '6px 10px',
            borderRadius: 6,
            width: 200,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            textAlign: 'right',
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

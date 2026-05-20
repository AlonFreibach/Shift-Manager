import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Global error boundary — keeps a render crash in any component from taking
 * down the whole app. Shows a friendly Hebrew fallback with a reload button.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface details in the console for debugging.
    console.error('ErrorBoundary caught an error:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        dir="rtl"
        style={{
          minHeight: '100vh',
          background: '#faf7f2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: 14,
            border: '1px solid #e8e0d4',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '32px 28px',
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12 }}>🌿</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>
            משהו השתבש
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
            אירעה שגיאה בלתי צפויה. רענון הדף בדרך כלל פותר את הבעיה.
            אם השגיאה חוזרת — צרו קשר עם התמיכה.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 28px',
              borderRadius: 8,
              border: 'none',
              background: '#1a4a2e',
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            רענן את הדף
          </button>
          {this.state.error?.message && (
            <details style={{ marginTop: 18, textAlign: 'right' }}>
              <summary style={{ fontSize: 12, color: '#9ca3af', cursor: 'pointer' }}>
                פרטים טכניים
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: '#f5f0e8',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#6b7280',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  direction: 'ltr',
                }}
              >
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}

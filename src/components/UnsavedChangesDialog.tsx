interface UnsavedChangesDialogProps {
  onSave?: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({ onSave, onDiscard, onCancel }: UnsavedChangesDialogProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div dir="rtl" style={{
        background: 'white', borderRadius: 10, padding: 24,
        maxWidth: 360, width: '90%', textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1a4a2e' }}>
          יש שינויים שלא נשמרו
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {onSave && (
            <button
              onClick={onSave}
              style={{
                padding: '10px 16px', borderRadius: 8, border: 'none',
                background: '#1a4a2e', color: 'white',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              שמור
            </button>
          )}
          <button
            onClick={onDiscard}
            style={{
              padding: '10px 16px', borderRadius: 8, border: '1px solid #e8e0d4',
              background: '#fee2e2', color: '#dc2626',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            צא בלי לשמור
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 16px', borderRadius: 8, border: '1px solid #e8e0d4',
              background: '#f5f0e8', color: '#475569',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            חזור
          </button>
        </div>
      </div>
    </div>
  );
}

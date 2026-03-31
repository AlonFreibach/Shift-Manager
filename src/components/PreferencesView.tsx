import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { isWeekLocked, toggleWeekUnlock, fetchUnlockedWeeks } from '../utils/submissionWindow'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']
const SHIFT_TYPES = ['morning', 'evening'] as const

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function fmtDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function getBaseNextSunday(): Date {
  const now = new Date()
  const day = now.getDay()
  if (day === 0) {
    const daysToAdd = now.getHours() < 20 ? 7 : 14
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd)
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - day))
}

function formatSubmittedAt(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const day = d.getDate()
  const month = d.getMonth() + 1
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `הוגש ב-${day}.${month} בשעה ${hours}:${minutes}`
}

type GroupedEmployee = {
  employeeId: string
  employeeName: string
  submittedAt: string | null
  note: string
  shifts: Record<string, boolean>
  specialShifts: { key: string; label: string; available: boolean }[]
}

type EditShifts = Record<string, boolean>

type Props = {
  onAutoSchedule: (weekKey: string) => void
}

// ─── Shift Edit Modal (shared for edit + manual entry) ───
function ShiftEditModal({
  title,
  initialShifts,
  initialNote,
  onSave,
  onClose,
  saving,
}: {
  title: string
  initialShifts: EditShifts
  initialNote: string
  onSave: (shifts: EditShifts, note: string) => void
  onClose: () => void
  saving: boolean
}) {
  const [shifts, setShifts] = useState<EditShifts>(initialShifts)
  const [note, setNote] = useState(initialNote)
  const [dirty, setDirty] = useState(false)
  const [showUnsaved, setShowUnsaved] = useState(false)

  function toggle(key: string) {
    setShifts(prev => ({ ...prev, [key]: !prev[key] }))
    setDirty(true)
  }

  const tryClose = () => { if (dirty) { setShowUnsaved(true); } else { onClose(); } }

  return (
    <>
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={tryClose}>
      <div
        dir="rtl"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 14, padding: 24, width: '90%', maxWidth: 480,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: '#1a4a2e' }}>{title}</h3>

        {/* Shifts Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 6px', textAlign: 'right', color: '#8b8b8b', fontWeight: 500 }}></th>
                {DAY_NAMES.map(day => (
                  <th key={day} style={{ padding: '4px 6px', textAlign: 'center', color: '#5A8A1F', fontWeight: 600, fontSize: 12 }}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHIFT_TYPES.map(type => (
                <tr key={type}>
                  <td style={{ padding: '8px 6px', fontWeight: 500, color: '#1A3008', whiteSpace: 'nowrap' }}>
                    {type === 'morning' ? 'בוקר' : 'ערב'}
                  </td>
                  {DAY_NAMES.map((_, di) => {
                    const isFridayEvening = di === 5 && type === 'evening'
                    const key = `${di}_${type}`
                    const val = shifts[key] ?? false

                    if (isFridayEvening) {
                      return (
                        <td key={di} style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, color: '#d1cdc6' }}>—</span>
                        </td>
                      )
                    }

                    return (
                      <td key={di} style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggle(key)}
                          style={{
                            width: 32, height: 32, borderRadius: 8, border: 'none',
                            cursor: 'pointer', fontSize: 15, fontWeight: 700,
                            background: val ? '#EBF3D8' : '#f3f0eb',
                            color: val ? '#2D5016' : '#b0a99e',
                            transition: 'all 0.15s',
                          }}
                        >
                          {val ? '✓' : '✗'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Note */}
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#1A3008', display: 'block', marginBottom: 4 }}>הערה:</label>
          <textarea
            value={note}
            onChange={e => { setNote(e.target.value); setDirty(true); }}
            rows={2}
            style={{
              width: '100%', borderRadius: 8, border: '1px solid #e8e0d4',
              padding: 8, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', color: '#1a1a1a',
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginTop: 16 }}>
          <button
            onClick={() => onSave(shifts, note)}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: '#2D5016', color: 'white', fontSize: 13,
              fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button
            onClick={tryClose}
            style={{
              padding: '8px 20px', borderRadius: 8,
              border: '1px solid #e8e0d4', background: 'white',
              color: '#1A3008', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
    {showUnsaved && (
      <UnsavedChangesDialog
        onSave={() => { onSave(shifts, note); setShowUnsaved(false); }}
        onDiscard={() => { setShowUnsaved(false); onClose(); }}
        onCancel={() => setShowUnsaved(false)}
      />
    )}
    </>
  )
}

// ─── Manual Entry Modal (with employee dropdown) ───
function ManualEntryModal({
  employees,
  weekStart,
  onSaved,
  onClose,
  preselectedEmployeeId,
}: {
  employees: { id: string; name: string }[]
  weekStart: string
  onSaved: () => void
  onClose: () => void
  preselectedEmployeeId?: string
}) {
  const [selectedId, setSelectedId] = useState(preselectedEmployeeId || '')
  const [saving, setSaving] = useState(false)

  const selectedName = employees.find(e => e.id === selectedId)?.name || ''

  async function handleSave(shifts: EditShifts, note: string) {
    if (!selectedId) return
    setSaving(true)

    const rows: {
      employee_id: string
      week_start: string
      day_of_week: number
      shift_type: string
      available: boolean
      note: string
      submitted_at: string
    }[] = []

    const now = new Date().toISOString()

    for (const type of SHIFT_TYPES) {
      for (let di = 0; di < 6; di++) {
        if (di === 5 && type === 'evening') continue
        const key = `${di}_${type}`
        rows.push({
          employee_id: selectedId,
          week_start: weekStart,
          day_of_week: di,
          shift_type: type,
          available: shifts[key] ?? false,
          note: note || '',
          submitted_at: now,
        })
      }
    }

    await supabase.from('preferences').upsert(rows, {
      onConflict: 'employee_id,week_start,day_of_week,shift_type',
    })

    setSaving(false)
    onSaved()
  }

  // Empty initial shifts
  const emptyShifts: EditShifts = {}

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div
        dir="rtl"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 14, padding: 24, width: '90%', maxWidth: 480,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: '#1a4a2e' }}>הזנה ידנית של העדפות</h3>

        {/* Employee Selector */}
        {!preselectedEmployeeId && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1A3008', display: 'block', marginBottom: 4 }}>בחרי עובדת:</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: '1px solid #e8e0d4', fontSize: 13, fontFamily: 'inherit',
                background: 'white', color: '#1a1a1a',
              }}
            >
              <option value="">— בחרי —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        )}

        {preselectedEmployeeId && (
          <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 600, color: '#2D5016' }}>
            {selectedName}
          </div>
        )}

        {selectedId ? (
          <ShiftEditModalInner
            initialShifts={emptyShifts}
            initialNote=""
            onSave={handleSave}
            onClose={onClose}
            saving={saving}
          />
        ) : (
          <p style={{ fontSize: 13, color: '#8b8b8b', textAlign: 'center', padding: 20 }}>
            בחרי עובדת כדי להזין העדפות
          </p>
        )}
      </div>
    </div>
  )
}

// Inline shift editor (without outer modal wrapper)
function ShiftEditModalInner({
  initialShifts,
  initialNote,
  onSave,
  onClose,
  saving,
}: {
  initialShifts: EditShifts
  initialNote: string
  onSave: (shifts: EditShifts, note: string) => void
  onClose: () => void
  saving: boolean
}) {
  const [shifts, setShifts] = useState<EditShifts>(initialShifts)
  const [note, setNote] = useState(initialNote)

  function toggle(key: string) {
    setShifts(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '4px 6px', textAlign: 'right', color: '#8b8b8b', fontWeight: 500 }}></th>
              {DAY_NAMES.map(day => (
                <th key={day} style={{ padding: '4px 6px', textAlign: 'center', color: '#5A8A1F', fontWeight: 600, fontSize: 12 }}>
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SHIFT_TYPES.map(type => (
              <tr key={type}>
                <td style={{ padding: '8px 6px', fontWeight: 500, color: '#1A3008', whiteSpace: 'nowrap' }}>
                  {type === 'morning' ? 'בוקר' : 'ערב'}
                </td>
                {DAY_NAMES.map((_, di) => {
                  const isFridayEvening = di === 5 && type === 'evening'
                  const key = `${di}_${type}`
                  const val = shifts[key] ?? false

                  if (isFridayEvening) {
                    return (
                      <td key={di} style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, color: '#d1cdc6' }}>—</span>
                      </td>
                    )
                  }

                  return (
                    <td key={di} style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <button
                        onClick={() => toggle(key)}
                        style={{
                          width: 32, height: 32, borderRadius: 8, border: 'none',
                          cursor: 'pointer', fontSize: 15, fontWeight: 700,
                          background: val ? '#EBF3D8' : '#f3f0eb',
                          color: val ? '#2D5016' : '#b0a99e',
                          transition: 'all 0.15s',
                        }}
                      >
                        {val ? '✓' : '✗'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#1A3008', display: 'block', marginBottom: 4 }}>הערה:</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          style={{
            width: '100%', borderRadius: 8, border: '1px solid #e8e0d4',
            padding: 8, fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginTop: 16 }}>
        <button
          onClick={() => onSave(shifts, note)}
          disabled={saving}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: '#2D5016', color: 'white', fontSize: 13,
            fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'שומר...' : 'שמור'}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '8px 20px', borderRadius: 8,
            border: '1px solid #e8e0d4', background: 'white',
            color: '#1A3008', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ביטול
        </button>
      </div>
    </>
  )
}

// ─── Main PreferencesView ───
export function PreferencesView({ onAutoSchedule }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [prefs, setPrefs] = useState<any[]>([])
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; role: string; active_from?: string; active_until?: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [editingEmployee, setEditingEmployee] = useState<GroupedEmployee | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [manualEntryOpen, setManualEntryOpen] = useState(false)
  const [manualEntryPreselected, setManualEntryPreselected] = useState<string | undefined>(undefined)
  const [deleteConfirm, setDeleteConfirm] = useState<GroupedEmployee | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [unlockTrigger, setUnlockTrigger] = useState(0)
  const [unlockedWeeks, setUnlockedWeeks] = useState<string[]>([])

  // Fetch unlocked weeks from Supabase
  useEffect(() => {
    fetchUnlockedWeeks().then(setUnlockedWeeks)
  }, [unlockTrigger])

  const baseNextSunday = useMemo(() => getBaseNextSunday(), [])

  const selectedSunday = useMemo(() => {
    const d = new Date(baseNextSunday)
    d.setDate(d.getDate() + weekOffset * 7)
    return d
  }, [baseNextSunday, weekOffset])

  const selectedFriday = useMemo(() => {
    const d = new Date(selectedSunday)
    d.setDate(d.getDate() + 5)
    return d
  }, [selectedSunday])

  const weekStart = toISO(selectedSunday)
  const weekLocked = useMemo(() => isWeekLocked(weekStart, unlockedWeeks), [weekStart, unlockedWeeks])

  const fetchPreferences = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('preferences')
      .select('*, employees(name)')
      .eq('week_start', weekStart)

    setPrefs(data || [])
    setLoading(false)
  }, [weekStart])

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, name, role, active_from, active_until')
    setAllEmployees(data || [])
  }, [])

  useEffect(() => {
    fetchPreferences()
    fetchEmployees()
  }, [fetchPreferences, fetchEmployees])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('preferences-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'preferences' }, () => fetchPreferences())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'preferences' }, () => fetchPreferences())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'preferences' }, () => fetchPreferences())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchPreferences])

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Group preferences by employee
  const grouped = useMemo<GroupedEmployee[]>(() => {
    const map = new Map<string, GroupedEmployee>()

    prefs.forEach((p: any) => {
      if (!map.has(p.employee_id)) {
        map.set(p.employee_id, {
          employeeId: p.employee_id,
          employeeName: p.employees?.name || 'לא ידוע',
          submittedAt: null,
          note: p.note || '',
          shifts: {},
          specialShifts: [],
        })
      }
      const group = map.get(p.employee_id)!

      const ts = p.submitted_at || p.created_at
      if (ts && (!group.submittedAt || ts > group.submittedAt)) {
        group.submittedAt = ts
      }
      if (p.note && p.note.trim()) group.note = p.note

      if (p.shift_type === 'morning' || p.shift_type === 'evening') {
        group.shifts[`${p.day_of_week}_${p.shift_type}`] = p.available
      } else {
        group.specialShifts.push({
          key: p.shift_type,
          label: p.shift_type.replace('special_', ''),
          available: p.available,
        })
      }
    })

    return Array.from(map.values()).sort((a, b) => {
      if (!a.submittedAt) return 1
      if (!b.submittedAt) return -1
      return b.submittedAt.localeCompare(a.submittedAt)
    })
  }, [prefs])

  // Employees who haven't submitted (active only)
  const notSubmitted = useMemo(() => {
    const submittedIds = new Set(grouped.map(g => g.employeeId))
    const today = new Date().toISOString().split('T')[0]
    return allEmployees.filter(e => {
      if (e.role === 'admin') return false
      if (submittedIds.has(e.id)) return false
      if (e.active_from && today < e.active_from) return false
      if (e.active_until && today > e.active_until) return false
      return true
    })
  }, [allEmployees, grouped])

  // ─── Actions ───

  async function handleUnlockWeek() {
    if (!confirm(`לפתוח את ההגשה לשבוע ${fmtDate(selectedSunday)} — ${fmtDate(selectedFriday)} מחדש?`)) return
    const ok = await toggleWeekUnlock(weekStart, true)
    if (ok) {
      setUnlockTrigger(n => n + 1)
      setToast('השבוע נפתח מחדש')
    } else {
      setToast('שגיאה בפתיחת השבוע')
    }
  }

  async function handleLockWeek() {
    if (!confirm(`לנעול את ההגשה לשבוע ${fmtDate(selectedSunday)} — ${fmtDate(selectedFriday)}?`)) return
    const ok = await toggleWeekUnlock(weekStart, false)
    if (ok) {
      setUnlockTrigger(n => n + 1)
      setToast('השבוע ננעל')
    } else {
      setToast('שגיאה בנעילת השבוע')
    }
  }

  function buildWhatsAppText(): string {
    const weekLabel = `${fmtDate(selectedSunday)} — ${fmtDate(selectedFriday)}`
    let text = `העדפות לשבוע ${weekLabel}\n\n`

    if (grouped.length === 0) {
      text += 'אין העדפות שהוגשו.\n'
    }

    grouped.forEach(emp => {
      text += `${emp.employeeName}:\n`
      for (const type of SHIFT_TYPES) {
        const label = type === 'morning' ? 'בוקר' : 'ערב'
        const days: string[] = []
        DAY_NAMES.forEach((dayName, di) => {
          if (di === 5 && type === 'evening') return
          const key = `${di}_${type}`
          if (emp.shifts[key]) days.push(dayName)
        })
        if (days.length > 0) {
          text += `  ${label}: ${days.join(', ')}\n`
        }
      }
      if (emp.note.trim()) {
        text += `  הערה: ${emp.note}\n`
      }
      text += '\n'
    })

    if (notSubmitted.length > 0) {
      text += `טרם הגישו: ${notSubmitted.map(e => e.name).join(', ')}\n`
    }

    return text
  }

  async function handleCopyWhatsApp() {
    const text = buildWhatsAppText()
    try {
      await navigator.clipboard.writeText(text)
      setToast('הועתק ללוח!')
    } catch {
      setToast('שגיאה בהעתקה')
    }
  }

  async function handleResetPreferences() {
    if (!confirm(`למחוק את כל ההעדפות לשבוע ${fmtDate(selectedSunday)} — ${fmtDate(selectedFriday)}?`)) return

    await supabase
      .from('preferences')
      .delete()
      .eq('week_start', weekStart)

    setToast('העדפות אופסו')
    fetchPreferences()
  }

  async function handleDeleteEmployee(emp: GroupedEmployee) {
    await supabase
      .from('preferences')
      .delete()
      .eq('employee_id', emp.employeeId)
      .eq('week_start', weekStart)

    setDeleteConfirm(null)
    setToast(`העדפות ${emp.employeeName} נמחקו`)
    fetchPreferences()
  }

  async function handleEditSave(shifts: EditShifts, note: string) {
    if (!editingEmployee) return
    setEditSaving(true)

    const rows: {
      employee_id: string
      week_start: string
      day_of_week: number
      shift_type: string
      available: boolean
      note: string
      submitted_at: string
    }[] = []

    const now = new Date().toISOString()

    for (const type of SHIFT_TYPES) {
      for (let di = 0; di < 6; di++) {
        if (di === 5 && type === 'evening') continue
        const key = `${di}_${type}`
        rows.push({
          employee_id: editingEmployee.employeeId,
          week_start: weekStart,
          day_of_week: di,
          shift_type: type,
          available: shifts[key] ?? false,
          note: note || '',
          submitted_at: now,
        })
      }
    }

    await supabase.from('preferences').upsert(rows, {
      onConflict: 'employee_id,week_start,day_of_week,shift_type',
    })

    setEditSaving(false)
    setEditingEmployee(null)
    setToast(`העדפות ${editingEmployee.employeeName} עודכנו`)
    fetchPreferences()
  }

  // ── Render ──
  return (
    <div dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a4a2e' }}>העדפות שהוגשו</h2>
      </div>

      {/* ═══ Week Picker ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        marginBottom: 12, background: 'white', borderRadius: 10, padding: '10px 16px',
        border: '1px solid #e8e0d4',
      }}>
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid #C8DBA0',
            background: 'white', cursor: 'pointer', fontSize: 16, color: '#2D5016',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          →
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1A3008', minWidth: 140, textAlign: 'center' }}>
          {fmtDate(selectedSunday)} — {fmtDate(selectedFriday)}
        </span>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid #C8DBA0',
            background: 'white', cursor: 'pointer', fontSize: 16, color: '#2D5016',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ←
        </button>
      </div>

      {/* ═══ Lock Status Badge ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginBottom: 12,
      }}>
        {weekLocked ? (
          <>
            <span style={{
              fontSize: 12, fontWeight: 600, color: '#6b7280',
              background: '#f3f4f6', border: '1px solid #d1d5db',
              padding: '4px 14px', borderRadius: 999,
            }}>
              🔒 נעול
            </span>
            <button
              onClick={handleUnlockWeek}
              style={{
                fontSize: 11, fontWeight: 600, color: '#1a4a2e',
                background: '#EBF3D8', border: '1px solid #C8DBA0',
                padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
              }}
            >
              פתח מחדש 🔓
            </button>
          </>
        ) : (
          <>
            <span style={{
              fontSize: 12, fontWeight: 600, color: '#1a4a2e',
              background: '#dcfce7', border: '1px solid #86efac',
              padding: '4px 14px', borderRadius: 999,
            }}>
              ✅ פתוח להגשה
            </span>
            <button
              onClick={handleLockWeek}
              style={{
                fontSize: 11, fontWeight: 600, color: '#6b7280',
                background: '#f3f4f6', border: '1px solid #d1d5db',
                padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
              }}
            >
              נעל בחזרה 🔒
            </button>
          </>
        )}
      </div>

      {/* ═══ Toolbar ═══ */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap',
      }}>
        <button
          onClick={handleCopyWhatsApp}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid #C8DBA0',
            background: '#EBF3D8', color: '#2D5016', fontSize: 13,
            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          📋 העתק לווטסאפ
        </button>
        <button
          onClick={handleResetPreferences}
          disabled={grouped.length === 0}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid #f5c6cb',
            background: '#fff5f5', color: '#e74c3c', fontSize: 13,
            fontWeight: 600, cursor: grouped.length === 0 ? 'not-allowed' : 'pointer',
            opacity: grouped.length === 0 ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          🗑️ אפס העדפות
        </button>
        <button
          onClick={() => onAutoSchedule(weekStart)}
          disabled={grouped.length === 0}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid #c17f3b',
            background: '#fef3e2', color: '#92400E', fontSize: 13,
            fontWeight: 600, cursor: grouped.length === 0 ? 'not-allowed' : 'pointer',
            opacity: grouped.length === 0 ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ⚡ שבץ אוטומטי
        </button>
      </div>

      {/* ═══ Loading ═══ */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div
            className="animate-spin"
            style={{ width: 32, height: 32, border: '3px solid #C8DBA0', borderTopColor: '#2D5016', borderRadius: '50%', margin: '0 auto 10px' }}
          />
          <span style={{ fontSize: 13, color: '#5A8A1F' }}>טוען העדפות...</span>
        </div>
      ) : (
        <>
          {/* ═══ No submissions ═══ */}
          {grouped.length === 0 && (
            <div style={{
              textAlign: 'center', padding: 40, background: 'white',
              borderRadius: 12, border: '1px solid #e8e0d4',
            }}>
              <p style={{ fontSize: 15, color: '#8b8b8b', margin: 0 }}>אין העדפות שהוגשו לשבוע זה</p>
            </div>
          )}

          {/* ═══ Employee Cards ═══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {grouped.map(emp => (
              <div key={emp.employeeId} style={{
                background: 'white', borderRadius: 12, padding: 18,
                border: '1px solid #e8e0d4',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#EBF3D8', color: '#2D5016',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 600,
                    }}>
                      {emp.employeeName.charAt(0)}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1A3008' }}>{emp.employeeName}</span>
                    {emp.submittedAt && (
                      <span style={{ fontSize: 11, color: '#8b8b8b' }}>
                        {formatSubmittedAt(emp.submittedAt)}
                      </span>
                    )}
                  </div>
                  {/* Edit / Delete buttons */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => setEditingEmployee(emp)}
                      title="ערוך"
                      style={{
                        width: 30, height: 30, borderRadius: 6, border: '1px solid #e8e0d4',
                        background: 'white', cursor: 'pointer', fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(emp)}
                      title="מחק"
                      style={{
                        width: 30, height: 30, borderRadius: 6, border: '1px solid #f5c6cb',
                        background: 'white', cursor: 'pointer', fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Shifts Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '4px 6px', textAlign: 'right', color: '#8b8b8b', fontWeight: 500 }}></th>
                        {DAY_NAMES.map(day => (
                          <th key={day} style={{ padding: '4px 6px', textAlign: 'center', color: '#5A8A1F', fontWeight: 600 }}>
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SHIFT_TYPES.map(type => (
                        <tr key={type}>
                          <td style={{ padding: '6px 6px', fontWeight: 500, color: '#1A3008', whiteSpace: 'nowrap' }}>
                            {type === 'morning' ? 'בוקר' : 'ערב'}
                          </td>
                          {DAY_NAMES.map((_, di) => {
                            const isFridayEvening = di === 5 && type === 'evening'
                            const key = `${di}_${type}`
                            const val = emp.shifts[key]

                            if (isFridayEvening) {
                              return (
                                <td key={di} style={{ padding: '4px 6px', textAlign: 'center' }}>
                                  <span style={{ fontSize: 11, color: '#d1cdc6' }}>—</span>
                                </td>
                              )
                            }

                            if (val === undefined) {
                              return (
                                <td key={di} style={{ padding: '4px 6px', textAlign: 'center' }}>
                                  <span style={{ fontSize: 11, color: '#d1cdc6' }}>—</span>
                                </td>
                              )
                            }

                            return (
                              <td key={di} style={{ padding: '4px 6px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 24, height: 24, borderRadius: 6, fontSize: 13, fontWeight: 700,
                                  background: val ? '#EBF3D8' : '#f3f0eb',
                                  color: val ? '#2D5016' : '#b0a99e',
                                }}>
                                  {val ? '✓' : '✗'}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Special shifts */}
                {emp.specialShifts.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0ebe3' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#92400E' }}>משמרות מיוחדות:</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {emp.specialShifts.map(s => (
                        <span key={s.key} style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 999,
                          background: s.available ? '#EBF3D8' : '#f3f0eb',
                          color: s.available ? '#2D5016' : '#b0a99e',
                          fontWeight: 600,
                        }}>
                          {s.available ? '✓' : '✗'} {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Note */}
                {emp.note.trim() && (
                  <div style={{
                    marginTop: 10, padding: 10, borderRadius: 8,
                    background: '#EBF3D8', borderRight: '3px solid #5A8A1F',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#2D5016', marginBottom: 2 }}>הערה:</div>
                    <div style={{ fontSize: 13, color: '#1A3008', whiteSpace: 'pre-wrap' }}>{emp.note}</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ═══ Not Submitted ═══ */}
          {notSubmitted.length > 0 && (
            <div style={{
              marginTop: 16, padding: 14, borderRadius: 10,
              background: 'white', border: '1px solid #e8e0d4',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e74c3c', marginBottom: 8 }}>
                טרם הגישו:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {notSubmitted.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: '#e74c3c' }}>{e.name}</span>
                    <button
                      onClick={() => {
                        setManualEntryPreselected(e.id)
                        setManualEntryOpen(true)
                      }}
                      style={{
                        padding: '3px 10px', borderRadius: 6, border: '1px solid #C8DBA0',
                        background: '#EBF3D8', color: '#2D5016', fontSize: 11,
                        fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      + הזן ידנית
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Manual Entry Button ═══ */}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button
              onClick={() => {
                setManualEntryPreselected(undefined)
                setManualEntryOpen(true)
              }}
              style={{
                padding: '10px 24px', borderRadius: 10, border: '1px solid #C8DBA0',
                background: '#EBF3D8', color: '#2D5016', fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              + הזן ידנית עבור עובדת
            </button>
          </div>
        </>
      )}

      {/* ═══ Edit Modal ═══ */}
      {editingEmployee && (
        <ShiftEditModal
          title={`עריכת העדפות — ${editingEmployee.employeeName}`}
          initialShifts={{ ...editingEmployee.shifts }}
          initialNote={editingEmployee.note}
          onSave={handleEditSave}
          onClose={() => setEditingEmployee(null)}
          saving={editSaving}
        />
      )}

      {/* ═══ Manual Entry Modal ═══ */}
      {manualEntryOpen && (
        <ManualEntryModal
          employees={manualEntryPreselected
            ? allEmployees.filter(e => e.id === manualEntryPreselected)
            : allEmployees.filter(e => e.role !== 'admin')
          }
          weekStart={weekStart}
          onSaved={() => {
            setManualEntryOpen(false)
            setManualEntryPreselected(undefined)
            fetchPreferences()
            setToast('העדפות נשמרו')
          }}
          onClose={() => {
            setManualEntryOpen(false)
            setManualEntryPreselected(undefined)
          }}
          preselectedEmployeeId={manualEntryPreselected}
        />
      )}

      {/* ═══ Delete Confirm ═══ */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setDeleteConfirm(null)}>
          <div
            dir="rtl"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 14, padding: 24, width: '90%', maxWidth: 360,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#e74c3c' }}>
              מחיקת העדפות
            </h3>
            <p style={{ fontSize: 14, color: '#1A3008', margin: '0 0 16px' }}>
              למחוק את כל ההעדפות של {deleteConfirm.employeeName} לשבוע זה?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleDeleteEmployee(deleteConfirm)}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: '#e74c3c', color: 'white', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                מחק
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '8px 20px', borderRadius: 8,
                  border: '1px solid #e8e0d4', background: 'white',
                  color: '#1A3008', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Toast ═══ */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a4a2e', color: 'white', padding: '10px 24px',
          borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 1100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

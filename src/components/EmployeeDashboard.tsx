import { useState, useEffect, useMemo } from 'react'
import { supabase, type SupabaseEmployee } from '../lib/supabaseClient'
import { isWeekLocked } from '../utils/submissionWindow'

interface EmployeeDashboardProps {
  employee: SupabaseEmployee
  signOut: () => void
}

interface DayShift {
  dateISO: string
  dayName: string
  type: 'morning' | 'evening'
  label: string
  startTime: string
  endTime: string
  key: string
}

interface SpecialShift {
  id: string
  date: string
  start_time: string
  end_time: string
  title: string
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']

const RANGE_OPTIONS = [
  { value: 1, label: 'שבוע קרוב' },
  { value: 2, label: 'שבועיים' },
  { value: 3, label: '3 שבועות' },
  { value: 4, label: 'חודש קדימה' },
]

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

  const daysUntilSunday = 7 - day
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday)
}

export function EmployeeDashboard({ employee, signOut }: EmployeeDashboardProps) {
  const [range, setRange] = useState(1)
  const [selections, setSelections] = useState<Record<string, boolean>>({})
  const [specialShifts, setSpecialShifts] = useState<SpecialShift[]>([])
  const [note, setNote] = useState('')
  const [showSummary, setShowSummary] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [hasExisting, setHasExisting] = useState(false)

  const firstSunday = useMemo(() => getBaseNextSunday(), [])
  const locked = useMemo(() => isWeekLocked(toISO(firstSunday)), [firstSunday])

  // Generate weeks (each week = array of 6 dates, Sun–Fri)
  const weeks = useMemo(() => {
    const result: Date[][] = []
    for (let w = 0; w < range; w++) {
      const week: Date[] = []
      for (let d = 0; d < 6; d++) {
        const date = new Date(firstSunday)
        date.setDate(firstSunday.getDate() + w * 7 + d)
        week.push(date)
      }
      result.push(week)
    }
    return result
  }, [firstSunday, range])

  // Employee shift filters
  const isMorningAllowed =
    employee.shift_type === 'all' || employee.shift_type === 'הכל' ||
    employee.shift_type === 'morning' || employee.shift_type === 'בוקר'
  const isEveningAllowed =
    employee.shift_type === 'all' || employee.shift_type === 'הכל' ||
    employee.shift_type === 'evening' || employee.shift_type === 'ערב'
  const fridayAllowed =
    employee.friday !== 'no' && employee.friday !== 'never'

  // Generate available shifts per day
  const allDays = useMemo(() => {
    const days: { weekIndex: number; dayDate: Date; dayIndex: number; shifts: DayShift[] }[] = []

    weeks.forEach((week, wi) => {
      week.forEach((date, di) => {
        const dateISO = toISO(date)

        // Active date filter
        if (employee.active_from && dateISO < employee.active_from) return
        if (employee.active_until && dateISO > employee.active_until) return

        const isFriday = di === 5
        if (isFriday && !fridayAllowed) return

        const dayShifts: DayShift[] = []

        if (isFriday) {
          if (isMorningAllowed) {
            dayShifts.push({
              dateISO, dayName: 'שישי', type: 'morning', label: 'בוקר',
              startTime: '07:00', endTime: '14:00', key: `${dateISO}_morning`,
            })
          }
        } else {
          if (isMorningAllowed) {
            dayShifts.push({
              dateISO, dayName: DAY_NAMES[di], type: 'morning', label: 'בוקר',
              startTime: '07:00', endTime: '14:00', key: `${dateISO}_morning`,
            })
          }
          if (isEveningAllowed) {
            dayShifts.push({
              dateISO, dayName: DAY_NAMES[di], type: 'evening', label: 'ערב',
              startTime: '14:00', endTime: '21:00', key: `${dateISO}_evening`,
            })
          }
        }

        if (dayShifts.length > 0) {
          days.push({ weekIndex: wi, dayDate: date, dayIndex: di, shifts: dayShifts })
        }
      })
    })

    return days
  }, [weeks, employee, isMorningAllowed, isEveningAllowed, fridayAllowed])

  // Load special shifts + existing preferences
  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true)

      const firstDate = toISO(firstSunday)
      const lastDay = new Date(firstSunday)
      lastDay.setDate(firstSunday.getDate() + range * 7 - 2) // Friday of last week
      const lastDate = toISO(lastDay)

      // Special shifts
      const { data: specials } = await supabase
        .from('special_shifts')
        .select('*')
        .gte('date', firstDate)
        .lte('date', lastDate)
      if (specials) setSpecialShifts(specials)

      // Existing preferences
      const weekStarts: string[] = []
      for (let w = 0; w < range; w++) {
        const ws = new Date(firstSunday)
        ws.setDate(firstSunday.getDate() + w * 7)
        weekStarts.push(toISO(ws))
      }

      const { data: prefs } = await supabase
        .from('preferences')
        .select('*')
        .eq('employee_id', employee.id)
        .in('week_start', weekStarts)

      if (prefs && prefs.length > 0) {
        const sel: Record<string, boolean> = {}
        prefs.forEach((p: any) => {
          const ws = new Date(p.week_start + 'T00:00:00')
          ws.setDate(ws.getDate() + p.day_of_week)
          const key = `${toISO(ws)}_${p.shift_type}`
          sel[key] = p.available
        })
        setSelections(sel)
        if (prefs[0].note) setNote(prefs[0].note)
        setHasExisting(true)
      } else {
        setSelections({})
        setHasExisting(false)
      }

      setLoadingData(false)
    }

    loadData()
  }, [firstSunday, range, employee.id])

  // Counts
  const totalShifts = allDays.reduce((sum, d) => sum + d.shifts.length, 0) +
    specialShifts.filter(s => {
      // Only count specials that fall within visible days
      return allDays.some(d => d.shifts[0]?.dateISO === s.date || toISO(d.dayDate) === s.date)
    }).length
  const selectedCount = Object.values(selections).filter(v => v === true).length

  // Submit
  const handleSubmit = async () => {
    setSubmitting(true)

    const rows: any[] = []

    weeks.forEach((week) => {
      const weekStart = toISO(week[0])

      week.forEach((date, di) => {
        const dateISO = toISO(date)

        for (const type of ['morning', 'evening'] as const) {
          const key = `${dateISO}_${type}`
          if (key in selections) {
            rows.push({
              employee_id: employee.id,
              week_start: weekStart,
              day_of_week: di,
              shift_type: type,
              available: selections[key],
              note,
              submitted_at: new Date().toISOString(),
            })
          }
        }

        specialShifts
          .filter(s => s.date === dateISO)
          .forEach(s => {
            const key = `${dateISO}_special_${s.id}`
            if (key in selections) {
              rows.push({
                employee_id: employee.id,
                week_start: weekStart,
                day_of_week: di,
                shift_type: `special_${s.id}`,
                available: selections[key],
                note,
                submitted_at: new Date().toISOString(),
              })
            }
          })
      })
    })

    if (rows.length > 0) {
      await supabase.from('preferences').upsert(rows, {
        onConflict: 'employee_id,week_start,day_of_week,shift_type',
      })
    }

    setSubmitting(false)
    setShowSummary(false)
    setShowSuccess(true)
    setHasExisting(true)
  }

  // Helpers
  const getSpecialsForDate = (dateISO: string) =>
    specialShifts.filter(s => s.date === dateISO).sort((a, b) => a.start_time.localeCompare(b.start_time))

  const weekHeaderText = (wi: number) => `${fmtDate(weeks[wi][0])} — ${fmtDate(weeks[wi][5])}`

  // ── Render ──

  if (loadingData) {
    return (
      <div dir="rtl" style={{ minHeight: '100vh', background: '#EBF3D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            className="animate-spin"
            style={{ width: 40, height: 40, border: '4px solid #C8DBA0', borderTopColor: '#2D5016', borderRadius: '50%', margin: '0 auto 12px' }}
          />
          <span style={{ fontSize: 14, color: '#5A8A1F', fontWeight: 500 }}>טוען משמרות...</span>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#EBF3D8' }}>
      {/* ═══ Header ═══ */}
      <header style={{ background: '#1A3008', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#C8DBA0' }}>🌿 נוי השדה</span>
            <span style={{ fontSize: 13, color: '#C8DBA0', opacity: 0.8 }}>שלום, {employee.name} 👋</span>
          </div>
          <button
            onClick={signOut}
            style={{
              padding: '5px 14px', fontSize: 12, fontWeight: 600,
              background: 'rgba(200,219,160,0.15)', color: '#C8DBA0',
              border: '1px solid rgba(200,219,160,0.3)', borderRadius: 6, cursor: 'pointer',
            }}
          >
            התנתק
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 80px' }}>
        {/* ═══ Range Selector ═══ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: 'rgba(200,219,160,0.3)', borderRadius: 10, padding: 4 }}>
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              style={{
                flex: 1, padding: '8px 4px', fontSize: 12, fontWeight: 600,
                borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: range === opt.value ? '#F5F0E8' : 'transparent',
                color: range === opt.value ? '#2D5016' : '#5A8A1F',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ═══ Lock Banner / Edit Badge ═══ */}
        {locked ? (
          <div style={{
            background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 10,
            padding: '10px 14px', marginBottom: 12, textAlign: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>
              ⏰ ההגשה לשבוע זה נסגרה ביום ראשון בשעה 20:00
            </span>
          </div>
        ) : hasExisting ? (
          <div style={{
            background: '#EBF3D8', border: '1px solid #C8DBA0', borderRadius: 10,
            padding: '10px 14px', marginBottom: 12, textAlign: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#2D5016' }}>
              ✅ הגשתך נשמרה — ניתן לערוך עד ראשון 20:00
            </span>
          </div>
        ) : null}

        {/* ═══ Progress Card ═══ */}
        <div style={{ background: '#F5F0E8', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1A3008' }}>
              {selectedCount} / {totalShifts} משמרות סומנו
            </span>
            <span style={{ fontSize: 12, color: '#5A8A1F' }}>
              {totalShifts > 0 ? Math.round((selectedCount / totalShifts) * 100) : 0}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: '#C8DBA0' }}>
            <div style={{
              height: '100%', borderRadius: 4, background: '#2D5016',
              width: `${totalShifts > 0 ? (selectedCount / totalShifts) * 100 : 0}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>

        {/* ═══ Shifts by Week ═══ */}
        {weeks.map((_, wi) => {
          const daysInWeek = allDays.filter(d => d.weekIndex === wi)
          if (daysInWeek.length === 0) return null

          return (
            <div key={wi} style={{ marginBottom: 16 }}>
              {/* Week header (multi-week only) */}
              {range > 1 && (
                <div style={{
                  fontSize: 14, fontWeight: 700, color: '#2D5016',
                  marginBottom: 10, paddingBottom: 6,
                  borderBottom: '2px solid #C8DBA0',
                }}>
                  שבוע {wi + 1}: {weekHeaderText(wi)}
                </div>
              )}

              {daysInWeek.map(({ dayDate, dayIndex, shifts: dayShifts }) => {
                const dateISO = toISO(dayDate)
                const specials = getSpecialsForDate(dateISO)

                return (
                  <div key={dateISO} style={{
                    background: 'white', borderRadius: 10, padding: 14, marginBottom: 8,
                    border: '1px solid #C8DBA0',
                  }}>
                    {/* Day header */}
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A3008', marginBottom: 8 }}>
                      יום {DAY_NAMES[dayIndex]} — {fmtDate(dayDate)}
                    </div>

                    {/* Regular shifts */}
                    {dayShifts.map(shift => (
                      <ShiftRow
                        key={shift.key}
                        timeLabel={`${shift.startTime} — ${shift.endTime}`}
                        badge={shift.label}
                        badgeBg={shift.type === 'morning' ? '#EBF3D8' : '#F5F0E8'}
                        badgeColor={shift.type === 'morning' ? '#2D5016' : '#5A8A1F'}
                        selected={selections[shift.key]}
                        onSelect={val => setSelections(prev => ({ ...prev, [shift.key]: val }))}
                        disabled={locked}
                      />
                    ))}

                    {/* Special shifts */}
                    {specials.map(special => {
                      const key = `${dateISO}_special_${special.id}`
                      return (
                        <ShiftRow
                          key={key}
                          timeLabel={`${special.start_time} — ${special.end_time}`}
                          badge={`✨ ${special.title}`}
                          badgeBg="#FEF3C7"
                          badgeColor="#92400E"
                          selected={selections[key]}
                          onSelect={val => setSelections(prev => ({ ...prev, [key]: val }))}
                          disabled={locked}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* ═══ Note + Submit ═══ */}
        <div style={{ background: '#F5F0E8', borderRadius: 12, padding: 16, marginTop: 8 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1A3008', marginBottom: 6 }}>
            הערה (אופציונלי)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="הערות נוספות..."
            rows={3}
            disabled={locked}
            style={{
              width: '100%', padding: 10, fontSize: 13,
              border: '1px solid #C8DBA0', borderRadius: 8,
              resize: 'vertical', background: locked ? '#f0f0f0' : 'white', boxSizing: 'border-box',
              opacity: locked ? 0.6 : 1,
            }}
          />
          <button
            onClick={() => setShowSummary(true)}
            disabled={selectedCount === 0 || locked}
            style={{
              width: '100%', marginTop: 12, padding: 14, borderRadius: 10, border: 'none',
              background: selectedCount > 0 && !locked ? '#2D5016' : '#C8DBA0',
              color: selectedCount > 0 && !locked ? '#C8DBA0' : '#F5F0E8',
              fontSize: 15, fontWeight: 600,
              cursor: selectedCount > 0 && !locked ? 'pointer' : 'default',
            }}
          >
            {locked ? '🔒 ההגשה נעולה' : hasExisting ? 'עדכני הגשה ✓' : 'סיכום והגשה ←'}
          </button>
        </div>
      </main>

      {/* ═══ Summary Modal ═══ */}
      {showSummary && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div dir="rtl" style={{
            background: 'white', borderRadius: 14, padding: 24,
            maxWidth: 400, width: '100%', maxHeight: '80vh', overflow: 'auto',
            margin: '0 16px',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: '#1A3008' }}>
              סיכום העדפות
            </h3>

            {allDays.map(({ dayDate, dayIndex, shifts: dayShifts }) => {
              const dateISO = toISO(dayDate)
              const specials = getSpecialsForDate(dateISO)

              const items = [
                ...dayShifts.map(s => ({ key: s.key, label: `${s.startTime}–${s.endTime} ${s.label}`, special: false })),
                ...specials.map(s => ({ key: `${dateISO}_special_${s.id}`, label: `${s.start_time}–${s.end_time} ${s.title}`, special: true })),
              ].filter(i => selections[i.key] !== undefined)

              if (items.length === 0) return null

              return (
                <div key={dateISO} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2D5016', marginBottom: 4 }}>
                    יום {DAY_NAMES[dayIndex]} {fmtDate(dayDate)}
                  </div>
                  {items.map(item => (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 13 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, borderRadius: 4, fontSize: 12, fontWeight: 700,
                        background: selections[item.key] ? '#2D5016' : '#dc2626', color: 'white',
                      }}>
                        {selections[item.key] ? '✓' : '✗'}
                      </span>
                      <span style={{ color: '#1A3008' }}>{item.label}</span>
                      {item.special && <span style={{ fontSize: 10, color: '#92400E' }}>✨</span>}
                    </div>
                  ))}
                </div>
              )
            })}

            {note.trim() && (
              <div style={{
                background: '#EBF3D8', borderRadius: 8, padding: 10, marginTop: 12,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#2D5016', marginBottom: 4 }}>
                  הערה למיה:
                </div>
                <div style={{ fontSize: 13, color: '#1A3008', whiteSpace: 'pre-wrap' }}>
                  {note}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setShowSummary(false)}
                style={{
                  flex: 1, padding: 12, borderRadius: 8,
                  border: '1px solid #C8DBA0', background: 'white',
                  color: '#2D5016', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                ← עריכה
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1, padding: 12, borderRadius: 8, border: 'none',
                  background: '#2D5016', color: '#C8DBA0',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                {submitting ? 'שולח...' : hasExisting ? 'עדכני ✓' : 'הגישי ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Success Overlay ═══ */}
      {showSuccess && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,48,8,0.92)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div dir="rtl" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ color: '#C8DBA0', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
              {hasExisting ? 'ההעדפות עודכנו בהצלחה!' : 'המשמרות הוגשו בהצלחה!'}
            </h2>
            <p style={{ color: '#EBF3D8', fontSize: 14, margin: '0 0 24px' }}>
              מיה תקבל את ההעדפות שלך 🌿
            </p>
            <button
              onClick={() => setShowSuccess(false)}
              style={{
                padding: '10px 32px', borderRadius: 8,
                border: '1px solid #C8DBA0', background: 'transparent',
                color: '#C8DBA0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Shift Row sub-component ── */
function ShiftRow({ timeLabel, badge, badgeBg, badgeColor, selected, onSelect, disabled }: {
  timeLabel: string
  badge: string
  badgeBg: string
  badgeColor: string
  selected: boolean | undefined
  onSelect: (val: boolean) => void
  disabled?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', borderTop: '1px solid #EBF3D8',
      opacity: disabled ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#1A3008', fontWeight: 500, direction: 'ltr', display: 'inline-block' }}>
          {timeLabel}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
          background: badgeBg, color: badgeColor,
        }}>
          {badge}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => onSelect(true)}
          disabled={disabled}
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: selected === true ? '2px solid #2D5016' : '1px solid #C8DBA0',
            background: selected === true ? '#2D5016' : 'white',
            color: selected === true ? 'white' : '#C8DBA0',
            fontSize: 16, fontWeight: 700,
            cursor: disabled ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✓
        </button>
        <button
          onClick={() => onSelect(false)}
          disabled={disabled}
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: selected === false ? '2px solid #dc2626' : '1px solid #C8DBA0',
            background: selected === false ? '#dc2626' : 'white',
            color: selected === false ? 'white' : '#C8DBA0',
            fontSize: 16, fontWeight: 700,
            cursor: disabled ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✗
        </button>
      </div>
    </div>
  )
}

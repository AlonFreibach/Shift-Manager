import { useMemo, useEffect, useState } from 'react'
import {
  loadSchedule,
  saveSchedule as saveScheduleToStorage,
  subscribeToSchedule,
  type Schedule,
  type Slot,
} from '../lib/scheduleStorage'
import type { Employee } from '../data/employees'
import { expectedShiftsThisWeek } from '../utils/forecastGaps'
import { ISRAELI_HOLIDAYS } from '../data/holidays'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']
const SHIFT_TYPES = ['morning', 'evening'] as const

// Required headcount per shift (SLOT_DEFAULTS employees + Miya locked slot).
// Miya works every day morning — she accounts for +1 on every morning shift.
const SHIFT_REQUIRED: Record<string, Partial<Record<'morning' | 'evening', number>>> = {
  'ראשון':  { morning: 2, evening: 2 },
  'שני':    { morning: 2, evening: 2 },
  'שלישי':  { morning: 2, evening: 2 },
  'רביעי':  { morning: 3, evening: 2 },
  'חמישי':  { morning: 4, evening: 3 },
  'שישי':   { morning: 6 },
}

type GroupedEmployee = {
  employeeId: string
  employeeName: string
  submittedAt: string | null
  note: string
  shifts: Record<string, boolean>
  specialShifts: { key: string; label: string; available: boolean }[]
}

type Props = {
  grouped: GroupedEmployee[]
  notSubmittedNames: string[]
  weekStart: string
  weekEnd: string
  weekLabel: string
  onEdit: (emp: GroupedEmployee) => void
  onDelete: (emp: GroupedEmployee) => void
  onManualEntry: (employeeId?: string) => void
  notSubmittedEmployees: { id: string; name: string }[]
  allEmployees: Employee[]
}

function defaultSlotTimes(dayIdx: number, shift: 'morning' | 'evening'): { arrival: string; departure: string } {
  if (shift === 'morning') {
    if (dayIdx === 5) return { arrival: '07:00', departure: '15:30' }
    if (dayIdx === 3) return { arrival: '07:00', departure: '15:00' }
    if (dayIdx === 4) return { arrival: '06:45', departure: '14:30' }
    return { arrival: '07:00', departure: '15:00' }
  }
  return { arrival: '14:00', departure: '21:00' }
}

function holidayBadge(type: 'holiday' | 'holiday_eve' | 'memorial', demand?: string) {
  if (type === 'holiday') return { emoji: '🔴', label: 'סגור', bg: '#fee2e2', color: '#b91c1c' }
  if (type === 'holiday_eve') return { emoji: '🟡', label: 'ערב חג', bg: '#fef9c3', color: '#92400e' }
  if (demand === 'peak') return { emoji: '🔴', label: 'פסגה', bg: '#fce7f3', color: '#9d174d' }
  if (demand === 'high') return { emoji: '🟠', label: 'גבוה', bg: '#fff7ed', color: '#c2410c' }
  return { emoji: '⚪', label: '', bg: '#f9fafb', color: '#6b7280' }
}

export function PreferencesTableView({
  grouped,
  weekStart,
  weekLabel,
  onEdit,
  onDelete,
  onManualEntry,
  notSubmittedEmployees,
  allEmployees,
}: Props) {
  const [schedule, setSchedule] = useState<Schedule>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const sched = await loadSchedule(weekStart)
      if (!cancelled) setSchedule(sched)
    })()
    const unsubscribe = subscribeToSchedule(weekStart, remote => {
      if (!cancelled) setSchedule(remote)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [weekStart])

  const empById = useMemo(() => {
    const m = new Map<string, Employee>()
    for (const e of allEmployees) m.set(e.id, e)
    return m
  }, [allEmployees])

  const weekEndISO = useMemo(() => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + 5)
    return d.toISOString().slice(0, 10)
  }, [weekStart])

  // Date string for each day of the week (Sunday=0 … Friday=5)
  const dayDates = useMemo(() => {
    return DAY_NAMES.map((_, i) => {
      const d = new Date(weekStart + 'T00:00:00')
      d.setDate(d.getDate() + i)
      return d.toISOString().slice(0, 10)
    })
  }, [weekStart])

  // Holidays per day
  const dayHolidays = useMemo(() => {
    return dayDates.map(iso => ISRAELI_HOLIDAYS.filter(h => h.date === iso))
  }, [dayDates])

  // Assignment map: empId → Set<"dayIdx_shiftType">
  const assignedByEmp = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const [cellKey, slots] of Object.entries(schedule)) {
      const [dayName, shiftName] = cellKey.split('_')
      const dayIdx = DAY_NAMES.indexOf(dayName)
      if (dayIdx < 0) continue
      const shiftType = shiftName === 'בוקר' ? 'morning' : shiftName === 'ערב' ? 'evening' : null
      if (!shiftType) continue
      for (const slot of slots) {
        if (!slot.employeeId) continue
        if (!map.has(slot.employeeId)) map.set(slot.employeeId, new Set())
        map.get(slot.employeeId)!.add(`${dayIdx}_${shiftType}`)
      }
    }
    return map
  }, [schedule])

  // Assigned count per schedule cell (e.g. "ראשון_בוקר" → 2)
  const assignedCountPerCell = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [cellKey, slots] of Object.entries(schedule)) {
      counts[cellKey] = slots.filter(s => s.employeeId !== null).length
    }
    return counts
  }, [schedule])

  function countSubmitted(emp: GroupedEmployee): number {
    let c = 0
    for (let di = 0; di < 6; di++) {
      for (const t of SHIFT_TYPES) {
        if (di === 5 && t === 'evening') continue
        if (emp.shifts[`${di}_${t}`]) c++
      }
    }
    return c
  }

  function countReceived(empId: string): number {
    return assignedByEmp.get(empId)?.size ?? 0
  }

  function forecastFor(empId: string): number | null {
    const emp = empById.get(empId)
    if (!emp) return null
    return expectedShiftsThisWeek(emp, weekStart, weekEndISO)
  }

  function toggleAssignment(empId: string, dayIdx: number, shiftType: 'morning' | 'evening') {
    const dayName = DAY_NAMES[dayIdx]
    const shiftName = shiftType === 'morning' ? 'בוקר' : 'ערב'
    const cellKey = `${dayName}_${shiftName}`

    const next: Schedule = { ...schedule, [cellKey]: [...(schedule[cellKey] ?? [])] }
    const slots = next[cellKey]

    const existingIdx = slots.findIndex(s => s.employeeId === empId)
    if (existingIdx >= 0) {
      slots[existingIdx] = { ...slots[existingIdx], employeeId: null }
    } else {
      const { arrival, departure } = defaultSlotTimes(dayIdx, shiftType)
      const newSlot: Slot = {
        employeeId: empId,
        arrivalTime: arrival,
        departureTime: departure,
        station: '',
      }
      const emptyIdx = slots.findIndex(s => !s.locked && !s.isFixed && s.employeeId === null)
      if (emptyIdx >= 0) slots[emptyIdx] = newSlot
      else slots.push(newSlot)
    }

    setSchedule(next)
    saveScheduleToStorage(weekStart, next)
  }

  const allRows = useMemo(() => {
    const submittedIds = new Set(grouped.map(g => g.employeeId))
    const rows: { id: string; name: string; group?: GroupedEmployee; submitted: boolean }[] = []
    for (const g of grouped) {
      rows.push({ id: g.employeeId, name: g.employeeName, group: g, submitted: true })
    }
    for (const e of notSubmittedEmployees) {
      if (!submittedIds.has(e.id)) {
        rows.push({ id: e.id, name: e.name, submitted: false })
      }
    }
    return rows
  }, [grouped, notSubmittedEmployees])

  return (
    <div className="prefs-table-wrap">
      <div className="prefs-print-header">
        <h3>העדפות שהוגשו — שבוע {weekLabel}</h3>
      </div>

      <div className="prefs-legend print-hide">
        <span className="leg-item"><span className="leg-box leg-submitted">✓</span> ביקשה (לא שובצה)</span>
        <span className="leg-item"><span className="leg-box leg-assigned">✓</span> ביקשה + שובצה</span>
        <span className="leg-item"><span className="leg-box leg-assigned-no-req"> </span> שובצה (לא ביקשה)</span>
        <span className="leg-item"><span className="leg-box leg-fixed">🔒</span> קבוע (ניתן לביטול חד-פעמי)</span>
        <span className="leg-hint">לחיצה על תא = שיבוץ/ביטול</span>
      </div>

      <div className="prefs-table-scroll">
        <table className="prefs-table" dir="rtl">
          <thead>
            {/* ── Row 1: column group headers ── */}
            <tr>
              <th rowSpan={2} className="col-name">שם</th>

              {/* Summary columns — right of שם, before the day grid */}
              <th rowSpan={2} className="col-num">צפי</th>
              <th rowSpan={2} className="col-num">הגישה</th>
              <th rowSpan={2} className="col-num col-received-hdr">קיבלה</th>
              <th rowSpan={2} className="col-notes">הערות</th>

              {/* Day columns with optional holiday badge */}
              {DAY_NAMES.map((d, idx) => {
                const isFriday = idx === 5
                const holidays = dayHolidays[idx]
                const dateStr = dayDates[idx]
                const dateFmt = dateStr.slice(8, 10) + '.' + dateStr.slice(5, 7)
                return (
                  <th key={d} colSpan={isFriday ? 1 : 2} className="col-day">
                    <div style={{ fontWeight: 700 }}>{d}</div>
                    <div style={{ fontSize: 10, fontWeight: 400, color: '#888', marginBottom: holidays.length ? 2 : 0 }}>
                      {dateFmt}
                    </div>
                    {holidays.map(h => {
                      const badge = holidayBadge(h.type, h.demand)
                      return (
                        <div
                          key={h.name}
                          title={h.demandNote || h.name}
                          style={{
                            display: 'inline-block', fontSize: 9, fontWeight: 700,
                            padding: '1px 5px', borderRadius: 4, marginTop: 2,
                            background: badge.bg, color: badge.color,
                            whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {badge.emoji} {h.name}
                        </div>
                      )
                    })}
                  </th>
                )
              })}

              <th rowSpan={2} className="col-actions print-hide"></th>
            </tr>

            {/* ── Row 2: shift sub-headers with (assigned/required) counter ── */}
            <tr>
              {DAY_NAMES.map((d, idx) => {
                const isFriday = idx === 5
                if (isFriday) {
                  const required = SHIFT_REQUIRED[d]?.morning ?? 0
                  const cellKey = `${d}_בוקר`
                  const assigned = assignedCountPerCell[cellKey] ?? 0
                  const full = assigned >= required
                  return (
                    <th key={`${d}-b`} className="col-shift">
                      <div>בוקר</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: full ? '#16a34a' : '#b45309' }}>
                        {assigned}/{required}
                      </div>
                    </th>
                  )
                }
                return SHIFT_TYPES.map(t => {
                  const shiftHebrew = t === 'morning' ? 'בוקר' : 'ערב'
                  const required = SHIFT_REQUIRED[d]?.[t] ?? 0
                  const cellKey = `${d}_${shiftHebrew}`
                  const assigned = assignedCountPerCell[cellKey] ?? 0
                  const full = assigned >= required
                  return (
                    <th key={`${d}-${t}`} className="col-shift">
                      <div>{shiftHebrew}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: full ? '#16a34a' : '#b45309' }}>
                        {assigned}/{required}
                      </div>
                    </th>
                  )
                })
              })}
            </tr>
          </thead>

          <tbody>
            {allRows.length === 0 && (
              <tr>
                <td colSpan={17} style={{ textAlign: 'center', padding: 24, color: '#8b8b8b' }}>
                  אין עובדות פעילות
                </td>
              </tr>
            )}

            {allRows.map(row => {
              const submittedCount = row.group ? countSubmitted(row.group) : 0
              const receivedCount = countReceived(row.id)
              const assignedSet = assignedByEmp.get(row.id) ?? new Set()
              const forecast = forecastFor(row.id)

              return (
                <tr key={row.id} className={row.submitted ? '' : 'prefs-not-submitted'}>
                  {/* שם */}
                  <td className="col-name">{row.name}</td>

                  {/* Summary columns — immediately after שם */}
                  <td className="col-num">{forecast ?? '—'}</td>
                  <td className="col-num">{row.submitted ? submittedCount : '—'}</td>
                  <td className="col-num col-received">{receivedCount}</td>
                  <td className="col-notes">{row.group?.note ?? ''}</td>

                  {/* Day×Shift cells */}
                  {DAY_NAMES.map((dayName, di) =>
                    SHIFT_TYPES.map(t => {
                      if (di === 5 && t === 'evening') return null
                      const key = `${di}_${t}`
                      const submitted = !!row.group?.shifts[key]
                      const assigned = assignedSet.has(key)

                      const cellKey = `${dayName}_${t === 'morning' ? 'בוקר' : 'ערב'}`
                      const slot = schedule[cellKey]?.find(s => s.employeeId === row.id)
                      const isLocked = !!(slot?.locked || slot?.isFixed)

                      // Coloring:
                      // assigned (any) → green
                      // not assigned + submitted → white with ✓
                      // not assigned + not submitted → empty
                      // locked → yellow (overrides green)
                      let cellClass = 'cell cell-clickable'
                      if (assigned) cellClass += ' cell-assigned'
                      else if (submitted) cellClass += ' cell-submitted'
                      if (isLocked) cellClass += ' cell-locked'

                      // Content:
                      // locked → 🔒
                      // submitted (whether or not assigned) → ✓
                      // not submitted + assigned → (green, no mark)
                      // not submitted + not assigned → (empty)
                      const content = isLocked ? '🔒' : (submitted ? '✓' : '')

                      const title = isLocked
                        ? 'משמרת קבועה — לחיצה לביטול חד-פעמי לשבוע זה'
                        : assigned
                          ? 'לחיצה לביטול השיבוץ'
                          : submitted
                            ? 'לחיצה לשיבוץ (ביקשה משמרת זו)'
                            : 'לחיצה לשיבוץ'

                      return (
                        <td
                          key={key}
                          className={cellClass}
                          title={title}
                          onClick={() => toggleAssignment(row.id, di, t)}
                        >
                          {content}
                        </td>
                      )
                    })
                  )}

                  {/* Actions */}
                  <td className="col-actions print-hide">
                    {row.group ? (
                      <>
                        <button className="row-btn" onClick={() => onEdit(row.group!)} title="ערוך">✏️</button>
                        <button className="row-btn row-btn-del" onClick={() => onDelete(row.group!)} title="מחק">🗑️</button>
                      </>
                    ) : (
                      <button className="row-btn" onClick={() => onManualEntry(row.id)} title="הזן ידנית">+</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

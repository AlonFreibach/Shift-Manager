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

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']
const SHIFT_TYPES = ['morning', 'evening'] as const

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

// Default arrival/departure for a new slot created from this view.
// Matches WeeklyBoard SLOT_DEFAULTS approximately — Maya can fine-tune in WeeklyBoard.
function defaultSlotTimes(dayIdx: number, shift: 'morning' | 'evening'): { arrival: string; departure: string } {
  if (shift === 'morning') {
    if (dayIdx === 5) return { arrival: '07:00', departure: '15:30' } // Friday
    if (dayIdx === 3) return { arrival: '07:00', departure: '15:00' } // Wed
    if (dayIdx === 4) return { arrival: '06:45', departure: '14:30' } // Thu
    return { arrival: '07:00', departure: '15:00' }
  }
  return { arrival: '14:00', departure: '21:00' } // evening
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
  // Load schedule from Supabase (with localStorage fallback). Subscribe to realtime.
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

  // Build a quick employee-id -> Employee map (for forecast computation)
  const empById = useMemo(() => {
    const m = new Map<string, Employee>()
    for (const e of allEmployees) m.set(e.id, e)
    return m
  }, [allEmployees])

  // Week end ISO (5 days after weekStart for Sunday→Friday)
  const weekEndISO = useMemo(() => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + 5)
    return d.toISOString().slice(0, 10)
  }, [weekStart])

  // Build assignment map: empId -> Set of "dayIdx_shiftType"
  const assignedByEmp = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const [cellKey, slots] of Object.entries(schedule)) {
      const [dayName, shiftName] = cellKey.split('_')
      const dayIdx = DAY_NAMES.indexOf(dayName)
      if (dayIdx < 0) continue
      const shiftType =
        shiftName === 'בוקר' ? 'morning' : shiftName === 'ערב' ? 'evening' : null
      if (!shiftType) continue
      for (const slot of slots) {
        if (!slot.employeeId) continue
        if (!map.has(slot.employeeId)) map.set(slot.employeeId, new Set())
        map.get(slot.employeeId)!.add(`${dayIdx}_${shiftType}`)
      }
    }
    return map
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

  // ─── Click-to-assign handler ───
  // Toggle: if employee is already in a slot for this cell, remove that slot.
  // Otherwise, append a new slot with the employee.
  function toggleAssignment(empId: string, dayIdx: number, shiftType: 'morning' | 'evening') {
    const dayName = DAY_NAMES[dayIdx]
    const shiftName = shiftType === 'morning' ? 'בוקר' : 'ערב'
    const cellKey = `${dayName}_${shiftName}`

    const next: Schedule = { ...schedule, [cellKey]: [...(schedule[cellKey] ?? [])] }
    const slots = next[cellKey]

    const existingIdx = slots.findIndex(s => s.employeeId === empId)
    if (existingIdx >= 0) {
      // Allow toggling off even locked/fixed slots — Maya wants to make
      // per-week exceptions (e.g. Miya sick on Monday). We keep the slot
      // structure (with its locked/isFixed metadata) but clear employeeId,
      // so WeeklyBoard's auto-populate won't re-add the employee.
      slots[existingIdx] = { ...slots[existingIdx], employeeId: null }
    } else {
      const { arrival, departure } = defaultSlotTimes(dayIdx, shiftType)
      const newSlot: Slot = {
        employeeId: empId,
        arrivalTime: arrival,
        departureTime: departure,
        station: '',
      }
      // Prefer filling an empty (employeeId=null) non-locked slot before appending.
      const emptyIdx = slots.findIndex(s => !s.locked && !s.isFixed && s.employeeId === null)
      if (emptyIdx >= 0) slots[emptyIdx] = newSlot
      else slots.push(newSlot)
    }

    setSchedule(next)
    saveScheduleToStorage(weekStart, next)
  }

  // Rows: submitted employees first, then "not submitted" (still planable)
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
        <span className="leg-item"><span className="leg-box leg-submitted">✓</span> הגישה</span>
        <span className="leg-item"><span className="leg-box leg-assigned">✓</span> שובצה (לחיצה לביטול)</span>
        <span className="leg-item"><span className="leg-box leg-fixed">🔒</span> קבוע (ניתן לביטול חד-פעמי)</span>
        <span className="leg-hint">לחיצה על תא = שיבוץ/ביטול</span>
      </div>

      <div className="prefs-table-scroll">
        <table className="prefs-table" dir="rtl">
          <thead>
            <tr>
              <th rowSpan={2} className="col-name">שם</th>
              {DAY_NAMES.map((d, idx) => {
                const isFriday = idx === 5
                return (
                  <th key={d} colSpan={isFriday ? 1 : 2} className="col-day">
                    {d}
                  </th>
                )
              })}
              <th rowSpan={2} className="col-num">צפי</th>
              <th rowSpan={2} className="col-num">הגישה</th>
              <th rowSpan={2} className="col-num">קיבלה</th>
              <th rowSpan={2} className="col-notes">הערות</th>
              <th rowSpan={2} className="col-actions print-hide"></th>
            </tr>
            <tr>
              {DAY_NAMES.map((d, idx) => {
                const isFriday = idx === 5
                if (isFriday) {
                  return <th key={`${d}-b`} className="col-shift">בוקר</th>
                }
                return [
                  <th key={`${d}-b`} className="col-shift">בוקר</th>,
                  <th key={`${d}-e`} className="col-shift">ערב</th>,
                ]
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
                  <td className="col-name">{row.name}</td>
                  {DAY_NAMES.map((dayName, di) =>
                    SHIFT_TYPES.map(t => {
                      if (di === 5 && t === 'evening') return null
                      const key = `${di}_${t}`
                      const submitted = !!row.group?.shifts[key]
                      const assigned = assignedSet.has(key)

                      // Find the slot for this cell (if assigned) to check locked/isFixed
                      const cellKey = `${dayName}_${t === 'morning' ? 'בוקר' : 'ערב'}`
                      const slot = schedule[cellKey]?.find(s => s.employeeId === row.id)
                      const isLocked = !!(slot?.locked || slot?.isFixed)

                      let cellClass = 'cell cell-clickable'
                      if (assigned && submitted) cellClass += ' cell-assigned'
                      else if (assigned) cellClass += ' cell-assigned-only'
                      else if (submitted) cellClass += ' cell-submitted'
                      if (isLocked) cellClass += ' cell-locked'

                      const content = assigned
                        ? (isLocked ? '🔒' : '✓')
                        : (submitted ? '✓' : '')

                      const title = isLocked
                        ? 'משמרת קבועה — לחיצה לביטול חד-פעמי לשבוע זה'
                        : assigned
                          ? 'לחיצה לביטול השיבוץ'
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
                  <td className="col-num">{forecast ?? '—'}</td>
                  <td className="col-num">{row.submitted ? submittedCount : '—'}</td>
                  <td className="col-num col-received">{receivedCount}</td>
                  <td className="col-notes">{row.group?.note ?? ''}</td>
                  <td className="col-actions print-hide">
                    {row.group ? (
                      <>
                        <button
                          className="row-btn"
                          onClick={() => onEdit(row.group!)}
                          title="ערוך"
                        >
                          ✏️
                        </button>
                        <button
                          className="row-btn row-btn-del"
                          onClick={() => onDelete(row.group!)}
                          title="מחק"
                        >
                          🗑️
                        </button>
                      </>
                    ) : (
                      <button
                        className="row-btn"
                        onClick={() => onManualEntry(row.id)}
                        title="הזן ידנית"
                      >
                        +
                      </button>
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

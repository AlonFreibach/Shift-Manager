import { useState, useMemo, useCallback } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js'
import type { Employee, AvailabilityForecast } from '../data/employees'
import { supabase } from '../lib/supabaseClient'
import { ISRAELI_HOLIDAYS } from '../data/holidays'
import { HiringRecommendation } from './HiringRecommendation'
import {
  DAYS, calculateGaps, simulateHire, summarizeGapImpact,
  type DayName,
} from '../utils/forecastGaps'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const MIYA_NAME = 'מיה'
const MIYA_WEEKLY_SHIFTS = 6  // Miya's fixed schedule: 6 morning shifts per week (Sun-Fri)
const WEEKS_AHEAD = 12
const STANDARD_SLOTS = 30
const TARGET_RATIO = 1.25

// ═══ Utility functions ═══

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}`
}

function getSunday(d: Date): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() - copy.getDay())
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

// ═══ Week generation with holiday-aware standard slots ═══

interface WeekInfo {
  start: Date
  startISO: string
  endISO: string
  label: string
  holidays: string[]
  autoStandard: number
  demandLevel: 'peak' | 'high' | 'normal' | 'low'
  demandNotes: string[]
}

// Slots per day (Sun-Fri) based on SLOT_DEFAULTS in WeeklyBoard:
// Sun/Mon/Tue: 2 morning + 2 evening = 4
// Wed: 2 morning + 3 evening = 5
// Thu: 4 morning + 3 evening = 7
// Fri: 6 morning = 6
// Total: 4+4+4+5+7+6 = 30 (STANDARD_SLOTS)
const SLOTS_PER_DAY = [4, 4, 4, 5, 7, 6]       // Sun, Mon, Tue, Wed, Thu, Fri
const FRIDAY_SLOTS = 6                          // Holiday eves are treated like Friday (6 morning, 0 evening)

function calcAutoStandard(startISO: string): {
  standard: number
  holidays: string[]
  demandLevel: 'peak' | 'high' | 'normal' | 'low'
  demandNotes: string[]
} {
  // Default auto-calculation for fruit/vegetable retail (נוי השדה):
  // Hours classification (type):
  //   'holiday'     → closed (subtract all that day's slots)
  //   'holiday_eve' → treat as Friday (6 morning slots, 0 evening — replaces normal day count)
  //   'memorial'    → regular work day (no change)
  // Demand classification (demand):
  //   'peak' / 'high' / 'normal' / 'low' — staffing consideration for the manager
  const start = new Date(startISO)
  const holidays: string[] = []
  const demandNotes: string[] = []
  let slotsDelta = 0  // positive = slots removed, negative = slots added
  let weekDemand: 'peak' | 'high' | 'normal' | 'low' = 'normal'

  const demandRank = { peak: 3, high: 2, normal: 1, low: 0 }

  for (let d = 0; d < 6; d++) {
    const day = addDays(start, d)
    const dayISO = toISO(day)
    const h = ISRAELI_HOLIDAYS.find(h => h.date === dayISO)
    if (!h) continue

    if (h.type === 'holiday') {
      // Full-day closure — remove all this day's slots
      slotsDelta += SLOTS_PER_DAY[d]
      holidays.push(`🔴 ${h.name}`)
    } else if (h.type === 'holiday_eve') {
      // Per Mia's rule: holiday eves = same as Friday (6 slots, all morning)
      // Replace this day's normal slot count with Friday's.
      // Sun/Mon/Tue: normal 4 → 6 (−2 delta, i.e. +2 slots)
      // Wed: normal 5 → 6 (−1 delta, i.e. +1 slot)
      // Thu: normal 7 → 6 (+1 delta, i.e. −1 slot)
      // Fri: already 6 (no change)
      slotsDelta += SLOTS_PER_DAY[d] - FRIDAY_SLOTS
      holidays.push(`🟡 ${h.name}`)
    } else if (h.type === 'memorial') {
      holidays.push(h.name)
    }

    if (h.demand && demandRank[h.demand] > demandRank[weekDemand]) {
      weekDemand = h.demand
    }
    if (h.demandNote) {
      demandNotes.push(h.demandNote)
    }
  }

  return {
    standard: Math.max(0, STANDARD_SLOTS - slotsDelta),
    holidays, demandLevel: weekDemand, demandNotes,
  }
}

function generateWeeks(): WeekInfo[] {
  const sunday = getSunday(new Date())
  const weeks: WeekInfo[] = []
  for (let w = 0; w < WEEKS_AHEAD; w++) {
    const start = addDays(sunday, w * 7)
    const startISO = toISO(start)
    const endISO = toISO(addDays(start, 5))
    const { standard, holidays, demandLevel, demandNotes } = calcAutoStandard(startISO)
    weeks.push({
      start, startISO, endISO,
      label: `${fmtShort(startISO)} – ${fmtShort(endISO)}`,
      holidays, autoStandard: standard, demandLevel, demandNotes,
    })
  }
  return weeks
}

// ═══ Cell computation ═══

type CellSource = 'default' | 'forecast' | 'vacation' | 'departed' | 'not_started' | 'training' | 'override'

interface CellData {
  value: number | null
  source: CellSource
  forecast?: AvailabilityForecast
  fridayAvailable?: boolean
  autoValue: number | null // what the system would compute before override
}

function isActiveInWeek(emp: Employee, wStart: string, wEnd: string): boolean {
  if (emp.isTrainee) return false
  const startDate = emp.shiftsStart || emp.availableFromDate
  if (startDate && wEnd < startDate) return false
  if (emp.availableToDate && wStart > emp.availableToDate) return false
  if (emp.expectedDeparture && wStart > emp.expectedDeparture) return false
  return true
}

function isInTraining(emp: Employee, wStart: string, wEnd: string): boolean {
  if (!emp.trainingStart) return false
  const shiftsDate = emp.shiftsStart || emp.availableFromDate || ''
  return wStart >= emp.trainingStart && (!shiftsDate || wEnd < shiftsDate)
}

function isOnVacation(emp: Employee, wStart: string, wEnd: string): boolean {
  return (emp.vacationPeriods || []).some(v => v.from <= wEnd && v.to >= wStart)
}

function getForecast(emp: Employee, wStart: string, wEnd: string): AvailabilityForecast | undefined {
  return (emp.availabilityForecasts || []).find(f => f.period_from <= wEnd && f.period_to >= wStart)
}

function computeCell(emp: Employee, week: WeekInfo): CellData {
  // Check override first
  const override = emp.forecastOverrides?.[week.startISO]
  if (override) {
    const auto = computeAutoValue(emp, week)
    return { value: override.shifts, source: 'override', fridayAvailable: override.friday, autoValue: auto }
  }
  return computeAutoCell(emp, week)
}

function computeAutoValue(emp: Employee, week: WeekInfo): number | null {
  const cell = computeAutoCell(emp, week)
  return cell.value
}

function computeAutoCell(emp: Employee, week: WeekInfo): CellData {
  if (!isActiveInWeek(emp, week.startISO, week.endISO)) {
    const departed = (emp.availableToDate && week.startISO > emp.availableToDate) ||
      (emp.expectedDeparture && week.startISO > emp.expectedDeparture)
    return { value: null, source: departed ? 'departed' : 'not_started', autoValue: null }
  }
  if (isInTraining(emp, week.startISO, week.endISO)) {
    return { value: 0, source: 'training', autoValue: 0 }
  }
  if (isOnVacation(emp, week.startISO, week.endISO)) {
    return { value: 0, source: 'vacation', autoValue: 0 }
  }
  const fc = getForecast(emp, week.startISO, week.endISO)
  if (fc) {
    return { value: fc.expected_shifts, source: 'forecast', forecast: fc, fridayAvailable: fc.friday_available, autoValue: fc.expected_shifts }
  }
  // Miya has a fixed schedule of 6 morning shifts/week
  if (emp.name === MIYA_NAME) {
    return { value: MIYA_WEEKLY_SHIFTS, source: 'default', fridayAvailable: true, autoValue: MIYA_WEEKLY_SHIFTS }
  }
  return { value: emp.shiftsPerWeek, source: 'default', fridayAvailable: emp.fridayAvailability !== 'never', autoValue: emp.shiftsPerWeek }
}

// ═══ Colors ═══

function coverageColor(ratio: number): string {
  if (ratio >= TARGET_RATIO) return '#dcfce7'
  if (ratio >= 1.0) return '#FEF3E2'
  return '#fee2e2'
}

function coverageTextColor(ratio: number): string {
  if (ratio >= TARGET_RATIO) return '#16a34a'
  if (ratio >= 1.0) return '#c17f3b'
  return '#dc2626'
}

function cellBg(cell: CellData): string {
  if (cell.source === 'override') return '#e0e7ff'
  if (cell.source === 'vacation') return '#fef9c3'
  if (cell.source === 'training') return '#f0e6ff'
  if (cell.source === 'departed' || cell.source === 'not_started') return '#f3f4f6'
  if (cell.source === 'forecast') return '#fffde7'
  return 'white'
}

// ═══ Component ═══

interface ForecastTabProps {
  employees: Employee[]
  onRefresh?: () => void
}

const STANDARD_OVERRIDES_KEY = 'forecast_standard_overrides'

function loadStandardOverrides(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STANDARD_OVERRIDES_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveStandardOverrides(overrides: Record<string, number>) {
  try {
    localStorage.setItem(STANDARD_OVERRIDES_KEY, JSON.stringify(overrides))
  } catch { /* ignore */ }
}

export function ForecastTab({ employees, onRefresh }: ForecastTabProps) {
  const [standardOverrides, setStandardOverridesState] = useState<Record<string, number>>(() => loadStandardOverrides())
  const setStandardOverrides = useCallback((update: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setStandardOverridesState(prev => {
      const next = typeof update === 'function' ? update(prev) : update
      saveStandardOverrides(next)
      return next
    })
  }, [])
  const [editingCell, setEditingCell] = useState<{ empId: string; weekISO: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editFriday, setEditFriday] = useState(true)
  const [editingStandard, setEditingStandard] = useState<string | null>(null)
  const [editStdValue, setEditStdValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Simulator state
  const [simShifts, setSimShifts] = useState(4)
  const [simFriday, setSimFriday] = useState<'always' | 'never' | 'biweekly'>('always')
  const [simShiftType, setSimShiftType] = useState<'הכל' | 'בוקר' | 'ערב'>('הכל')
  const [simDays, setSimDays] = useState<Set<DayName>>(new Set(['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']))
  const [showSim, setShowSim] = useState(false)

  // Compute current gaps + simulated gaps
  const baseGaps = useMemo(() => calculateGaps(employees), [employees])
  const simulatedGaps = useMemo(() => simulateHire(baseGaps, {
    weeklyShifts: simShifts,
    shiftType: simShiftType,
    friday: simFriday,
    availableDays: simDays,
  }), [baseGaps, simShifts, simShiftType, simFriday, simDays])
  const gapImpact = useMemo(() => summarizeGapImpact(baseGaps, simulatedGaps), [baseGaps, simulatedGaps])

  const [hoveredCell, setHoveredCell] = useState<{ empIdx: number; weekIdx: number } | null>(null)

  const weeks = useMemo(generateWeeks, [])

  const activeEmployees = useMemo(() => {
    const list = employees.filter(e => !e.isTrainee)
    // Miya first (fixed schedule), rest sorted alphabetically in Hebrew
    return list.sort((a, b) => {
      if (a.name === MIYA_NAME) return -1
      if (b.name === MIYA_NAME) return 1
      return a.name.localeCompare(b.name, 'he')
    })
  }, [employees])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }, [])

  // Save override for a specific employee cell
  const saveCellOverride = useCallback(async (empId: string, weekISO: string, shifts: number, friday: boolean) => {
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    setSaving(true)
    const current = { ...(emp.forecastOverrides || {}) }
    current[weekISO] = { shifts, friday }
    const { error } = await supabase
      .from('employees')
      .update({ forecast_overrides: current })
      .eq('id', empId)
    setSaving(false)
    if (!error) {
      emp.forecastOverrides = current
      showToast('נשמר ✓')
      onRefresh?.()
    }
  }, [employees, showToast, onRefresh])

  const clearCellOverride = useCallback(async (empId: string, weekISO: string) => {
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    setSaving(true)
    const current = { ...(emp.forecastOverrides || {}) }
    delete current[weekISO]
    const { error } = await supabase
      .from('employees')
      .update({ forecast_overrides: Object.keys(current).length > 0 ? current : null })
      .eq('id', empId)
    setSaving(false)
    if (!error) {
      emp.forecastOverrides = current
      showToast('אופס ✓')
      onRefresh?.()
    }
  }, [employees, showToast, onRefresh])

  // Get effective standard for a week (override or auto)
  const getStandard = useCallback((week: WeekInfo) => {
    return standardOverrides[week.startISO] ?? week.autoStandard
  }, [standardOverrides])

  // Build grid
  const grid = useMemo(() =>
    weeks.map(week => ({
      week,
      cells: activeEmployees.map(emp => computeCell(emp, week)),
    }))
  , [weeks, activeEmployees])

  // Summary per week
  const summaries = useMemo(() =>
    grid.map(row => {
      const total = row.cells.reduce((sum, c) => sum + (c.value ?? 0), 0)
      const standard = getStandard(row.week)
      const ratio = standard > 0 ? total / standard : 0
      const gap = Math.max(0, standard - total)
      // Count friday shortfall
      const fridayNeeded = row.week.autoStandard >= 6 ? 6 : 0
      const fridayAvail = row.cells.reduce((sum, c) => {
        if (c.value === null || c.value === 0) return sum
        if (c.fridayAvailable) return sum + 1
        return sum
      }, 0)
      const fridayGap = Math.max(0, fridayNeeded > 0 ? Math.ceil(fridayNeeded * TARGET_RATIO) - fridayAvail : 0)
      return { total, standard, ratio, gap, fridayGap }
    })
  , [grid, getStandard])

  // Alerts
  const alerts = useMemo(() => {
    const result: { weekLabel: string; ratio: number; gap: number; fridayGap: number; weeksAhead: number }[] = []
    summaries.forEach((s, i) => {
      if (s.ratio < 1.0) {
        result.push({
          weekLabel: weeks[i].label,
          ratio: s.ratio, gap: s.gap, fridayGap: s.fridayGap,
          weeksAhead: i,
        })
      }
    })
    return result
  }, [summaries, weeks])

  // Top metrics
  const currentRatio = summaries[0]?.ratio ?? 0
  const worstIdx = useMemo(() => {
    let worst = 0
    summaries.forEach((s, i) => { if (s.ratio < summaries[worst].ratio) worst = i })
    return worst
  }, [summaries])
  const forecastCount = activeEmployees.filter(e => (e.availabilityForecasts?.length ?? 0) > 0).length

  // ═══ Chart data ═══
  const chartData = useMemo(() => ({
    labels: weeks.map(w => w.label),
    datasets: [
      {
        label: 'צפי קיים',
        data: summaries.map(s => s.total),
        borderColor: '#1a4a2e',
        backgroundColor: 'rgba(26,74,46,0.1)',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 4,
        fill: true,
      },
      {
        label: 'נדרש (100%)',
        data: summaries.map(s => s.standard),
        borderColor: '#c17f3b',
        borderWidth: 2,
        borderDash: [6, 3],
        tension: 0,
        pointRadius: 0,
        fill: false,
      },
      {
        label: 'יעד (125%)',
        data: summaries.map(s => Math.round(s.standard * TARGET_RATIO)),
        borderColor: '#16a34a',
        borderWidth: 2,
        borderDash: [3, 3],
        tension: 0,
        pointRadius: 0,
        fill: false,
      },
    ],
  }), [weeks, summaries])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { font: { family: 'Heebo', size: 12 } } },
      tooltip: { titleFont: { family: 'Heebo' }, bodyFont: { family: 'Heebo' } },
    },
    scales: {
      y: { beginAtZero: false, min: 0, ticks: { font: { family: 'Heebo', size: 11 } } },
      x: { ticks: { font: { family: 'Heebo', size: 10 }, maxRotation: 45 } },
    },
  }), [])

  const [showGuide, setShowGuide] = useState(() =>
    localStorage.getItem('forecast_guide_dismissed') !== 'true'
  )

  return (
    <div dir="rtl" style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ═══ Tutorial Guide ═══ */}
      <div style={{
        background: 'white', border: '1px solid #e8e0d4', borderRadius: 12, marginBottom: 20,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <button
          onClick={() => {
            const next = !showGuide
            setShowGuide(next)
            if (!next) localStorage.setItem('forecast_guide_dismissed', 'true')
            else localStorage.removeItem('forecast_guide_dismissed')
          }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1a4a2e' }}>
            {showGuide ? 'מדריך — איך לקרוא את הדף הזה' : 'מדריך שימוש'}
          </span>
          <span style={{ fontSize: 16, color: '#1a4a2e', transform: showGuide ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showGuide && (
          <div style={{ padding: '0 18px 18px', fontSize: 13, color: '#475569', lineHeight: 1.7 }}>

            <div style={{ fontWeight: 600, color: '#1a4a2e', marginBottom: 8, fontSize: 14 }}>מה רואים כאן?</div>
            <p style={{ margin: '0 0 12px' }}>
              הדף מציג תחזית של כוח האדם ל-12 שבועות קדימה. כל שורה היא שבוע, וכל עמודה היא עובדת.
              המספר בתא הוא כמה משמרות העובדת צפויה לעבוד באותו שבוע.
            </p>

            <div style={{ fontWeight: 600, color: '#1a4a2e', marginBottom: 8, fontSize: 14 }}>מקרא צבעים — עמודת "צפי"</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', width: 40, height: 22, borderRadius: 4, background: '#dcfce7', border: '1px solid #bbf7d0' }} />
                <span><strong style={{ color: '#16a34a' }}>ירוק (125%+)</strong> — מספיק כוח אדם עם מרווח ביטחון</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', width: 40, height: 22, borderRadius: 4, background: '#FEF3E2', border: '1px solid #F5D5A0' }} />
                <span><strong style={{ color: '#c17f3b' }}>כתום (100-125%)</strong> — על הגבול, בלי גמישות</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', width: 40, height: 22, borderRadius: 4, background: '#fee2e2', border: '1px solid #fca5a5' }} />
                <span><strong style={{ color: '#dc2626' }}>אדום (מתחת 100%)</strong> — חוסר! לא מספיק עובדות</span>
              </div>
            </div>

            <div style={{ fontWeight: 600, color: '#1a4a2e', marginBottom: 8, fontSize: 14 }}>מקרא צבעים — תאי עובדות</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', width: 40, height: 22, borderRadius: 4, background: 'white', border: '1px solid #e8e0d4' }} />
                <span><strong>לבן</strong> — ערך אוטומטי מכרטיס העובדת (ברירת מחדל)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', width: 40, height: 22, borderRadius: 4, background: '#fffde7', border: '1px solid #fef08a' }} />
                <span><strong style={{ color: '#a16207' }}>צהוב</strong> — ערך שהעובדת הזינה (תקופת מבחנים, חופש וכו')</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', width: 40, height: 22, borderRadius: 4, background: '#e0e7ff', border: '1px solid #c7d2fe' }} />
                <span><strong style={{ color: '#4f46e5' }}>כחול</strong> — ערך שהמנהלת שינתה ידנית (דריסה)</span>
              </div>
            </div>

            <div style={{ fontWeight: 600, color: '#1a4a2e', marginBottom: 8, fontSize: 14 }}>סימנים נוספים</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              <div><span style={{ color: '#c17f3b', fontWeight: 700 }}>*</span> — תחזית שהעובדת הזינה</div>
              <div><span style={{ color: '#6366f1', fontWeight: 700 }}>✎</span> — דריסה ידנית של המנהלת</div>
              <div>🏖 — חופשה</div>
              <div>🎓 — חפיפה (עובדת חדשה)</div>
              <div><span style={{ color: '#d1d5db' }}>—</span> — לא פעילה</div>
            </div>

            <div style={{ fontWeight: 600, color: '#1a4a2e', marginBottom: 8, fontSize: 14 }}>עמודות סיכום</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              <div><strong>רצוי</strong> — מספר המשמרות הנדרש בשבוע (100%). ברירת מחדל: 30. ניתן לדרוס ידנית לכל שבוע</div>
              <div><strong>מצוי</strong> — סה"כ משמרות צפויות בפועל + אחוז כיסוי ביחס לרצוי</div>
            </div>

            <div style={{ fontWeight: 600, color: '#1a4a2e', marginBottom: 8, fontSize: 14 }}>חגים ומועדים</div>
            <p style={{ margin: '0 0 10px' }}>
              המערכת מחשבת אוטומטית את ה"רצוי" לכל שבוע לפי המועדים שבו:
            </p>
            <ul style={{ margin: '0 0 10px', paddingInlineStart: 20, lineHeight: 1.7 }}>
              <li>🔴 <strong>חג רשמי</strong> (סגור) — כל המשמרות של אותו יום יורדות מהתקן</li>
              <li>🟡 <strong>ערב חג</strong> — היום הופך להיות כמו יום שישי: 6 משמרות בוקר, ללא ערב. לרוב זה מעלה את התקן של השבוע (ערב חג ביום א'-ג' יוסיף 2 משמרות, ברביעי יוסיף 1)</li>
              <li>⚪ <strong>יום זיכרון / חול המועד / חנוכה / ל"ג בעומר</strong> — יום עבודה רגיל, ללא שינוי</li>
            </ul>
            <p style={{ margin: '0 0 10px' }}>
              בימים של <strong>ביקוש מוגבר</strong> (ערב פסח, ערב שבועות, ט"ו בשבט, פורים, חול המועד וכד') יופיע תג <strong style={{ color: '#dc2626' }}>פסגה</strong> או <strong style={{ color: '#f59e0b' }}>גבוה</strong> ליד התאריך. תגים אלה הם <strong>אינדיקציה ויזואלית</strong> — כל ערך ידני שתזיני נשמר במערכת (גם אחרי רענון).
            </p>
            <div style={{ background: '#fff7ed', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#9a3412', marginBottom: 12 }}>
              💡 <strong>ברירת המחדל מותאמת לחנות ירקות ופירות</strong> — ערב חג = יום שישי (6 משמרות בוקר). ברגע שמיה תחזיר רשימה עם ההחלטות הסופיות — הסיווג יעודכן בדיוק.
            </div>

            <div style={{ fontWeight: 600, color: '#1a4a2e', marginBottom: 8, fontSize: 14 }}>איך לערוך?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              <div><strong>לחיצה על תא של עובדת</strong> — פותחת חלון עריכה. ניתן לשנות מספר משמרות, שישי, ולאפס דריסה ידנית</div>
              <div><strong>לחיצה על עמודת "רצוי"</strong> — מאפשרת לשנות את מספר המשמרות הנדרש לשבוע (חגים, ביקוש מוגבר, וכד')</div>
            </div>

            <div style={{ fontWeight: 600, color: '#1a4a2e', marginBottom: 8, fontSize: 14 }}>היעד</div>
            <p style={{ margin: '0 0 6px' }}>
              היעד הוא <strong>125%</strong> כיסוי — כדי שיהיו מספיק אפשרויות שיבוץ ולא תהיי תקועה עם בדיוק מספיק.
            </p>

            <div style={{
              background: '#f8f7f4', borderRadius: 8, padding: '10px 14px', marginTop: 8,
              fontSize: 12, color: '#6b7280',
            }}>
              המידע בטבלה מתעדכן אוטומטית מנתוני העובדות (חופשות, תקופות מבחנים, תאריכי עזיבה).
              ניתן תמיד לדרוס ערך ידנית — הערך הידני מקבל עדיפות על החישוב האוטומטי.
            </div>
          </div>
        )}
      </div>

      {/* ═══ Summary Cards ═══ */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <SummaryCard
          label="כיסוי שבוע נוכחי"
          value={`${Math.round(currentRatio * 100)}%`}
          color={coverageTextColor(currentRatio)}
          sub={`${summaries[0]?.total ?? 0} / ${summaries[0]?.standard ?? STANDARD_SLOTS}`}
        />
        <SummaryCard
          label="שבוע הכי בעייתי"
          value={`${Math.round(summaries[worstIdx]?.ratio * 100)}%`}
          color={coverageTextColor(summaries[worstIdx]?.ratio ?? 0)}
          sub={weeks[worstIdx]?.label ?? ''}
        />
        <SummaryCard
          label="עובדות עם תחזית"
          value={`${forecastCount} / ${activeEmployees.length}`}
          color={forecastCount >= activeEmployees.length / 2 ? '#16a34a' : '#c17f3b'}
          sub=""
        />
      </div>

      {/* ═══ Alerts ═══ */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              background: a.ratio < 0.85 ? '#fee2e2' : '#FEF3E2',
              border: `1px solid ${a.ratio < 0.85 ? '#fca5a5' : '#F5D5A0'}`,
              borderRadius: 10, padding: '12px 16px', fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, color: a.ratio < 0.85 ? '#dc2626' : '#c17f3b', marginBottom: 4 }}>
                שבוע {a.weekLabel} — כיסוי {Math.round(a.ratio * 100)}%
                {a.weeksAhead <= 8 && <span style={{ marginRight: 8, fontSize: 11, color: '#dc2626' }}>⚠ פחות מחודשיים!</span>}
              </div>
              <div style={{ color: '#475569' }}>
                חסרות <strong>{a.gap}</strong> משמרות
                {a.fridayGap > 0 && <>, מתוכן <strong>{a.fridayGap}</strong> שישי/ערב חג</>}
                {' '}· המלצה: גיוס עובדת עם לפחות {Math.min(6, a.gap)} משמרות/שבוע
                {a.fridayGap > 0 && ' כולל שישי חובה'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Chart ═══ */}
      <div style={{
        background: 'white', borderRadius: 10, padding: 16, marginBottom: 20,
        border: '1px solid #e8e0d4', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#1A3008' }}>
          מגמת כיסוי — 12 שבועות
        </h3>
        <div style={{ height: 260 }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* ═══ Forecast Grid ═══ */}
      <div style={{
        overflowX: 'auto', border: '1px solid #e8e0d4', borderRadius: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', position: 'relative',
      }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: activeEmployees.length * 90 + 300 }}>
          <thead>
            <tr>
              <th style={{
                position: 'sticky', right: 0, zIndex: 3,
                background: '#1a4a2e', color: 'white', padding: '12px 16px',
                fontSize: 13, fontWeight: 600, textAlign: 'right',
                width: 140, minWidth: 140,
                borderBottom: '2px solid #c17f3b',
              }}>שבוע</th>
              <th style={{
                position: 'sticky', right: 140, zIndex: 3,
                background: '#1a4a2e', color: 'white', padding: '10px 8px',
                fontSize: 12, fontWeight: 600, textAlign: 'center',
                width: 60, minWidth: 60,
                borderBottom: '2px solid #c17f3b',
                borderRight: '2px solid rgba(255,255,255,0.2)',
              }}>רצוי</th>
              <th style={{
                position: 'sticky', right: 200, zIndex: 3,
                background: '#1a4a2e', color: 'white', padding: '10px 8px',
                fontSize: 12, fontWeight: 600, textAlign: 'center',
                width: 80, minWidth: 80,
                borderBottom: '2px solid #c17f3b',
                borderRight: '2px solid rgba(255,255,255,0.2)',
                boxShadow: '-2px 0 4px rgba(0,0,0,0.06)',
              }}>מצוי</th>
              {activeEmployees.map((emp, i) => {
                const parts = emp.name.split(' ')
                return (
                  <th key={emp.id} style={{
                    background: '#1a4a2e', color: 'white', padding: '8px 6px',
                    fontSize: 12, fontWeight: 600, textAlign: 'center',
                    width: 90, minWidth: 90,
                    borderBottom: '2px solid #c17f3b',
                    borderRight: i === 0 ? '2px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.1)',
                    verticalAlign: 'middle',
                  }} title={emp.name}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                      {parts.map((p, idx) => <span key={idx}>{p}</span>)}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, wi) => {
              const s = summaries[wi]
              const rowBg = coverageColor(s.ratio)
              const std = getStandard(row.week)
              return (
                <tr key={row.week.startISO}>
                  {/* Week label — sticky */}
                  <td style={{
                    position: 'sticky', right: 0, zIndex: 2,
                    width: 140, minWidth: 140,
                    background: rowBg, padding: '10px 14px',
                    fontSize: 13, fontWeight: 600, color: '#1a1a1a',
                    borderBottom: '1px solid #e8e0d4',
                  }}
                  title={row.week.demandNotes.length > 0 ? row.week.demandNotes.join('\n') : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{row.week.label}</span>
                      {row.week.demandLevel === 'peak' && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#dc2626', color: 'white', fontWeight: 700 }}>פסגה</span>}
                      {row.week.demandLevel === 'high' && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#f59e0b', color: 'white', fontWeight: 700 }}>גבוה</span>}
                      {row.week.demandLevel === 'low' && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#6b7280', color: 'white', fontWeight: 700 }}>נמוך</span>}
                    </div>
                    {row.week.holidays.length > 0 && (
                      <div style={{ fontSize: 10, color: '#c17f3b', fontWeight: 500, marginTop: 3, lineHeight: 1.4 }}>
                        {row.week.holidays.join(', ')}
                      </div>
                    )}
                  </td>

                  {/* Standard (editable) — רצוי — sticky */}
                  <td
                    onClick={() => { setEditingStandard(row.week.startISO); setEditStdValue(String(std)) }}
                    style={{
                      position: 'sticky', right: 140, zIndex: 2,
                      width: 60, minWidth: 60,
                      padding: '8px 6px', textAlign: 'center', fontSize: 14, fontWeight: 700,
                      borderBottom: '1px solid #e8e0d4',
                      borderRight: '2px solid #e8e0d4',
                      color: std !== row.week.autoStandard ? '#6366f1' : '#1a1a1a',
                      cursor: 'pointer',
                      background: std !== row.week.autoStandard ? '#e0e7ff' : rowBg,
                    }}
                  >
                    {editingStandard === row.week.startISO ? (
                      <input
                        type="number" min={0} max={60}
                        value={editStdValue}
                        onChange={e => setEditStdValue(e.target.value)}
                        onBlur={() => {
                          const val = parseInt(editStdValue)
                          if (!isNaN(val) && val >= 0) {
                            if (val === row.week.autoStandard) {
                              setStandardOverrides(p => { const n = { ...p }; delete n[row.week.startISO]; return n })
                            } else {
                              setStandardOverrides(p => ({ ...p, [row.week.startISO]: val }))
                            }
                          }
                          setEditingStandard(null)
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingStandard(null) }}
                        autoFocus
                        style={{
                          width: 42, padding: '4px', fontSize: 14, fontWeight: 700,
                          textAlign: 'center', border: '2px solid #6366f1', borderRadius: 6,
                          outline: 'none', color: '#1a1a1a',
                        }}
                      />
                    ) : (
                      <div>
                        <div style={{ fontSize: 14 }}>{std}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>100%</div>
                      </div>
                    )}
                  </td>

                  {/* מצוי — forecast total + percentage — sticky */}
                  <td style={{
                    position: 'sticky', right: 200, zIndex: 2,
                    width: 80, minWidth: 80,
                    padding: '8px 10px', textAlign: 'center',
                    borderBottom: '1px solid #e8e0d4',
                    borderRight: '2px solid #e8e0d4',
                    background: coverageColor(s.ratio),
                    boxShadow: '-2px 0 4px rgba(0,0,0,0.06)',
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: coverageTextColor(s.ratio) }}>
                      {s.total}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: coverageTextColor(s.ratio) }}>
                      {Math.round(s.ratio * 100)}%
                    </div>
                  </td>

                  {/* Employee cells */}
                  {row.cells.map((cell, ei) => {
                    const emp = activeEmployees[ei]
                    const isHovered = hoveredCell?.empIdx === ei && hoveredCell?.weekIdx === wi
                    const clickable = cell.value !== null || cell.source === 'override'
                    return (
                      <td
                        key={emp.id}
                        onMouseEnter={() => setHoveredCell({ empIdx: ei, weekIdx: wi })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => {
                          if (!clickable) return
                          setEditingCell({ empId: emp.id, weekISO: row.week.startISO })
                          setEditValue(cell.value !== null ? String(cell.value) : '0')
                          setEditFriday(cell.fridayAvailable ?? emp.fridayAvailability !== 'never')
                        }}
                        style={{
                          width: 90, minWidth: 90,
                          padding: '8px 4px', textAlign: 'center', fontSize: 14,
                          borderBottom: '1px solid #e8e0d4',
                          borderRight: ei === 0 ? '2px solid #e8e0d4' : '1px solid #f0ebe3',
                          background: isHovered && clickable ? 'rgba(26,74,46,0.06)' : cellBg(cell),
                          fontWeight: cell.source === 'override' || cell.source === 'forecast' ? 700 : 400,
                          color: cell.value === null ? '#d1d5db' : cell.value === 0 ? '#dc2626' : '#1a1a1a',
                          cursor: clickable ? 'pointer' : 'default',
                          transition: 'background 0.1s',
                        }}
                        title={
                          cell.source === 'vacation' ? 'חופשה'
                          : cell.source === 'departed' ? 'עזבה'
                          : cell.source === 'not_started' ? 'טרם התחילה'
                          : cell.source === 'training' ? 'בחפיפה'
                          : cell.source === 'override' ? `ערך ידני (מקור: ${cell.autoValue ?? '—'})`
                          : cell.source === 'forecast' && cell.forecast ? `${cell.forecast.reason}${cell.forecast.note ? ' · ' + cell.forecast.note : ''}${cell.forecast.exclusions?.length ? ' · חסומים: ' + cell.forecast.exclusions.map(ex => ex.date.split('-').reverse().join('/') + (ex.shift !== 'הכל' ? ` (${ex.shift})` : '')).join(', ') : ''}`
                          : ''
                        }
                      >
                        {cell.value === null ? '—' : cell.value}
                        {cell.source === 'vacation' && <span style={{ fontSize: 9, opacity: 0.7 }}> 🏖</span>}
                        {cell.source === 'training' && <span style={{ fontSize: 9, opacity: 0.7 }}> 🎓</span>}
                        {cell.source === 'forecast' && <span style={{ fontSize: 10, color: '#c17f3b' }}> *</span>}
                        {cell.source === 'override' && <span style={{ fontSize: 10, color: '#6366f1' }}> ✎</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ═══ Cell Edit Popup (floating, outside table) ═══ */}
      {editingCell && (() => {
        const emp = activeEmployees.find(e => e.id === editingCell.empId)
        const week = weeks.find(w => w.startISO === editingCell.weekISO)
        if (!emp || !week) return null
        const cell = computeCell(emp, week)
        return (
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.3)', zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setEditingCell(null)}
          >
            <div
              dir="rtl"
              onClick={e => e.stopPropagation()}
              style={{
                background: 'white', borderRadius: 14, padding: 24, minWidth: 280,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              }}
            >
              <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#1a4a2e' }}>
                {emp.name}
              </h4>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
                שבוע {week.label}
                {cell.source !== 'default' && cell.source !== 'override' && (
                  <span style={{ marginRight: 6, color: '#c17f3b' }}>
                    ({cell.source === 'forecast' ? `תחזית: ${cell.forecast?.reason}` : cell.source === 'vacation' ? 'חופשה' : cell.source === 'training' ? 'חפיפה' : ''})
                  </span>
                )}
              </div>

              {/* Show exclusions from employee forecast if any */}
              {cell.source === 'forecast' && cell.forecast?.exclusions && cell.forecast.exclusions.length > 0 && (
                <div style={{
                  background: '#fee2e2', borderRadius: 8, padding: '8px 12px', marginBottom: 14,
                  fontSize: 12,
                }}>
                  <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>ימים חסומים (מהעובדת):</div>
                  {cell.forecast.exclusions.map((ex, i) => (
                    <div key={i} style={{ color: '#7f1d1d', padding: '2px 0' }}>
                      {ex.date.split('-').reverse().join('/')} · {ex.shift === 'הכל' ? 'כל היום' : ex.shift}
                      {ex.note && <span style={{ color: '#6b7280' }}> — {ex.note}</span>}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
                  משמרות בשבוע
                </label>
                <input
                  type="number" min={0} max={6}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = parseInt(editValue)
                      if (!isNaN(val) && val >= 0 && val <= 6) saveCellOverride(emp.id, week.startISO, val, editFriday)
                      setEditingCell(null)
                    } else if (e.key === 'Escape') setEditingCell(null)
                  }}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 18, fontWeight: 700,
                    textAlign: 'center', border: '2px solid #1a4a2e', borderRadius: 8,
                    outline: 'none', color: '#1a1a1a', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
                  שישי
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[true, false].map(val => (
                    <button key={String(val)} onClick={() => setEditFriday(val)}
                      style={{
                        flex: 1, padding: '8px 0', fontSize: 14, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                        background: editFriday === val ? (val ? '#1a4a2e' : '#dc2626') : 'white',
                        color: editFriday === val ? 'white' : '#64748b',
                        border: editFriday === val ? 'none' : '1px solid #e8e0d4',
                      }}
                    >{val ? 'כן' : 'לא'}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setEditingCell(null)}
                  style={{
                    flex: 1, padding: 12, borderRadius: 8,
                    border: '1px solid #e8e0d4', background: 'white',
                    color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >ביטול</button>
                {cell.source === 'override' && (
                  <button
                    onClick={() => { clearCellOverride(emp.id, week.startISO); setEditingCell(null) }}
                    style={{
                      padding: '12px 16px', borderRadius: 8, border: 'none',
                      background: '#fee2e2', color: '#dc2626',
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                  >איפוס</button>
                )}
                <button
                  onClick={() => {
                    const val = parseInt(editValue)
                    if (!isNaN(val) && val >= 0 && val <= 6) saveCellOverride(emp.id, week.startISO, val, editFriday)
                    setEditingCell(null)
                  }}
                  disabled={saving}
                  style={{
                    flex: 1, padding: 12, borderRadius: 8, border: 'none',
                    background: '#1a4a2e', color: 'white',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >שמור</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Employee Notes Panel ═══ */}
      {activeEmployees.some(e => e.employeeNote || e.expectedDeparture) && (
        <div style={{
          marginTop: 16, background: 'white', borderRadius: 10, padding: 16,
          border: '1px solid #e8e0d4',
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#1A3008' }}>
            הערות ועדכונים מהעובדות
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeEmployees.filter(e => e.employeeNote || e.expectedDeparture).map(emp => (
              <div key={emp.id} style={{
                display: 'flex', gap: 10, padding: '8px 12px',
                background: '#F8F7F4', borderRadius: 8, fontSize: 13,
              }}>
                <span style={{ fontWeight: 600, color: '#1a4a2e', minWidth: 60 }}>{emp.name}</span>
                <div style={{ flex: 1, color: '#475569' }}>
                  {emp.expectedDeparture && (
                    <div style={{ color: '#dc2626', fontWeight: 500 }}>
                      עוזבת: {fmtShort(emp.expectedDeparture)}
                    </div>
                  )}
                  {emp.employeeNote && <div>{emp.employeeNote}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Legend ═══ */}
      <div style={{
        marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap',
        fontSize: 11, color: '#6b7280', padding: '8px 0',
      }}>
        <span><LegendDot color="white" border /> לבן = ברירת מחדל</span>
        <span><LegendDot color="#fffde7" border /> צהוב = העובדת הזינה</span>
        <span><LegendDot color="#e0e7ff" border /> כחול = דריסה ידנית</span>
        <span style={{ marginRight: 8, borderRight: '1px solid #d1d5db', paddingRight: 8 }} />
        <span><LegendDot color="#dcfce7" /> 125%+</span>
        <span><LegendDot color="#FEF3E2" /> 100-125%</span>
        <span><LegendDot color="#fee2e2" /> מתחת 100%</span>
      </div>

      {/* ═══ Hiring Simulator ═══ */}
      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => setShowSim(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'white', border: '1px solid #e8e0d4', borderRadius: 10,
            padding: '12px 16px', cursor: 'pointer', width: '100%',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1a4a2e' }}>סימולטור גיוס עובדת חדשה</span>
          <span style={{ marginRight: 'auto', fontSize: 16, color: '#1a4a2e', transform: showSim ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showSim && (
          <div style={{
            background: 'white', border: '1px solid #e8e0d4', borderTop: 'none',
            borderRadius: '0 0 10px 10px', padding: 20,
          }}>
            {/* Step 1: Employee details */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a4a2e', marginBottom: 10 }}>1. פרטי העובדת החדשה</div>

              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ minWidth: 200, flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
                    משמרות בשבוע: <strong style={{ color: '#1a4a2e' }}>{simShifts}</strong>
                  </label>
                  <input type="range" min={1} max={6} value={simShifts}
                    onChange={e => setSimShifts(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#1a4a2e' }}
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>שישי</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['always', 'biweekly', 'never'] as const).map(val => (
                      <button key={val} onClick={() => setSimFriday(val)}
                        style={{
                          flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                          background: simFriday === val ? '#1a4a2e' : 'white',
                          color: simFriday === val ? 'white' : '#64748b',
                          border: simFriday === val ? '2px solid #1a4a2e' : '1px solid #e8e0d4',
                        }}
                      >{val === 'always' ? 'תמיד' : val === 'biweekly' ? 'לסירוגין' : 'לא'}</button>
                    ))}
                  </div>
                </div>
                <div style={{ minWidth: 160 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>סוג משמרת</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['הכל', 'בוקר', 'ערב'] as const).map(val => (
                      <button key={val} onClick={() => setSimShiftType(val)}
                        style={{
                          flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                          background: simShiftType === val ? '#1a4a2e' : 'white',
                          color: simShiftType === val ? 'white' : '#64748b',
                          border: simShiftType === val ? '2px solid #1a4a2e' : '1px solid #e8e0d4',
                        }}
                      >{val}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Day selection */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 6 }}>
                  ימים זמינים: <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>(סמנ/י את הימים שבהם העובדת תוכל לעבוד)</span>
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAYS.map(day => {
                    const selected = simDays.has(day)
                    const isFriday = day === 'שישי'
                    const disabled = isFriday && simFriday === 'never'
                    return (
                      <button
                        key={day}
                        disabled={disabled}
                        onClick={() => setSimDays(prev => {
                          const next = new Set(prev)
                          if (next.has(day)) next.delete(day)
                          else next.add(day)
                          return next
                        })}
                        style={{
                          minWidth: 56, padding: '8px 12px', fontSize: 13, fontWeight: 600, borderRadius: 6,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          background: disabled ? '#f3f4f6' : selected ? '#1a4a2e' : 'white',
                          color: disabled ? '#9ca3af' : selected ? 'white' : '#64748b',
                          border: selected ? '2px solid #1a4a2e' : '1px solid #e8e0d4',
                          opacity: disabled ? 0.5 : 1,
                        }}
                      >{day}</button>
                    )
                  })}
                </div>
                {simDays.size === 0 && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>⚠ יש לבחור לפחות יום אחד</div>
                )}
              </div>
            </div>

            {/* Step 2: Before/After comparison */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a4a2e', marginBottom: 10 }}>2. מה זה ייתן לך</div>

              <div style={{ border: '1px solid #e8e0d4', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8f7f4' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>מדד</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>לפני</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>אחרי</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>שיפור</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '10px 14px', fontWeight: 600, borderTop: '1px solid #e8e0d4' }}>סה"כ חוסר</td>
                      <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: 700, borderTop: '1px solid #e8e0d4' }}>
                        {gapImpact.totalBefore}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', color: gapImpact.totalAfter > 0 ? '#c17f3b' : '#16a34a', fontWeight: 700, borderTop: '1px solid #e8e0d4' }}>
                        {gapImpact.totalAfter}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, borderTop: '1px solid #e8e0d4', color: gapImpact.gapClosed > 0 ? '#16a34a' : '#6b7280' }}>
                        {gapImpact.gapClosed > 0 ? `−${gapImpact.gapClosed} (${gapImpact.gapClosedPct}%)` : 'ללא שינוי'}
                      </td>
                    </tr>
                    {gapImpact.totalFridayBefore > 0 && (
                      <tr>
                        <td style={{ padding: '10px 14px', fontWeight: 600, borderTop: '1px solid #e8e0d4' }}>חוסר בשישי</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: 700, borderTop: '1px solid #e8e0d4' }}>
                          {gapImpact.totalFridayBefore}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center', color: gapImpact.totalFridayAfter > 0 ? '#c17f3b' : '#16a34a', fontWeight: 700, borderTop: '1px solid #e8e0d4' }}>
                          {gapImpact.totalFridayAfter}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, borderTop: '1px solid #e8e0d4', color: gapImpact.totalFridayBefore - gapImpact.totalFridayAfter > 0 ? '#16a34a' : '#6b7280' }}>
                          {gapImpact.totalFridayBefore - gapImpact.totalFridayAfter > 0
                            ? `−${gapImpact.totalFridayBefore - gapImpact.totalFridayAfter}`
                            : simFriday === 'never' ? '🔴 לא נענה (העובדת לא זמינה שישי)' : 'ללא שינוי'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step 3: Smart recommendation */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a4a2e', marginBottom: 10 }}>3. המלצה</div>
              {(() => {
                const pct = gapImpact.gapClosedPct
                const fridayUnmet = gapImpact.totalFridayAfter > 0 && simFriday === 'never'
                const noDaysSelected = simDays.size === 0
                const criticalGap = gapImpact.topRemaining.find(g => g.gap >= 4)

                let category: 'excellent' | 'good' | 'partial' | 'poor' = 'poor'
                if (noDaysSelected) category = 'poor'
                else if (pct >= 80) category = 'excellent'
                else if (pct >= 40) category = 'good'
                else if (pct >= 10) category = 'partial'

                const cfg = {
                  excellent: { bg: '#dcfce7', border: '#16a34a', icon: '🟢', title: 'גיוס מצוין', color: '#16a34a' },
                  good: { bg: '#FEF3E2', border: '#f59e0b', icon: '🟡', title: 'גיוס טוב חלקית', color: '#c17f3b' },
                  partial: { bg: '#fff7ed', border: '#fb923c', icon: '🟠', title: 'גיוס משלים', color: '#c2410c' },
                  poor: { bg: '#fee2e2', border: '#dc2626', icon: '🔴', title: 'גיוס לא מתאים', color: '#dc2626' },
                }[category]

                const tips: string[] = []
                if (noDaysSelected) tips.push('בחרי לפחות יום אחד שהעובדת זמינה בו')
                else if (pct >= 80) tips.push('העובדת סוגרת כמעט את כל החוסרים הקריטיים')
                else {
                  if (fridayUnmet) tips.push('חוסר שישי לא נסגר — נסי לוודא שהיא יכולה שישי, או גייסי עובדת נוספת לשישי')
                  if (criticalGap) tips.push(`${criticalGap.day} ${criticalGap.shift} עדיין חסר ${criticalGap.gap} משמרות`)
                  if (gapImpact.topRemaining.length > 0 && !criticalGap) tips.push(`חוסרים קטנים נשארים ב־${gapImpact.topRemaining.map(g => `${g.day} ${g.shift}`).join(', ')}`)
                  if (tips.length === 0 && pct < 40) tips.push('הימים שנבחרו לא תואמים לחוסרים הקיימים — נסי ימים אחרים')
                }

                return (
                  <div style={{
                    background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: 14,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: cfg.color, marginBottom: 6 }}>
                      {cfg.icon} {cfg.title}
                      {!noDaysSelected && <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginRight: 8 }}>— סוגרת {pct}% מהחוסרים</span>}
                    </div>
                    {tips.length > 0 && (
                      <ul style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                        {tips.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>

      {/* ═══ Hiring Recommendation ═══ */}
      <HiringRecommendation employees={employees} />

      {/* ═══ Toast ═══ */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: '50%', transform: 'translateX(50%)',
          background: '#1a4a2e', color: 'white', padding: '10px 20px', borderRadius: 10,
          fontSize: 14, fontWeight: 600, zIndex: 10001,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ═══ Sub-components ═══

function SummaryCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 140, background: 'white', borderRadius: 10, padding: 16,
      border: '1px solid #e8e0d4', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function LegendDot({ color, border }: { color: string; border?: boolean }) {
  return <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: color, marginLeft: 4, verticalAlign: 'middle', border: border ? '1px solid #d1d5db' : 'none' }} />
}

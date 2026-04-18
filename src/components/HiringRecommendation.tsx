import { useState, useMemo } from 'react'
import jsPDF from 'jspdf'
import type { Employee, AvailabilityForecast } from '../data/employees'

const MIYA_NAME = 'מיה'
const WEEKS_AHEAD = 12

// Standard shift slots per day (excluding Miya for morning)
// This mirrors WeeklyBoard SLOT_DEFAULTS
const REQUIRED_PER_DAY = {
  'ראשון':  { 'בוקר': 2, 'ערב': 2 }, // 1 + Miya, 2 evening
  'שני':    { 'בוקר': 2, 'ערב': 2 },
  'שלישי':  { 'בוקר': 2, 'ערב': 2 },
  'רביעי':  { 'בוקר': 2, 'ערב': 3 },
  'חמישי':  { 'בוקר': 4, 'ערב': 3 }, // 3 + Miya = 4, 3 evening
  'שישי':   { 'בוקר': 6, 'ערב': 0 }, // 5 + Miya = 6
}

const DAYS: (keyof typeof REQUIRED_PER_DAY)[] = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']

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

// ═══ Employee availability logic ═══

function isActiveOnDay(emp: Employee, dateISO: string): boolean {
  if (emp.name === MIYA_NAME) return false // Miya doesn't count as "additional"
  if (emp.isTrainee) return false
  const startDate = emp.shiftsStart || emp.availableFromDate
  if (startDate && dateISO < startDate) return false
  if (emp.availableToDate && dateISO > emp.availableToDate) return false
  if (emp.expectedDeparture && dateISO > emp.expectedDeparture) return false
  return true
}

function isInTraining(emp: Employee, dateISO: string): boolean {
  if (!emp.trainingStart) return false
  const shiftsDate = emp.shiftsStart || emp.availableFromDate || ''
  return dateISO >= emp.trainingStart && (!shiftsDate || dateISO < shiftsDate)
}

function isOnVacation(emp: Employee, dateISO: string): boolean {
  return (emp.vacationPeriods || []).some(v => v.from <= dateISO && v.to >= dateISO)
}

function getForecast(emp: Employee, dateISO: string): AvailabilityForecast | undefined {
  return (emp.availabilityForecasts || []).find(f => f.period_from <= dateISO && f.period_to >= dateISO)
}

/**
 * For a given employee and week, estimate expected shifts that week
 * (uses override, forecast, or default shiftsPerWeek).
 */
function expectedShiftsThisWeek(emp: Employee, weekStartISO: string, weekEndISO: string): number {
  if (!isActiveOnDay(emp, weekEndISO)) return 0
  if (isInTraining(emp, weekStartISO)) return 0
  if (isOnVacation(emp, weekStartISO) && isOnVacation(emp, weekEndISO)) return 0

  const override = emp.forecastOverrides?.[weekStartISO]
  if (override) return override.shifts

  const fc = getForecast(emp, weekStartISO) || getForecast(emp, weekEndISO)
  if (fc) return fc.expected_shifts

  return emp.shiftsPerWeek
}

function isAvailableForShift(emp: Employee, shift: 'בוקר' | 'ערב'): boolean {
  if (shift === 'בוקר') {
    return emp.shiftType === 'הכל' || emp.shiftType === 'בוקר'
  }
  return emp.shiftType === 'הכל' || emp.shiftType === 'ערב'
}

function fridayAvailable(emp: Employee, weekStartISO: string): boolean {
  const override = emp.forecastOverrides?.[weekStartISO]
  if (override) return override.friday
  const fc = getForecast(emp, weekStartISO)
  if (fc) return fc.friday_available
  return emp.fridayAvailability !== 'never'
}

// ═══ Gap calculation ═══

interface Gap {
  day: string
  shift: 'בוקר' | 'ערב'
  required: number        // total required across 12 weeks
  covered: number         // total covered
  gap: number             // required - covered
}

function calculateGaps(employees: Employee[]): { gaps: Gap[]; totalGap: number; fridayGap: number } {
  const gaps: Gap[] = []
  const now = new Date()
  const sunday = getSunday(now)

  for (const day of DAYS) {
    const dayIdx = DAYS.indexOf(day)
    for (const shift of ['בוקר', 'ערב'] as const) {
      const req = REQUIRED_PER_DAY[day][shift]
      if (req === 0) continue

      let totalRequired = 0
      let totalCovered = 0

      for (let w = 0; w < WEEKS_AHEAD; w++) {
        const weekStart = addDays(sunday, w * 7)
        const weekStartISO = toISO(weekStart)
        const weekEndISO = toISO(addDays(weekStart, 5))
        const thisDayISO = toISO(addDays(weekStart, dayIdx))

        totalRequired += req

        // Count employees available for this day/shift this week
        for (const emp of employees) {
          if (emp.name === MIYA_NAME) continue
          if (!isAvailableForShift(emp, shift)) continue
          if (!isActiveOnDay(emp, thisDayISO)) continue
          if (isInTraining(emp, thisDayISO)) continue
          if (isOnVacation(emp, thisDayISO)) continue

          // Proportional coverage: employee's weekly shifts / total shift slots available to them
          const empExpected = expectedShiftsThisWeek(emp, weekStartISO, weekEndISO)
          if (empExpected === 0) continue

          // For friday — additional check
          if (day === 'שישי' && !fridayAvailable(emp, weekStartISO)) continue

          // Count this employee as covering 1 shift in this day×shift (simplified)
          // More accurate: split empExpected across their available days
          const availableDays = DAYS.filter(d => {
            if (d === 'שישי') return fridayAvailable(emp, weekStartISO)
            return true
          }).length
          totalCovered += empExpected / (availableDays * (emp.shiftType === 'הכל' ? 2 : 1))
        }
      }

      gaps.push({
        day, shift,
        required: totalRequired,
        covered: Math.round(totalCovered),
        gap: Math.max(0, totalRequired - Math.round(totalCovered)),
      })
    }
  }

  const totalGap = gaps.reduce((sum, g) => sum + g.gap, 0)
  const fridayGap = gaps.filter(g => g.day === 'שישי').reduce((sum, g) => sum + g.gap, 0)

  return { gaps, totalGap, fridayGap }
}

// ═══ Profile recommendation ═══

interface RecommendedProfile {
  shiftType: 'הכל' | 'בוקר' | 'ערב'
  friday: 'always' | 'biweekly' | 'never'
  fridayCritical: boolean
  weeklyShifts: number
  topDays: string[]
  startBy: string
}

function buildProfile(
  gaps: Gap[],
  totalGap: number,
  fridayGap: number,
  employees: Employee[]
): RecommendedProfile {
  // Split gaps by shift type
  const morningGap = gaps.filter(g => g.shift === 'בוקר').reduce((s, g) => s + g.gap, 0)
  const eveningGap = gaps.filter(g => g.shift === 'ערב').reduce((s, g) => s + g.gap, 0)

  let shiftType: RecommendedProfile['shiftType'] = 'הכל'
  if (morningGap > eveningGap * 2) shiftType = 'בוקר'
  else if (eveningGap > morningGap * 2) shiftType = 'ערב'

  // Friday criticality
  const fridayCritical = fridayGap >= 6 // 6+ shifts missing over 12 weeks = at least half
  const friday: RecommendedProfile['friday'] = fridayCritical ? 'always' : fridayGap >= 3 ? 'biweekly' : 'never'

  // Top days by gap
  const dayGapMap: Record<string, number> = {}
  for (const g of gaps) {
    dayGapMap[g.day] = (dayGapMap[g.day] || 0) + g.gap
  }
  const topDays = Object.entries(dayGapMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([, v]) => v > 0)
    .map(([day]) => day)

  // Weekly shifts recommendation: average weekly gap
  const weeklyShifts = Math.min(6, Math.max(2, Math.round(totalGap / WEEKS_AHEAD)))

  // Start date — find first week with significant gap
  const now = new Date()
  const sunday = getSunday(now)
  let startBy = toISO(sunday)
  // Find employees departing soon
  const departingSoon = employees
    .filter(e => (e.expectedDeparture || e.availableToDate) && (e.expectedDeparture || e.availableToDate) > toISO(now))
    .sort((a, b) => (a.expectedDeparture || a.availableToDate || '').localeCompare(b.expectedDeparture || b.availableToDate || ''))
  if (departingSoon.length > 0) {
    const firstDeparture = departingSoon[0].expectedDeparture || departingSoon[0].availableToDate || ''
    // Start training 2 weeks before first departure
    const dep = new Date(firstDeparture)
    dep.setDate(dep.getDate() - 14)
    if (dep > now) startBy = toISO(dep)
    else startBy = toISO(now)
  }

  return { shiftType, friday, fridayCritical, weeklyShifts, topDays, startBy }
}

// ═══ Departure alerts ═══

interface DepartureAlert {
  name: string
  date: string
  weeklyShifts: number
  note: string
}

function buildAlerts(employees: Employee[]): DepartureAlert[] {
  const alerts: DepartureAlert[] = []
  const now = toISO(new Date())
  const soon = new Date()
  soon.setMonth(soon.getMonth() + 3)
  const soonISO = toISO(soon)

  for (const emp of employees) {
    if (emp.name === MIYA_NAME) continue

    const depDate = emp.expectedDeparture || emp.availableToDate
    if (depDate && depDate > now && depDate <= soonISO) {
      alerts.push({
        name: emp.name,
        date: fmtShort(depDate),
        weeklyShifts: emp.shiftsPerWeek,
        note: `עוזבת — חוסר של ${emp.shiftsPerWeek} משמרות/שבוע`,
      })
    }

    // Trainee check
    if (emp.trainingStart && emp.shiftsStart && emp.shiftsStart > now) {
      alerts.push({
        name: emp.name,
        date: fmtShort(emp.shiftsStart),
        weeklyShifts: 0,
        note: `בחפיפה עד ${fmtShort(emp.shiftsStart)} — לא נספרת עדיין`,
      })
    }
  }

  return alerts
}

// ═══ PDF export ═══

function exportToPDF(profile: RecommendedProfile, gaps: Gap[], alerts: DepartureAlert[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Hebrew support: jsPDF's default fonts don't render Hebrew well.
  // We'll use a simple approach — render as English transliteration for the PDF
  // but mostly use visual structure. For production, would need a Hebrew font.
  doc.setFontSize(16)
  doc.text('Hiring Recommendation - Noy HaSadeh', 105, 20, { align: 'center' })
  doc.setFontSize(11)
  doc.text('Generated: ' + new Date().toLocaleDateString('he-IL'), 105, 28, { align: 'center' })

  doc.setFontSize(13)
  let y = 45
  doc.text('Recommended Profile:', 20, y); y += 8
  doc.setFontSize(11)
  doc.text(`- Weekly shifts: ${profile.weeklyShifts}`, 25, y); y += 6
  doc.text(`- Shift type: ${profile.shiftType === 'הכל' ? 'All' : profile.shiftType === 'בוקר' ? 'Morning' : 'Evening'}`, 25, y); y += 6
  doc.text(`- Friday: ${profile.friday === 'always' ? 'Mandatory' : profile.friday === 'biweekly' ? 'Biweekly' : 'Not required'}`, 25, y); y += 6
  if (profile.fridayCritical) { doc.text('  (CRITICAL)', 60, y - 6); }
  doc.text(`- Top days: ${profile.topDays.join(', ')}`, 25, y); y += 6
  doc.text(`- Start by: ${fmtShort(profile.startBy)}`, 25, y); y += 10

  doc.setFontSize(13)
  doc.text('Shortage Details (12 weeks):', 20, y); y += 8
  doc.setFontSize(11)
  const sortedGaps = [...gaps].filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap)
  for (const g of sortedGaps.slice(0, 10)) {
    doc.text(`- ${g.day} ${g.shift}: ${g.gap} shifts missing`, 25, y)
    y += 6
    if (y > 270) { doc.addPage(); y = 20 }
  }

  if (alerts.length > 0) {
    y += 5
    doc.setFontSize(13)
    doc.text('Departure Alerts:', 20, y); y += 8
    doc.setFontSize(11)
    for (const a of alerts) {
      doc.text(`- ${a.name}: ${a.date} (${a.weeklyShifts} shifts/week)`, 25, y)
      y += 6
      if (y > 270) { doc.addPage(); y = 20 }
    }
  }

  doc.save('hiring-recommendation.pdf')
}

// ═══ Copy text to clipboard ═══

function buildJobText(profile: RecommendedProfile): string {
  const shiftLabel = profile.shiftType === 'הכל' ? 'בוקר / ערב' : profile.shiftType === 'בוקר' ? 'בוקר (07:00-15:00)' : 'ערב (14:00-21:00)'
  const fridayLabel = profile.friday === 'always' ? 'חובה' : profile.friday === 'biweekly' ? 'לסירוגין' : 'לא נדרש'

  return `דרושה עובדת לחנות פרחים "נוי השדה" — סניף שוהם

היקף עבודה:    ${profile.weeklyShifts} משמרות בשבוע
סוג משמרת:    ${shiftLabel}
שישי:         ${fridayLabel}${profile.fridayCritical ? ' ⚠' : ''}
ימים מועדפים: ${profile.topDays.join(', ')}
תאריך תחילה:  החל מ-${fmtShort(profile.startBy)}

תנאים נוספים:
• שכר לפי הסכם
• אווירה משפחתית וצוות נעים

ליצירת קשר: מיה פרייבך`
}

// ═══ Component ═══

interface HiringRecommendationProps {
  employees: Employee[]
}

export function HiringRecommendation({ employees }: HiringRecommendationProps) {
  const [open, setOpen] = useState(false)
  const [copyToast, setCopyToast] = useState(false)

  const { gaps, totalGap, fridayGap } = useMemo(() => calculateGaps(employees), [employees])
  const profile = useMemo(() => buildProfile(gaps, totalGap, fridayGap, employees), [gaps, totalGap, fridayGap, employees])
  const alerts = useMemo(() => buildAlerts(employees), [employees])

  const sortedGaps = useMemo(() =>
    [...gaps].filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap)
  , [gaps])

  const maxGap = Math.max(1, ...sortedGaps.map(g => g.gap))

  const copyJobText = async () => {
    try {
      await navigator.clipboard.writeText(buildJobText(profile))
      setCopyToast(true)
      setTimeout(() => setCopyToast(false), 2200)
    } catch { /* ignore */ }
  }

  const shiftTypeLabel = profile.shiftType === 'הכל' ? 'בוקר / ערב' : profile.shiftType
  const fridayLabel = profile.friday === 'always' ? 'חובה' : profile.friday === 'biweekly' ? 'לסירוגין' : 'לא נדרש'

  return (
    <div style={{ marginTop: 20 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'white', border: '1px solid #e8e0d4', borderRadius: 10,
          padding: '12px 16px', cursor: 'pointer', width: '100%',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1a4a2e' }}>💡 איזו עובדת כדאי לגייס?</span>
        {totalGap > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
            background: '#fee2e2', color: '#dc2626',
          }}>חוסר: {totalGap} משמרות</span>
        )}
        <span style={{ marginRight: 'auto', fontSize: 16, color: '#1a4a2e', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>

      {open && (
        <div style={{
          background: 'white', border: '1px solid #e8e0d4', borderTop: 'none',
          borderRadius: '0 0 10px 10px', padding: 20,
        }}>

          {/* ═══ Recommended Profile ═══ */}
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1A3008' }}>
            🎯 פרופיל מומלץ לגיוס
          </h3>

          <div style={{
            background: '#f8f7f4', borderRadius: 10, padding: 16, marginBottom: 18,
            border: '1px solid #e8e0d4',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 16px', fontSize: 14 }}>
              <span style={{ color: '#6b7280', fontWeight: 500 }}>היקף עבודה:</span>
              <strong style={{ color: '#1a4a2e' }}>{profile.weeklyShifts} משמרות בשבוע</strong>

              <span style={{ color: '#6b7280', fontWeight: 500 }}>סוג משמרת:</span>
              <strong style={{ color: '#1a4a2e' }}>
                {shiftTypeLabel}
                {profile.shiftType === 'ערב' && <span style={{ color: '#c17f3b', fontSize: 12, marginRight: 8 }}>⚠ חסר במיוחד בערב</span>}
                {profile.shiftType === 'בוקר' && <span style={{ color: '#c17f3b', fontSize: 12, marginRight: 8 }}>⚠ חסר במיוחד בבוקר</span>}
              </strong>

              <span style={{ color: '#6b7280', fontWeight: 500 }}>שישי:</span>
              <strong style={{ color: profile.fridayCritical ? '#dc2626' : '#1a4a2e' }}>
                {fridayLabel}
                {profile.fridayCritical && <span style={{ marginRight: 6, fontSize: 12 }}>🔥 קריטי</span>}
              </strong>

              <span style={{ color: '#6b7280', fontWeight: 500 }}>ימים מועדפים:</span>
              <strong style={{ color: '#1a4a2e' }}>
                {profile.topDays.length > 0 ? profile.topDays.join(' · ') : 'אין חוסרים משמעותיים'}
              </strong>

              <span style={{ color: '#6b7280', fontWeight: 500 }}>תאריך תחילה:</span>
              <strong style={{ color: '#1a4a2e' }}>לא יאוחר מ-{fmtShort(profile.startBy)}</strong>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={copyJobText}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: '#1a4a2e', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >📋 העתק תיאור משרה</button>
              <button
                onClick={() => exportToPDF(profile, gaps, alerts)}
                style={{
                  padding: '10px 16px', borderRadius: 8,
                  background: 'white', color: '#1a4a2e', border: '1px solid #1a4a2e',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >📄 ייצוא ל-PDF</button>
            </div>
          </div>

          {/* ═══ Shortage Details Table ═══ */}
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1A3008' }}>
            📊 פירוט חוסרים — איפה הכי חסר
          </h3>

          {sortedGaps.length === 0 ? (
            <div style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 10, padding: 14, fontSize: 13, fontWeight: 600 }}>
              ✓ אין חוסרים משמעותיים ב-12 השבועות הקרובים
            </div>
          ) : (
            <div style={{ border: '1px solid #e8e0d4', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1a4a2e', color: 'white' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>יום</th>
                    <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600 }}>משמרת</th>
                    <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, minWidth: 80 }}>חסר</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>חומרה</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGaps.map((g, i) => {
                    const severity = g.gap >= 8 ? 'קריטי' : g.gap >= 4 ? 'גבוה' : g.gap >= 2 ? 'בינוני' : 'נמוך'
                    const sevColor = g.gap >= 8 ? '#dc2626' : g.gap >= 4 ? '#c17f3b' : g.gap >= 2 ? '#ca8a04' : '#6b7280'
                    const barWidth = (g.gap / maxGap) * 100
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#fafaf7' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, borderBottom: '1px solid #e8e0d4' }}>{g.day}</td>
                        <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e8e0d4' }}>{g.shift}</td>
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700, color: sevColor, borderBottom: '1px solid #e8e0d4' }}>
                          −{g.gap}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #e8e0d4' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, height: 8, background: '#f0ebe3', borderRadius: 999, overflow: 'hidden', maxWidth: 200 }}>
                              <div style={{ width: `${barWidth}%`, height: '100%', background: sevColor }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: sevColor, minWidth: 50 }}>{severity}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ padding: '8px 14px', fontSize: 11, color: '#6b7280', background: '#fafaf7', borderTop: '1px solid #e8e0d4' }}>
                * המספרים: סה"כ משמרות חסרות ב-12 השבועות הקרובים
              </div>
            </div>
          )}

          {/* ═══ Departure Alerts ═══ */}
          {alerts.length > 0 && (
            <>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1A3008' }}>
                ⚠ התראות גיוס
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{
                    background: '#FEF3E2', borderRadius: 8, padding: '10px 14px',
                    border: '1px solid #F5D5A0', fontSize: 13, color: '#1a1a1a',
                  }}>
                    <strong style={{ color: '#c17f3b' }}>{a.name}:</strong> {a.note} <span style={{ color: '#6b7280' }}>({a.date})</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Toast */}
          {copyToast && (
            <div style={{
              position: 'fixed', bottom: 24, right: '50%', transform: 'translateX(50%)',
              background: '#1a4a2e', color: 'white', padding: '10px 20px', borderRadius: 10,
              fontSize: 14, fontWeight: 600, zIndex: 10001,
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}>
              הטקסט הועתק ✓
            </div>
          )}
        </div>
      )}
    </div>
  )
}

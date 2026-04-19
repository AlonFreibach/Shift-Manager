import { useState, useMemo } from 'react'
import { ISRAELI_HOLIDAYS, type IsraeliHoliday } from '../data/holidays'

// ═══ Hebrew date conversion (simplified) ═══
// Static mapping for the next ~2 years of Israeli holidays.
// We don't compute hebrew dates for all days — only for known holidays (they already have known hebrew dates).
const HEBREW_DATES: Record<string, string> = {
  '2026-03-02': 'י"ג אדר ה\'תשפ"ו',
  '2026-03-03': 'י"ד אדר',
  '2026-03-04': 'ט"ו אדר',
  '2026-04-01': 'י"ד ניסן',
  '2026-04-02': 'ט"ו ניסן',
  '2026-04-03': 'ט"ז ניסן',
  '2026-04-04': 'י"ז ניסן',
  '2026-04-05': 'י"ח ניסן',
  '2026-04-06': 'י"ט ניסן',
  '2026-04-07': 'כ\' ניסן',
  '2026-04-08': 'כ"א ניסן',
  '2026-04-15': 'כ"ח ניסן',
  '2026-04-16': 'כ"ט ניסן',
  '2026-04-21': 'ד\' אייר',
  '2026-04-22': 'ה\' אייר',
  '2026-04-23': 'ו\' אייר',
  '2026-05-05': 'י"ח אייר',
  '2026-05-12': 'ה\' סיון',
  '2026-05-13': 'ו\' סיון',
  '2026-05-15': 'כ"ח אייר',
  '2026-07-23': 'ט\' אב',
  '2026-09-11': 'כ"ט אלול',
  '2026-09-12': 'א\' תשרי ה\'תשפ"ז',
  '2026-09-13': 'ב\' תשרי',
  '2026-09-20': 'ט\' תשרי',
  '2026-09-21': 'י\' תשרי',
  '2026-09-25': 'י"ד תשרי',
  '2026-09-26': 'ט"ו תשרי',
  '2026-09-27': 'ט"ז תשרי',
  '2026-09-28': 'י"ז תשרי',
  '2026-09-29': 'י"ח תשרי',
  '2026-09-30': 'י"ט תשרי',
  '2026-10-01': 'כ\' תשרי',
  '2026-10-02': 'כ"א תשרי',
  '2026-10-03': 'כ"ב תשרי',
  '2026-12-14': 'כ"ה כסלו',
  '2026-12-21': 'ג\' טבת',
  '2027-01-22': 'ט"ו שבט ה\'תשפ"ז',
  '2027-03-22': 'י"ד אדר',
  '2027-03-23': 'ט"ו אדר',
  '2027-04-20': 'י"ד ניסן',
  '2027-04-21': 'ט"ו ניסן',
  '2027-04-22': 'ט"ז ניסן',
  '2027-04-23': 'י"ז ניסן',
  '2027-04-24': 'י"ח ניסן',
  '2027-04-25': 'י"ט ניסן',
  '2027-04-26': 'כ\' ניסן',
  '2027-04-27': 'כ"א ניסן',
  '2027-05-04': 'כ"ז ניסן',
  '2027-05-05': 'כ"ח ניסן',
  '2027-05-10': 'ג\' אייר',
  '2027-05-11': 'ד\' אייר',
  '2027-05-12': 'ה\' אייר',
  '2027-05-31': 'כ"ד אייר',
  '2027-06-01': 'כ"ה אייר',
  '2027-09-01': 'א\' תשרי ה\'תשפ"ח',
  '2027-09-02': 'ב\' תשרי',
  '2027-09-09': 'ט\' תשרי',
  '2027-09-14': 'י"ד תשרי',
  '2027-09-21': 'כ"ב תשרי',
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function dayOfWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return DAY_NAMES[date.getDay()]
}

// Standard slots per day (Sun-Fri) — matches ForecastTab SLOTS_PER_DAY
const SLOTS_PER_DAY = [4, 4, 4, 5, 7, 6]
const FRIDAY_SLOTS = 6

// Compute the impact of a holiday on the weekly standard
function computeImpact(h: IsraeliHoliday): {
  shortLabel: string
  delta: number         // change to weekly standard (positive = more, negative = less)
  isInfoOnly: boolean
  explanation: string
} {
  const [y, m, d] = h.date.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  const dow = dateObj.getDay() // 0=Sun, 5=Fri, 6=Sat

  if (h.type === 'holiday') {
    // Closed day — subtract that day's slots
    const daySlots = dow < 6 ? SLOTS_PER_DAY[dow] : 0
    return {
      shortLabel: 'סגור',
      delta: -daySlots,
      isInfoOnly: false,
      explanation: `החנות סגורה — יורדות ${daySlots} משמרות של אותו יום`,
    }
  }
  if (h.type === 'holiday_eve') {
    // Treated as Friday — 6 morning slots instead of normal
    if (dow >= 5) {
      return { shortLabel: 'כמו שישי', delta: 0, isInfoOnly: false, explanation: 'ערב חג ביום שישי — ללא שינוי (ממילא כמו שישי)' }
    }
    const normalSlots = SLOTS_PER_DAY[dow]
    const delta = FRIDAY_SLOTS - normalSlots
    const sign = delta > 0 ? '+' : ''
    return {
      shortLabel: 'כמו שישי',
      delta,
      isInfoOnly: false,
      explanation: `יום הופך להיות כמו שישי: 6 משמרות בוקר (במקום ${normalSlots})${delta !== 0 ? ` → ${sign}${delta} משמרות לשבוע` : ''}`,
    }
  }
  // memorial
  return {
    shortLabel: 'יום רגיל',
    delta: 0,
    isInfoOnly: true,
    explanation: 'לידיעה — ללא צורך בשינוי',
  }
}

function fmtGregorian(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}`
}

// Filter holidays to next 12 months from today
function relevantHolidays(): IsraeliHoliday[] {
  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const endDate = new Date(today)
  endDate.setMonth(endDate.getMonth() + 12)
  const endISO = endDate.toISOString().slice(0, 10)

  return ISRAELI_HOLIDAYS
    .filter(h => h.date >= todayISO && h.date <= endISO)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ═══ Component ═══

export function SpecialDaysBoard() {
  const [open, setOpen] = useState(false)
  const holidays = useMemo(relevantHolidays, [])

  if (holidays.length === 0) return null

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
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1a4a2e' }}>
          📅 לוח ימים מיוחדים — ההיגיון מאחורי התחזית
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
          background: '#e5e7eb', color: '#6b7280', marginRight: 4,
        }}>
          {holidays.length} מועדים
        </span>
        <span style={{ marginRight: 'auto', fontSize: 16, color: '#1a4a2e', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>

      {open && (
        <div style={{
          background: 'white', border: '1px solid #e8e0d4', borderTop: 'none',
          borderRadius: '0 0 10px 10px', padding: 0,
        }}>
          <div style={{
            padding: '14px 18px', fontSize: 13, color: '#6b7280',
            background: '#f8f7f4', borderBottom: '1px solid #e8e0d4',
            lineHeight: 1.5,
          }}>
            הטבלה מציגה את כל החגים והמועדים ב-12 החודשים הקרובים, ואת ההיגיון לפיו המערכת מחשבת את "רצוי" בטבלה הגדולה.
            <br />
            <strong>התצוגה הזו לידיעה בלבד</strong> — שינויים ידניים מתבצעים ב"רצוי" של הטבלה הגדולה.
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1a4a2e', color: 'white' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>תאריך לועזי</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>יום</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>תאריך עברי</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>שם המועד</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>סיווג</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>השפעה</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>הסבר</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h, i) => {
                  const impact = computeImpact(h)
                  const dow = dayOfWeek(h.date)
                  const hebDate = HEBREW_DATES[h.date] || '—'
                  const bg = i % 2 === 0 ? 'white' : '#fafaf7'
                  const typeIcon = h.type === 'holiday' ? '🔴' : h.type === 'holiday_eve' ? '🟡' : '⚪'
                  const typeLabel = h.type === 'holiday' ? 'חג' : h.type === 'holiday_eve' ? 'ערב חג' : 'מועד'

                  return (
                    <tr key={h.date + i} style={{ background: bg }}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8e0d4', fontWeight: 500 }}>
                        {fmtGregorian(h.date)}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8e0d4', color: '#6b7280' }}>
                        {dow}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8e0d4', color: '#6b7280', fontSize: 12 }}>
                        {hebDate}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8e0d4', fontWeight: 600, color: '#1A3008' }}>
                        {h.name}
                        {h.demand === 'peak' && <span style={{ fontSize: 10, marginRight: 6, padding: '1px 5px', borderRadius: 999, background: '#dc2626', color: 'white', fontWeight: 700 }}>פסגה</span>}
                        {h.demand === 'high' && <span style={{ fontSize: 10, marginRight: 6, padding: '1px 5px', borderRadius: 999, background: '#f59e0b', color: 'white', fontWeight: 700 }}>גבוה</span>}
                        {h.demand === 'low' && <span style={{ fontSize: 10, marginRight: 6, padding: '1px 5px', borderRadius: 999, background: '#6b7280', color: 'white', fontWeight: 700 }}>נמוך</span>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e0d4' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: impact.isInfoOnly ? '#f3f4f6' : h.type === 'holiday' ? '#fee2e2' : '#FEF3E2', color: impact.isInfoOnly ? '#6b7280' : h.type === 'holiday' ? '#dc2626' : '#c17f3b' }}>
                          {typeIcon} {typeLabel}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e8e0d4', fontSize: 13, fontWeight: 700, color: impact.delta > 0 ? '#16a34a' : impact.delta < 0 ? '#dc2626' : '#6b7280' }}>
                        {impact.delta === 0 ? '—' : `${impact.delta > 0 ? '+' : ''}${impact.delta} משמרות`}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8e0d4', fontSize: 12, color: impact.isInfoOnly ? '#9ca3af' : '#475569', fontStyle: impact.isInfoOnly ? 'italic' : 'normal' }}>
                        {impact.explanation}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

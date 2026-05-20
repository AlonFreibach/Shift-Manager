import type { Employee } from '../data/employees'

interface Slot {
  employeeId: string | null
  arrivalTime: string
  departureTime: string
  station: string
  locked?: boolean
  isFixed?: boolean
  voltResponsible?: boolean
}

type Schedule = Record<string, Slot[]>

interface CustomShiftDef {
  name: string
  day: string
  startTime: string
  endTime: string
  requiredCount: number
}

const WEEK_STRUCTURE = [
  { day: 'ראשון', shifts: ['בוקר', 'ערב'] },
  { day: 'שני',   shifts: ['בוקר', 'ערב'] },
  { day: 'שלישי', shifts: ['בוקר', 'ערב'] },
  { day: 'רביעי', shifts: ['בוקר', 'ערב'] },
  { day: 'חמישי', shifts: ['בוקר', 'ערב'] },
  { day: 'שישי',  shifts: ['בוקר'] },
]

function isBirthdayOnDate(birthday: string | undefined, date: Date): boolean {
  if (!birthday) return false
  const parts = birthday.split('/')
  if (parts.length !== 2) return false
  const bd = parseInt(parts[0], 10)
  const bm = parseInt(parts[1], 10)
  return date.getDate() === bd && (date.getMonth() + 1) === bm
}

export function printSchedule(weekKeys: string[], employees: Employee[]): void {
  try {
    const allKeys = [...weekKeys].sort()
    if (allKeys.length === 0) { alert('אין שבועות שמורים'); return }

    const stBadge = (station: string) => {
      if (!station) return ''
      let bg = '#EAF3DE', color = '#3B6D11'
      if (station === 'וולט') { bg = '#E6F1FB'; color = '#185FA5' }
      else if (station === 'התלמדות') { bg = '#EEEDFE'; color = '#534AB7' }
      else if (station === 'אחר') { bg = '#F1EFE8'; color = '#5F5E5A' }
      else if (station.startsWith('אקסטרה')) { bg = '#FEF3E2'; color = '#92400E' }
      else if (!station.startsWith('קופה')) { bg = '#F1EFE8'; color = '#5F5E5A' }
      const label = station === 'קופה 1' ? 'ק1' : station === 'קופה 2' ? 'ק2' : station === 'קופה 3' ? 'ק3' : station === 'קופה 4' ? 'ק4' : station === 'וולט' ? 'וולט' : station === 'התלמדות' ? 'התלמדות' : station === 'אחר' ? 'אחר' : station.startsWith('אקסטרה') ? station.replace('אקסטרה ', 'X') : station
      return `<span style="display:inline-block;font-size:10px;padding:1px 6px;border-radius:999px;background:${bg};color:${color};font-weight:500;margin-top:1px">${label}</span>`
    }

    const slotCard = (s: Slot, isMorning: boolean) => {
      const name = (s.locked && s.employeeId !== null) ? 'מיה' : employees.find(e => e.id === s.employeeId)?.name || '?'
      const borderColor = isMorning ? '#3B6D11' : '#B07820'
      const textColor = isMorning ? '#2D5016' : '#854F0B'
      const badge = stBadge(s.station)
      return `<div style="background:#fff;border-radius:6px;padding:4px 6px;margin-bottom:3px;border:0.5px solid #C8D8A0;border-right:3px solid ${borderColor}">
        <div style="font-size:15px;font-weight:700;color:${textColor}">${s.arrivalTime || '—'}–${s.departureTime || '—'}</div>
        <div style="font-size:12px;font-weight:600;color:${textColor}">${name}</div>
        ${badge ? `<div>${badge}</div>` : ''}
        ${(s.voltResponsible || (!s.locked && s.station === 'קופה 1' && s.voltResponsible !== false)) ? '<div style="font-size:9px;font-weight:700;color:#7c3aed;background:#f3e8ff;padding:1px 5px;border-radius:4px;display:inline-block;margin-top:2px">וולט</div>' : ''}
      </div>`
    }

    let pages = ''
    for (const wk of allKeys) {
      const sunday = new Date(wk + 'T00:00:00')
      const friday = new Date(sunday.getTime() + 5 * 86400000)
      const dateRange = `${sunday.getDate()}.${sunday.getMonth() + 1} – ${friday.getDate()}.${friday.getMonth() + 1}.${sunday.getFullYear()}`

      const savedSched: Schedule = JSON.parse(localStorage.getItem(`schedule_${wk}`) || '{}')
      const savedCS: Record<string, CustomShiftDef[]> = JSON.parse(localStorage.getItem(`customShifts_${wk}`) || '{}')

      const customNames = new Set<string>()
      for (const defs of Object.values(savedCS)) {
        for (const cs of defs) customNames.add(cs.name)
      }
      const customSorted = [...customNames].sort((a, b) => {
        const getStart = (n: string) => { for (const ds of Object.values(savedCS)) { const c = ds.find(x => x.name === n); if (c) return c.startTime } return '99:99' }
        return getStart(a).localeCompare(getStart(b))
      })
      const shiftRows: { name: string; isCustom: boolean }[] = [
        { name: 'בוקר', isCustom: false },
        ...customSorted.map(n => ({ name: n, isCustom: true })),
        { name: 'ערב', isCustom: false },
      ]

      const dayDates: string[] = []
      for (let i = 0; i < 6; i++) {
        const d = new Date(sunday.getTime() + i * 86400000)
        dayDates.push(`${d.getDate()}.${d.getMonth() + 1}`)
      }
      const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']

      let thead = '<tr>'
      thead += '<th style="width:60px;background:#2D5016;color:#F5EFD8;font-size:12px;font-weight:700;padding:8px 4px;text-align:center">משמרת</th>'
      for (let i = 0; i < 6; i++) {
        thead += `<th style="width:calc((100% - 60px)/6);background:#2D5016;color:#F5EFD8;font-size:12px;font-weight:700;padding:8px 4px;text-align:center">${dayNames[i]}<br><span style="font-weight:400;font-size:11px">${dayDates[i]}</span></th>`
      }
      thead += '</tr>'

      let tbody = ''
      for (const sr of shiftRows) {
        const isMorning = sr.name === 'בוקר'
        const isEvening = sr.name === 'ערב'
        const shiftLabelBg = isMorning ? '#3B6D11' : isEvening ? '#854F0B' : '#B07820'
        const cellBg = isMorning ? '#F0F7E6' : isEvening ? '#FDF6E3' : '#FFF7ED'
        const borderTopColor = isMorning ? '#D4E8A8' : isEvening ? '#E8D8A0' : '#FCEBC8'

        tbody += '<tr>'
        tbody += `<td style="background:${shiftLabelBg};color:#F5EFD8;font-weight:700;font-size:12px;text-align:center;padding:6px 2px;writing-mode:vertical-rl;border-top:1px solid ${borderTopColor}">${sr.name}</td>`

        for (let di = 0; di < 6; di++) {
          const day = dayNames[di]
          const dayHasShift = sr.isCustom
            ? (savedCS[day] || []).some(cs => cs.name === sr.name)
            : (WEEK_STRUCTURE.find(w => w.day === day)?.shifts.includes(sr.name) ?? false)

          if (day === 'שישי' && isEvening) {
            tbody += `<td style="background:#F5F0E8;text-align:center;vertical-align:middle;padding:6px;border-top:1px solid ${borderTopColor};font-size:11px;color:#94a3b8">אין ערב בשישי</td>`
            continue
          }

          if (!dayHasShift) {
            tbody += `<td style="background:${cellBg};text-align:center;vertical-align:top;padding:6px;border-top:1px solid ${borderTopColor};color:#bbb">—</td>`
            continue
          }

          const key = `${day}_${sr.name}`
          const slots: Slot[] = savedSched[key] || []
          const assigned = slots.filter(s => s.employeeId !== null)
          const smallFont = assigned.length > 6

          let cellContent = ''
          if (assigned.length === 0) {
            cellContent = '<span style="color:#ccc;font-size:11px">—</span>'
          } else {
            for (const s of assigned) {
              cellContent += slotCard(s, isMorning || sr.isCustom)
            }
          }

          if (isMorning) {
            const dayDateObj = new Date(sunday.getTime() + di * 86400000)
            const birthdayEmps = employees.filter(e => isBirthdayOnDate(e.birthday, dayDateObj))
            for (const be of birthdayEmps) {
              cellContent += `<div style="margin-top:3px;padding:2px 6px;background:#FEF3E2;border-radius:4px;font-size:10px;color:#c17f3b;font-weight:600;text-align:center">🎂 יום הולדת ${be.name}</div>`
            }
          }

          tbody += `<td style="background:${cellBg};vertical-align:top;padding:4px;border-top:1px solid ${borderTopColor}${smallFont ? ';font-size:10px' : ''}">${cellContent}</td>`
        }
        tbody += '</tr>'
      }

      const now = new Date()
      const printDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

      pages += `<div class="week-page">
        <div style="background:#2D5016;border-radius:10px;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div style="font-size:22px;font-weight:700;color:#F5EFD8">נוי השדה — סניף שוהם</div>
            <div style="font-size:13px;color:#A8C97A">לוח שיבוץ משמרות</div>
          </div>
          <div style="font-size:15px;color:#F5EFD8;font-weight:500;text-align:left">${dateRange}</div>
        </div>
        <table style="width:100%;border-collapse:separate;border-spacing:0;border:1.5px solid #C8D8A0;border-radius:10px;overflow:hidden;table-layout:fixed">
          <thead>${thead}</thead>
          <tbody>${tbody}</tbody>
        </table>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:0 4px">
          <div style="font-size:11px;color:#888">הודפס: ${printDate}</div>
          <div style="display:flex;gap:12px;align-items:center;font-size:11px;color:#555">
            <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#F0F7E6;border:1px solid #D4E8A8"></span> בוקר</span>
            <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#FDF6E3;border:1px solid #E8D8A0"></span> ערב</span>
            <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#EEEDFE;border:1px solid #C5C3F0"></span> מתלמד/ת</span>
            <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#E6F1FB;border:1px solid #A8D0F0"></span> וולט</span>
          </div>
        </div>
      </div>`
    }

    const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>שיבוץ משמרות — נוי השדה — סניף שוהם</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; }
table { border-collapse: separate; border-spacing: 0; }
td, th { border: none; }
.week-page { padding: 12mm; }
.no-print { text-align: center; padding: 16px; }
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .week-page { padding: 0; page-break-after: always; }
  .week-page:last-child { page-break-after: avoid; }
  .no-print { display: none; }
}
</style></head><body>
<div class="no-print">
  <button onclick="window.print()" style="padding:10px 28px;font-size:15px;font-family:'Heebo',Arial,sans-serif;background:#2D5016;color:#F5EFD8;border:none;border-radius:8px;cursor:pointer;font-weight:700;margin:0 6px">🖨️ הדפס</button>
  <button onclick="window.close()" style="padding:10px 28px;font-size:15px;font-family:'Heebo',Arial,sans-serif;background:#f5f0e8;color:#475569;border:1px solid #e8e0d4;border-radius:8px;cursor:pointer;font-weight:600;margin:0 6px">✕ סגור</button>
</div>
${pages}
</body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
    else alert('לא ניתן לפתוח חלון חדש. בדוק חוסם פופ-אפים.')
  } catch (err) {
    alert('שגיאה: ' + (err as any).message)
  }
}

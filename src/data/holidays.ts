export interface IsraeliHoliday {
  date: string
  name: string
  type: 'holiday' | 'holiday_eve' | 'memorial'
}

// type: 'holiday' = like Shabbat (no work), 'holiday_eve' = like Friday (short day),
// 'memorial' = regular work day (Yom HaShoah, Yom HaZikaron themselves)
// Memorial eves are 'holiday_eve' (short day like Friday)
export const ISRAELI_HOLIDAYS: IsraeliHoliday[] = [
  // 2026
  { date: '2026-03-13', name: 'שושן פורים', type: 'holiday' },
  { date: '2026-04-01', name: 'ערב פסח', type: 'holiday_eve' },
  { date: '2026-04-02', name: 'פסח א׳', type: 'holiday' },
  { date: '2026-04-03', name: 'חול המועד פסח', type: 'holiday' },
  { date: '2026-04-04', name: 'חול המועד פסח', type: 'holiday' },
  { date: '2026-04-05', name: 'חול המועד פסח', type: 'holiday' },
  { date: '2026-04-06', name: 'חול המועד פסח', type: 'holiday' },
  { date: '2026-04-07', name: 'חול המועד פסח', type: 'holiday' },
  { date: '2026-04-08', name: 'שביעי של פסח', type: 'holiday' },
  { date: '2026-04-15', name: 'ערב יום השואה', type: 'holiday_eve' },
  { date: '2026-04-16', name: 'יום השואה', type: 'memorial' },
  { date: '2026-04-21', name: 'ערב יום הזיכרון', type: 'holiday_eve' },
  { date: '2026-04-22', name: 'יום הזיכרון / ערב יום העצמאות', type: 'holiday_eve' },
  { date: '2026-04-23', name: 'יום העצמאות', type: 'holiday' },
  { date: '2026-05-12', name: 'ערב שבועות', type: 'holiday_eve' },
  { date: '2026-05-13', name: 'שבועות', type: 'holiday' },
  { date: '2026-08-11', name: 'תשעה באב', type: 'holiday' },
  { date: '2026-09-11', name: 'ערב ראש השנה', type: 'holiday_eve' },
  { date: '2026-09-12', name: 'ראש השנה א׳', type: 'holiday' },
  { date: '2026-09-13', name: 'ראש השנה ב׳', type: 'holiday' },
  { date: '2026-09-20', name: 'ערב יום כיפור', type: 'holiday_eve' },
  { date: '2026-09-21', name: 'יום כיפור', type: 'holiday' },
  { date: '2026-09-25', name: 'ערב סוכות', type: 'holiday_eve' },
  { date: '2026-09-26', name: 'סוכות א׳', type: 'holiday' },
  { date: '2026-09-27', name: 'חול המועד סוכות', type: 'holiday' },
  { date: '2026-09-28', name: 'חול המועד סוכות', type: 'holiday' },
  { date: '2026-09-29', name: 'חול המועד סוכות', type: 'holiday' },
  { date: '2026-09-30', name: 'חול המועד סוכות', type: 'holiday' },
  { date: '2026-10-01', name: 'חול המועד סוכות', type: 'holiday' },
  { date: '2026-10-02', name: 'הושענא רבה', type: 'holiday_eve' },
  { date: '2026-10-03', name: 'שמיני עצרת / שמחת תורה', type: 'holiday' },
  { date: '2026-12-14', name: 'חנוכה א׳', type: 'memorial' },
  { date: '2026-12-21', name: 'חנוכה ח׳', type: 'memorial' },
  // 2027
  { date: '2027-03-02', name: 'פורים', type: 'holiday' },
  { date: '2027-03-03', name: 'שושן פורים', type: 'holiday' },
  { date: '2027-04-20', name: 'ערב פסח', type: 'holiday_eve' },
  { date: '2027-04-21', name: 'פסח א׳', type: 'holiday' },
  { date: '2027-04-27', name: 'שביעי של פסח', type: 'holiday' },
  { date: '2027-05-04', name: 'ערב יום השואה', type: 'holiday_eve' },
  { date: '2027-05-05', name: 'יום השואה', type: 'memorial' },
  { date: '2027-05-10', name: 'ערב יום הזיכרון', type: 'holiday_eve' },
  { date: '2027-05-11', name: 'יום הזיכרון / ערב יום העצמאות', type: 'holiday_eve' },
  { date: '2027-05-12', name: 'יום העצמאות', type: 'holiday' },
  { date: '2027-05-31', name: 'ערב שבועות', type: 'holiday_eve' },
  { date: '2027-06-01', name: 'שבועות', type: 'holiday' },
  { date: '2027-09-01', name: 'ראש השנה א׳', type: 'holiday' },
  { date: '2027-09-02', name: 'ראש השנה ב׳', type: 'holiday' },
  { date: '2027-09-09', name: 'יום כיפור', type: 'holiday' },
  { date: '2027-09-14', name: 'סוכות א׳', type: 'holiday' },
  { date: '2027-09-21', name: 'שמיני עצרת / שמחת תורה', type: 'holiday' },
]

const holidayMap = new Map(ISRAELI_HOLIDAYS.map(h => [h.date, h]))

export function getHolidayInfo(dateISO: string): IsraeliHoliday | undefined {
  return holidayMap.get(dateISO)
}

// Returns how a date affects work scheduling:
// 'shabbat' = no work (holiday), 'friday' = short day (holiday eve), 'regular' = normal day (memorial / non-holiday)
export function getDateWorkType(dateISO: string): 'shabbat' | 'friday' | 'regular' {
  const d = new Date(dateISO)
  const dow = d.getDay() // 0=Sun, 5=Fri, 6=Sat
  if (dow === 6) return 'shabbat'
  if (dow === 5) return 'friday'
  const holiday = holidayMap.get(dateISO)
  if (!holiday) return 'regular'
  if (holiday.type === 'holiday') return 'shabbat'
  if (holiday.type === 'holiday_eve') return 'friday'
  return 'regular' // memorial days are regular work days
}

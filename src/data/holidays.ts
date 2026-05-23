export interface IsraeliHoliday {
  date: string
  name: string
  type: 'holiday' | 'holiday_eve' | 'memorial'
  /** Business demand level for fruit/vegetable retail (נוי השדה) */
  demand?: 'peak' | 'high' | 'normal' | 'low'
  /** Short note explaining the demand level for the manager */
  demandNote?: string
}

// ═══ Classification logic ═══
// 'holiday' = closed (like Shabbat) — official legal holidays per Hours of Work and Rest Law 1951
// 'holiday_eve' = short day (like Friday) — labor law typically shortens pre-holiday hours
// 'memorial' = regular work day (displayed for info) — memorial days, chol hamoed, minor holidays
//
// Demand levels (specific to fruit/vegetable retail — נוי השדה):
// 'peak'    = massive shopping day — strongly consider extra staff
// 'high'    = above-normal demand — consider extra morning/afternoon staff
// 'normal'  = typical day
// 'low'     = quieter than usual
export const ISRAELI_HOLIDAYS: IsraeliHoliday[] = [
  // ═══ 2026 ═══

  // March — Purim (legal: regular work day; demand: high for mishloach manot)
  { date: '2026-03-02', name: 'תענית אסתר', type: 'memorial', demand: 'high',
    demandNote: 'ערב פורים — הכנת משלוחי מנות, ביקוש גבוה' },
  { date: '2026-03-03', name: 'פורים', type: 'memorial', demand: 'peak',
    demandNote: 'פורים — פסגת ביקוש: פירות יבשים, אגוזים, פירות למשלוחי מנות' },
  { date: '2026-03-04', name: 'שושן פורים (ירושלים)', type: 'memorial', demand: 'normal' },

  // April — Passover
  { date: '2026-04-01', name: 'ערב פסח', type: 'holiday_eve', demand: 'peak',
    demandNote: 'ערב פסח — היום הכי עמוס בשנה: הכנות לסדר, פירות וירקות לסדר, ביעור חמץ' },
  { date: '2026-04-02', name: 'פסח א׳', type: 'holiday' },
  { date: '2026-04-03', name: 'חול המועד פסח', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד פסח — בישול יומי, אירוח משפחתי, ביקוש מוגבר' },
  { date: '2026-04-04', name: 'חול המועד פסח', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד פסח' },
  { date: '2026-04-05', name: 'חול המועד פסח', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד פסח' },
  { date: '2026-04-06', name: 'חול המועד פסח', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד פסח' },
  { date: '2026-04-07', name: 'חול המועד פסח — ערב שביעי', type: 'holiday_eve', demand: 'high',
    demandNote: 'ערב שביעי של פסח — הכנה לחג שני, ביקוש גבוה' },
  { date: '2026-04-08', name: 'שביעי של פסח', type: 'holiday' },

  // April — Memorial days (legal: regular work; demand: BBQ supplies for Yom HaAtzmaut)
  { date: '2026-04-13', name: 'ערב יום השואה', type: 'memorial', demand: 'normal' },
  { date: '2026-04-14', name: 'יום השואה', type: 'memorial', demand: 'normal' },
  { date: '2026-04-20', name: 'ערב יום הזיכרון', type: 'memorial', demand: 'normal' },
  { date: '2026-04-21', name: 'יום הזיכרון / ערב יום העצמאות', type: 'holiday_eve', demand: 'high',
    demandNote: 'ערב יום העצמאות — ביקוש מוגבר לירקות/פירות לעל האש' },
  // Per Mia's decision: יום העצמאות — open as a regular work day (not closed)
  { date: '2026-04-22', name: 'יום העצמאות', type: 'memorial', demand: 'high',
    demandNote: 'יום העצמאות — פתוח רגיל (החלטה של מיה). ביקוש גבוה — על האש, פיקניקים' },

  // May — Lag BaOmer, Yom Yerushalayim, Shavuot
  { date: '2026-05-05', name: 'ל"ג בעומר', type: 'memorial', demand: 'normal',
    demandNote: 'ל"ג בעומר — ביקוש מוגבר לעל האש' },
  { date: '2026-05-15', name: 'יום ירושלים', type: 'memorial', demand: 'normal' },
  { date: '2026-05-21', name: 'ערב שבועות', type: 'holiday_eve', demand: 'peak',
    demandNote: 'ערב שבועות — פירות וירקות למנות חלביות, סלטים, עוגות גבינה' },
  { date: '2026-05-22', name: 'שבועות', type: 'holiday' },

  // July — Tisha B'Av
  // תשעה באב: יום עבודה רגיל לחנות (החלטת מיה — לא ערב חג, לא מפחית תקן).
  { date: '2026-07-23', name: 'תשעה באב', type: 'memorial', demand: 'low',
    demandNote: 'תשעה באב — יום אבל, ביקוש נמוך (יום עבודה רגיל)' },

  // September — Tishrei holidays (Rosh Hashana, Yom Kippur, Sukkot)
  { date: '2026-09-11', name: 'ערב ראש השנה', type: 'holiday_eve', demand: 'peak',
    demandNote: 'ערב ראש השנה — פסגת ביקוש: סימנים, פירות לקערה, ירקות לארוחת חג' },
  { date: '2026-09-12', name: 'ראש השנה א׳', type: 'holiday' },
  { date: '2026-09-13', name: 'ראש השנה ב׳', type: 'holiday' },
  { date: '2026-09-20', name: 'ערב יום כיפור', type: 'holiday_eve', demand: 'high',
    demandNote: 'ערב יום כיפור — ארוחה מפסקת, ביקוש גבוה במיוחד בבוקר' },
  { date: '2026-09-21', name: 'יום כיפור', type: 'holiday' },
  { date: '2026-09-25', name: 'ערב סוכות', type: 'holiday_eve', demand: 'peak',
    demandNote: 'ערב סוכות — ירקות לסוכה, אירוח אורחים, ביקוש גבוה מאוד' },
  { date: '2026-09-26', name: 'סוכות א׳', type: 'holiday' },
  { date: '2026-09-27', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות — אירוח משפחתי, ביקוש מוגבר' },
  { date: '2026-09-28', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות' },
  { date: '2026-09-29', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות' },
  { date: '2026-09-30', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות' },
  { date: '2026-10-01', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות' },
  { date: '2026-10-02', name: 'הושענא רבה', type: 'holiday_eve', demand: 'high',
    demandNote: 'הושענא רבה — ערב שמיני עצרת, ביקוש גבוה' },
  { date: '2026-10-03', name: 'שמיני עצרת / שמחת תורה', type: 'holiday' },

  // December — Hanukkah (regular work days, moderate demand for doughnuts/accompaniments)
  { date: '2026-12-14', name: 'חנוכה א׳', type: 'memorial', demand: 'normal' },
  { date: '2026-12-21', name: 'חנוכה ח׳', type: 'memorial', demand: 'normal' },

  // ═══ 2027 ═══

  // January — Tu BiShvat (PEAK for fruit/vegetable shop!)
  { date: '2027-01-22', name: 'ט"ו בשבט', type: 'memorial', demand: 'peak',
    demandNote: 'ט"ו בשבט — חג האילנות, פסגת ביקוש לפירות יבשים ופירות טריים' },

  // March — Purim 2027 (5787 is a leap year — Purim falls on 14 Adar II)
  { date: '2027-03-22', name: 'תענית אסתר', type: 'memorial', demand: 'high',
    demandNote: 'ערב פורים — הכנת משלוחי מנות, ביקוש גבוה' },
  { date: '2027-03-23', name: 'פורים', type: 'memorial', demand: 'peak',
    demandNote: 'פורים — פסגת ביקוש: פירות יבשים, אגוזים, פירות למשלוחי מנות' },
  { date: '2027-03-24', name: 'שושן פורים (ירושלים)', type: 'memorial', demand: 'normal' },

  // April 2027 — Passover
  { date: '2027-04-21', name: 'ערב פסח', type: 'holiday_eve', demand: 'peak',
    demandNote: 'ערב פסח — היום הכי עמוס בשנה' },
  { date: '2027-04-22', name: 'פסח א׳', type: 'holiday' },
  { date: '2027-04-23', name: 'חול המועד פסח', type: 'memorial', demand: 'high' },
  { date: '2027-04-24', name: 'חול המועד פסח', type: 'memorial', demand: 'high' },
  { date: '2027-04-25', name: 'חול המועד פסח', type: 'memorial', demand: 'high' },
  { date: '2027-04-26', name: 'חול המועד פסח', type: 'memorial', demand: 'high' },
  { date: '2027-04-27', name: 'חול המועד פסח — ערב שביעי', type: 'holiday_eve', demand: 'high' },
  { date: '2027-04-28', name: 'שביעי של פסח', type: 'holiday' },

  // Memorial days 2027
  { date: '2027-05-03', name: 'ערב יום השואה', type: 'memorial', demand: 'normal' },
  { date: '2027-05-04', name: 'יום השואה', type: 'memorial', demand: 'normal' },
  { date: '2027-05-10', name: 'ערב יום הזיכרון', type: 'memorial', demand: 'normal' },
  { date: '2027-05-11', name: 'יום הזיכרון / ערב יום העצמאות', type: 'holiday_eve', demand: 'high' },
  // Per Mia's decision: יום העצמאות — open as a regular work day
  { date: '2027-05-12', name: 'יום העצמאות', type: 'memorial', demand: 'high',
    demandNote: 'יום העצמאות — פתוח רגיל. ביקוש גבוה — על האש, פיקניקים' },
  { date: '2027-06-10', name: 'ערב שבועות', type: 'holiday_eve', demand: 'peak',
    demandNote: 'ערב שבועות — פירות וירקות למנות חלביות, סלטים, עוגות גבינה' },
  { date: '2027-06-11', name: 'שבועות', type: 'holiday' },

  // Tishrei 2027 — Rosh Hashana 5788 falls on Saturday Oct 2
  { date: '2027-10-01', name: 'ערב ראש השנה', type: 'holiday_eve', demand: 'peak',
    demandNote: 'ערב ראש השנה — פסגת ביקוש: סימנים, פירות לקערה, ירקות לארוחת חג' },
  { date: '2027-10-02', name: 'ראש השנה א׳', type: 'holiday' },
  { date: '2027-10-03', name: 'ראש השנה ב׳', type: 'holiday' },
  { date: '2027-10-10', name: 'ערב יום כיפור', type: 'holiday_eve', demand: 'high',
    demandNote: 'ערב יום כיפור — ארוחה מפסקת, ביקוש גבוה במיוחד בבוקר' },
  { date: '2027-10-11', name: 'יום כיפור', type: 'holiday' },
  { date: '2027-10-15', name: 'ערב סוכות', type: 'holiday_eve', demand: 'peak',
    demandNote: 'ערב סוכות — ירקות לסוכה, אירוח אורחים, ביקוש גבוה מאוד' },
  { date: '2027-10-16', name: 'סוכות א׳', type: 'holiday' },
  { date: '2027-10-17', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות — אירוח משפחתי, ביקוש מוגבר' },
  { date: '2027-10-18', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות' },
  { date: '2027-10-19', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות' },
  { date: '2027-10-20', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות' },
  { date: '2027-10-21', name: 'חול המועד סוכות', type: 'memorial', demand: 'high',
    demandNote: 'חול המועד סוכות' },
  { date: '2027-10-22', name: 'הושענא רבה', type: 'holiday_eve', demand: 'high',
    demandNote: 'הושענא רבה — ערב שמיני עצרת, ביקוש גבוה' },
  { date: '2027-10-23', name: 'שמיני עצרת / שמחת תורה', type: 'holiday' },
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

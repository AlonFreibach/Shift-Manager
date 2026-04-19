# Shift Manager — CONTEXT

## מהו הפרויקט
מערכת ניהול משמרות ועובדות עבור **"נוי השדה — סניף שוהם"** (רשת ירקות ופירות).
אפליקציית React (SPA) בעברית (RTL) עם Supabase כ-backend.

**URL חי:** https://shift-manager-nu-pink.vercel.app

---

## טכנולוגיות
| שכבה | טכנולוגיה |
|-------|-----------|
| Frontend | React 19 + TypeScript 5.9 + Vite 8 |
| Styling | Tailwind CSS 4.2 + inline styles |
| Backend | Supabase (Auth, PostgreSQL, Realtime) |
| Charts | Chart.js + react-chartjs-2 |
| PDF | jspdf + jspdf-autotable |
| Testing | Vitest (unit) + Playwright (e2e) |
| Deploy | Vercel (auto-deploy from GitHub main) |
| Font | Heebo (Google Fonts) |

---

## מבנה קבצים עיקרי
```
src/
├── main.tsx              — React root, BrowserRouter
├── App.tsx               — Routes, 5-tab admin, role detection, BETA badges
├── index.css / App.css   — Global + component styles
├── types.ts              — PrefShift, EmployeePrefs
├── components/
│   ├── AuthScreen.tsx        — Login (admin email/pass, employee PIN)
│   ├── EmployeeDashboard.tsx — Employee preference submission + availability forecast (1000+ שורות)
│   ├── WeeklyBoard.tsx       — לוח שיבוץ ראשי (ענקי)
│   ├── EmployeesTab.tsx      — CRUD עובדות + wizard 3 שלבים, שדות חפיפה + תחילת משמרות
│   ├── PreferencesView.tsx   — תצוגת העדפות למנהל
│   ├── FairnessTab.tsx       — טבלת צדק
│   ├── ForecastTab.tsx       — תחזית כ"א 12 שבועות + גרף + סימולטור (מעל 1000 שורות)
│   ├── HiringRecommendation.tsx — פיצ'ר "איזו עובדת כדאי לגייס" (פרופיל מומלץ + PDF)
│   ├── SpecialDaysBoard.tsx  — לוח ימים מיוחדים (read-only) — הסבר לוגיקת תחזית לחגים
│   ├── CreateUserModal.tsx   — הגדרת PIN/email לעובדת
│   └── UnsavedChangesDialog.tsx
├── pages/
│   └── JoinPage.tsx          — הצטרפות דרך magic link
├── hooks/
│   ├── useAuth.ts            — session + guest logic
│   ├── useSupabaseEmployees.ts — CRUD wrapper
│   └── useLocalStorage.ts
├── utils/
│   ├── fairnessScore.ts      — אלגוריתם ניקוד צדק
│   ├── fairnessAccumulator.ts — היסטוריית צדק (localStorage)
│   ├── submissionWindow.ts   — לוגיקת חלון הגשה
│   └── forecastGaps.ts       — לוגיקה משותפת לחישוב חוסרים + simulateHire (משותף ל-ForecastTab ו-HiringRecommendation)
├── lib/
│   └── supabaseClient.ts     — Supabase client init + AvailabilityForecast interface
└── data/
    ├── employees.ts          — Employee interface + legacy data
    └── holidays.ts           — חגים ומועדי ישראל 2026–2027 (type + demand לחנות ירקות/פירות)
```

---

## מודל נתונים — Employee

```typescript
interface Employee {
  id: string
  name: string
  phone?: string
  email?: string
  seniority: number             // חודשי ותק
  shiftsPerWeek: number         // 3–12
  fridayAvailability: 'always' | 'never' | 'biweekly'
  shiftType: 'הכל' | 'בוקר' | 'ערב'
  isTrainee: boolean
  availableFromDate / ToDate: string  // YYYY-MM-DD (admin-set)
  fairnessHistory: { date, type: 1|2 }[]
  flexibilityHistory: { weekStart, submitted, committed }[]
  fixedShifts?: FixedShift[]
  vacationPeriods: VacationPeriod[]
  birthday?: string             // DD/MM
  // תחזית (BETA):
  availabilityForecasts?: AvailabilityForecast[]  // תקופות זמינות מופחתת (מוזן ע"י העובדת)
  expectedDeparture?: string    // תאריך עזיבה צפוי (מוזן ע"י העובדת)
  employeeNote?: string         // הערות חופשיות למנהלת
  trainingStart?: string        // תאריך תחילת חפיפה
  shiftsStart?: string          // תאריך תחילת עבודה עצמאית במשמרות
  forecastOverrides?: Record<string, { shifts: number; friday: boolean }>  // דריסות ידניות של המנהלת per-week (weekISO)
}

interface AvailabilityForecast {
  period_from: string           // YYYY-MM-DD
  period_to: string
  expected_shifts: number       // 0-6
  friday_available: boolean
  reason: 'מבחנים' | 'חופש' | 'אישי' | 'אחר'
  note?: string
  exclusions?: ForecastExclusion[]  // ימים/משמרות חסומים בתוך התקופה
}

interface ForecastExclusion {
  date: string                  // YYYY-MM-DD
  shift: 'בוקר' | 'ערב' | 'הכל'
  note?: string
}
```

### טבלאות Supabase
- `employees` — נתוני עובדות (כולל 6 עמודות חדשות: availability_forecasts, expected_departure, employee_note, training_start, shifts_start, forecast_overrides)
- `employee_tokens` — PIN login, email, magic links
- `preferences` — העדפות משמרות (week_start, day, shift, available, note)
- `special_shifts` — משמרות מיוחדות + UNLOCK markers

---

## מבנה משמרות שבועי (WeeklyBoard SLOT_DEFAULTS + MIYA_SCHEDULE)

**סה"כ תקן: 30 משמרות בשבוע** (כולל מיה ב-6 ימים).

| יום | שעות מיה | עובדות בוקר (נוסף) | עובדות ערב | סה"כ |
|-----|-----------|--------------------|-------------|-------|
| ראשון | 07:00-15:00 | 1 | 2 | 4 |
| שני | 07:00-15:00 | 1 | 2 | 4 |
| שלישי | 07:00-15:00 | 1 | 2 | 4 |
| רביעי | 08:00-17:00 | 2 | 2 | 5 |
| חמישי | 10:00-19:00 | 3 | 3 | 7 |
| שישי | 07:00-14:00 | 5 (בלבד) | — | 6 |

**הערות חשובות:**
- ברירת מחדל משמרת בוקר רגילה = **מיה + 1 עובדת** (תוקן מ-מיה+2)
- אין "משמרת אמצע" — שעות מיה ברביעי וחמישי שונות, זה הכל
- שינוי ב-SLOT_DEFAULTS מחייב עדכון `SLOTS_PER_DAY` ב-ForecastTab

---

## 5 טאבים במנהל (Admin)

### 1. לוח שיבוץ (WeeklyBoard)
- לוח שבועי ראשון–שישי, בוקר/ערב
- גרירת עובדות למשבצות, שיבוץ אוטומטי
- אילוצים: סגירת משמרות, משמרות קבועות, חופשות, וולט
- Undo/Redo (Ctrl+Z) per-week
- סנכרון Supabase בזמן אמת

### 2. עובדות/ים (EmployeesTab)
- רשימת כרטיסיות (פעילות/לשעבר)
- הוספה: wizard 3 שלבים (פרטים → משמרות → יצירת לינק)
- עריכה inline, מחיקה עם אישור
- משמרות קבועות + תקופות חופשה
- **שדות חדשים:** תחילת חפיפה (`training_start`), תחילת עבודה עצמאית (`shifts_start`)

### 3. העדפות שהוגשו (PreferencesView)
- תצוגת העדפות שהוגשו לפי שבוע
- עריכה ידנית של העדפות כל עובדת
- כפתור "שיבוץ אוטומטי"

### 4. טבלת צדק (FairnessTab)
- 3 מדדים: צדק (0–10+), גמישות (100–200+), יציבות (0–10)
- ציון משוקלל: (Flex×0.5) + (Stability×0.4) + (Fairness×0.1)
- דירוג צבעוני: אדום/כתום/ירוק/זהב

### 5. תחזית כ"א (ForecastTab) — BETA
**הטאב המרכזי החדש — מחליף את WorkforceTab שנמחק.**

- **טבלת תחזית:** 12 שבועות קדימה × עובדות פעילות (כולל מיה כעמודה ראשונה עם 6 משמרות קבועות).
- **צבעי תאים:** לבן=ברירת מחדל, צהוב=העובדת הזינה, כחול=דריסה ידנית מנהלת.
- **עמודת "רצוי":** מספר משמרות נדרש + 100%, עריכה ידנית (נשמר ב-localStorage `forecast_standard_overrides`).
- **עמודת "מצוי":** סה"כ משמרות צפויות בפועל + אחוז כיסוי (תקן 30 = 100%).
- **עמודות sticky:** שבוע, רצוי, מצוי נשארות בצד ימין בזמן גלילה אופקית.
- **popup עריכת תא:** שם עובדת, מספר משמרות, שישי, הצגת ימים חסומים שהעובדת הזינה, איפוס דריסה.

**גרף "מגמת כיסוי — 12 שבועות":**
- 5 קווים על 2 צירי Y:
  - 🟢 צפי קיים (מלא, ציר ימני)
  - 🟠 נדרש 100% (מקווקו, ציר ימני)
  - 🟢 יעד 125% (מקווקו, ציר ימני)
  - 🔵 צפי שישי (מלא, ציר שמאלי 0-10)
  - 🔵 נדרש שישי (מקווקו בהיר, ציר שמאלי)

**התראות מפורטות:** כמה משמרות חסרות, מתוכן שישי/ערב חג, המלצת גיוס, התראה אם פחות מחודשיים.

**תגי ביקוש ליד שבועות עם חגים:**
- 🔴 פסגה, 🟠 גבוה, ⚪ נמוך (ספציפי לחנות ירקות/פירות)

**לוח ימים מיוחדים (SpecialDaysBoard):**
- סקשן מתקפל מתחת לטבלה הראשית — **read-only בלבד**
- טבלה כרונולוגית של כל 29 המועדים ב-12 חודשים קדימה
- עמודות: תאריך לועזי, יום בשבוע, תאריך עברי, שם + תג ביקוש, סיווג, השפעה על רצוי, הסבר מילולי
- מטרה: שקיפות — מסביר למיה למה "רצוי" נראה כפי שהוא

**פיצ'ר "איזו עובדת כדאי לגייס" (HiringRecommendation):**
- פרופיל מומלץ אוטומטי: היקף/סוג/שישי/ימים/תאריך תחילה
- טבלת חוסרים עם דרגות חומרה (קריטי/גבוה/בינוני/נמוך) + bar chart
- התראות על עובדות עוזבות + חפיפה
- העתק תיאור משרה (clipboard) + ייצוא PDF

**סימולטור גיוס עובדת חדשה (משודרג):**
- פרטי העובדת: משמרות/שבוע, שישי, סוג משמרת, **ימים זמינים (בחירה מרובה)**
- טבלת לפני/אחרי (סה"כ חוסר + חוסר בשישי בנפרד)
- המלצה חכמה: 🟢 מצוין / 🟡 טוב חלקית / 🟠 משלים / 🔴 לא מתאים
- טיפים ספציפיים (למשל: "חוסר שישי לא נסגר, שקלי עובדת נוספת")

**מדריך שימוש מובנה** — סקשן פתיחה עם מקרא צבעים, סימנים, הסבר עמודות ועריכה.

**תמיכה בחפיפה (🎓):** עובדת בחפיפה לא נספרת בתחזית; מסומנת visualית.

---

## Employee Dashboard

- 5 טאבים של שבועות (נעול / פתוח / 3 עתידיים)
- חלון הגשה: ראשון 20:00 → ראשון הבא 20:00
- בחירת בוקר/ערב לכל יום (✓/✗)
- משמרות מיוחדות (✨)
- סיכום → הגשה → אישור
- **סקשן "זמינות עתידית" (BETA):**
  - תקופות זמינות מופחתת (מבחנים, חופש, אישי, אחר)
  - ימים/משמרות חסומים ספציפיים בתוך תקופה (exclusions)
  - תאריך עזיבה צפוי
  - הערות חופשיות למנהלת (placeholder מינימלי: "הערה למנהלת...")
  - נשמר ישירות ב-Supabase → מוצג ב-ForecastTab (תאים צהובים)

---

## לוגיקת חגים — מותאמת לחנות ירקות/פירות

**סיווג כל מועד (ב-`holidays.ts`):**
```typescript
interface IsraeliHoliday {
  date: string
  name: string
  type: 'holiday' | 'holiday_eve' | 'memorial'
  demand?: 'peak' | 'high' | 'normal' | 'low'
  demandNote?: string
}
```

### השפעת הסוג על "רצוי" (auto-calculation):

| סוג | השפעה |
|------|--------|
| `holiday` (🔴 סגור — כמו שבת) | מפחית את **כל** משמרות היום |
| `holiday_eve` (🟡 כמו שישי) | **מחליף** את משמרות היום ל-6 משמרות בוקר (כמו שישי) — נכון לכל יום בשבוע. הכלל "ערב חג = כמו שישי" הוא החלטה של מיה. |
| `memorial` (⚪ יום רגיל) | ללא שינוי — מוצג לידיעה בלבד |

**דוגמאות:**
- ערב פסח ביום רביעי: רביעי רגיל=5, כמו שישי=6 → **+1 משמרת לשבוע**
- ערב שבועות ביום שלישי: שלישי רגיל=4, כמו שישי=6 → **+2 משמרות לשבוע**
- ערב חג ביום חמישי: חמישי רגיל=7, כמו שישי=6 → **-1 משמרת לשבוע**

### הסיווג הסופי (ספציפי לחנות ירקות/פירות):

**🔴 holiday (סגור):** ראש השנה א'+ב', יום כיפור, סוכות א', שמיני עצרת, פסח א', שביעי של פסח, שבועות. **יום העצמאות פתוח רגיל** (החלטה של מיה).

**🟡 holiday_eve (כמו שישי):** ערב ראש השנה, ערב יום כיפור, ערב סוכות, הושענא רבה, ערב פסח, ערב שביעי של פסח, ערב שבועות, יום הזיכרון (ערב יום העצמאות), תשעה באב.

**⚪ memorial (יום רגיל):** ט"ו בשבט, תענית אסתר, פורים, שושן פורים, חול המועד פסח (5 ימים), חול המועד סוכות (5 ימים), ערב יום השואה, יום השואה, ערב יום הזיכרון, ל"ג בעומר, יום ירושלים, חנוכה (8 ימים), יום העצמאות.

### רמות ביקוש (חנות ירקות/פירות):

**🔴 peak:** ערב פסח, ערב ראש השנה, ערב סוכות, ערב שבועות, פורים, ט"ו בשבט.
**🟠 high:** חול המועד (פסח+סוכות), תענית אסתר, ערב יום כיפור, הושענא רבה, יום הזיכרון/ערב יום העצמאות, **יום העצמאות** (על האש), ערב שביעי של פסח, ל"ג בעומר.
**⚪ normal:** רוב יתר המועדים.
**⚪ low:** תשעה באב.

---

## לוגיקת חלון הגשה (submissionWindow.ts)
- לפני ראשון 20:00 → חלון השבוע הקודם עדיין פתוח
- שבוע פעיל: 2 ראשונים קדימה
- נעילה אוטומטית אחרי ה-deadline
- Admin יכול לפתוח ידנית דרך UNLOCK_MARKER ב-special_shifts

---

## Authentication
- **Admin:** email + password (Supabase Auth)
- **Employee:** PIN (4 ספרות) + email, או magic link token
- **Guest session:** localStorage (ללא DB) — מנוקה ב-sign out

---

## סכמת צבעים
- Header: `#1a4a2e` (ירוק כהה)
- Admin accents: `#2D5016`
- Employee bg: `#EBF3D8`
- Cream: `#F5F0E8`
- Olive: `#5A8A1F`
- BETA badge: `#c17f3b` (כתום)
- Forecast cells — לבן/צהוב (`#fffde7`)/כחול (`#e0e7ff`)
- Coverage — ירוק (`#dcfce7`)/כתום (`#FEF3E2`)/אדום (`#fee2e2`)

---

## Deploy
- **Platform:** Vercel (auto-deploy מ-GitHub main)
- **vercel.json:** rewrites `/*` → `/index.html`
- **Build:** `tsc -b && vite build`
- **Env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## החלטות מוצריות קריטיות של מיה (מנהלת נוי השדה סניף שוהם)

1. **יום העצמאות פתוח** כיום עבודה רגיל (לא כחג)
2. **ערב חג = כמו יום שישי** (6 משמרות בוקר, 0 ערב) — מעלה תקן לרוב הימים
3. **תקן שבועי = 30** (לא 31/34 כמו בגרסאות קודמות)
4. **ברירת מחדל משמרת בוקר = מיה + 1** (לא +2)
5. **WorkforceTab נמחק** — ForecastTab מחליף אותו לגמרי
6. **מיה היא עמודה בטבלה** — עם 6 ברירת מחדל, ניתן לערוך (למקרה חולי/חופש)
7. **חגים לידיעה בלבד** כברירת מחדל — מיה תשלח רשימת החלטות סופית

---

## התקדמות ופיצ'רים שבוצעו (אפריל 2026)

### סיבוב 1 — ForecastTab (מערכת התחזית):
- מודל נתונים: `availabilityForecasts`, `expectedDeparture`, `employeeNote`, `trainingStart`, `shiftsStart`, `forecastOverrides`
- Employee Dashboard: סקשן "זמינות עתידית" (BETA) + ימים/משמרות חסומים
- ForecastTab: טבלת 12 שבועות × עובדות עם צבעי תאים
- גרף Chart.js 3 קווים → 5 קווים (הוספת תחזית שישי)
- ייבוא תחזית מ-Excel של מיה (script python, `forecast_overrides` per עובדת)
- סנכרון biweekly Friday: ערך עשרוני בתא מתפצל ל-ceil/floor מתחלפים בין שבועות

### סיבוב 2 — דיוקים של מיה:
- הסרת הפחתת תקן אוטומטית בחגים (החזרה כ-info only + lookup ידני)
- שינוי ערב חג מ"הפחתת ערב" ל"החלפה מלאה לכמו שישי"
- סיווג מחדש של חגים לחנות ירקות/פירות (peak/high/normal/low + demandNote)
- יום העצמאות → memorial + demand: high
- שמות מלאים בעמודות (דנה ב / דנה ח במקום "דנה")
- תיקון שעות רביעי (מיה 08:00-17:00, 2 בוקר, 2 ערב)

### סיבוב 3 — פיצ'רים חדשים:
- HiringRecommendation: פרופיל מומלץ + טבלת חוסרים + ייצוא PDF + העתק מודעה
- סימולטור גיוס משודרג: בחירת ימים + לפני/אחרי + המלצה חכמה 4-רמות
- SpecialDaysBoard: לוח read-only של כל המועדים
- מיה חזרה לטבלה (עמודה ראשונה, 6 משמרות)
- utils/forecastGaps.ts: לוגיקת חישוב חוסרים משותפת

### סיבוב 4 — ניקוי:
- מחיקת WorkforceTab (מיותר — ForecastTab מכסה)
- תגי BETA על Employee Dashboard forecast + Admin ForecastTab

---

## בקלוג (לא בוצע)

### 1. User Tutorial System — תכנון מוכן, לא נבנה
מדריך אינטראקטיבי מלא לכל המערכת:
- **גישה משולבת:** Onboarding אוטומטי בכניסה ראשונה + כפתורי "?" מרחפים + tooltips
- **שלב 1:** תשתית (TooltipHint, HelpModal, useFirstVisit)
- **שלב 2:** Onboarding Tour עם spotlight על אלמנטים
- **שלב 3:** ממשק עובדת
- **שלב 4:** טאבים פשוטים (עובדות, העדפות, צדק)
- **שלב 5:** טאבים מורכבים (לוח שיבוץ, תחזית כ"א)
- **שלב 6:** ליטוש + הגדרות + תמונות/דוגמאות
- *הסבר מקיף + דוגמאות בכניסה שניה ואילך*

### 2. רשימת החלטות של מיה (ממתינים)
- שליחה חזרה עם ההחלטות הספציפיות לכל 29 מועד (סגור/קצר/רגיל/+X/לידיעה)
- עם החזרה יהיה עדכון סופי של `holidays.ts`

---

## נקודות לשיפור אפשריות
1. **WeeklyBoard.tsx** — קומפוננטה ענקית, מועמדת לפיצול
2. **כיסוי בדיקות** — Playwright קיים אבל מוגבל; unit tests חסרים
3. **ביצועים** — חלק מהחישובים כבדים (גם עם useMemo); bundle 1.3MB
4. **נגישות** — ללא ARIA labels
5. **Error boundary** — אין global error handling
6. **דריסת רצוי** — כרגע ב-localStorage (לא Supabase), לא מסתנכרן בין מכשירים

---

*עדכון אחרון: 2026-04-19*

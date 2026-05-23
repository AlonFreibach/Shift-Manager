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
- `closed_shifts` — משמרות סגורות (week_start, day, shift)
- `schedules` — **חדש (מאי 2026)**: השיבוץ השבועי. עמודות: week_start (PK), data (jsonb), updated_at. מאוחסן כ-JSONB עם מבנה `{ "ראשון_בוקר": [Slot, ...], ... }`. מסונכרן בזמן אמת בין מכשירים.

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

> **תכונות רוחב (כל הלשוניות):** פאנל **מדריך שימוש** מתקפל בראש כל לשונית,
> כפתור **↩ בטל** (גם Ctrl+Z) לביטול הפעולה האחרונה, כפתור **?** בהדר למדריך כללי,
> ו-Error Boundary גלובלי למניעת קריסה מלאה.

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
- **toggle BETA "כרטיסיות / טבלה"** — שתי תצוגות:
  - **כרטיסיות (ברירת מחדל)**: התצוגה המקורית — כרטיסיה לכל עובדת
  - **טבלה (BETA)**: טבלה אחת בסגנון Excel של מיה — שורה לעובדת, עמודות = ימים×משמרות, וי ירוק לקיבלה (מ-WeeklyBoard), עמודות סיכום (הגישה/קיבלה/הערות). כפתור 🖨️ הדפס → CSS @media print לעמוד A4 landscape אחד.
- 3 טאבי קיצור לשבועות הקרובים + חיצי ניווט.

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

**🟡 holiday_eve (כמו שישי):** ערב ראש השנה, ערב יום כיפור, ערב סוכות, הושענא רבה, ערב פסח, ערב שביעי של פסח, ערב שבועות, יום הזיכרון (ערב יום העצמאות).

**⚪ memorial (יום רגיל):** ט"ו בשבט, תענית אסתר, פורים, שושן פורים, חול המועד פסח (5 ימים), חול המועד סוכות (5 ימים), ערב יום השואה, יום השואה, ערב יום הזיכרון, ל"ג בעומר, יום ירושלים, חנוכה (8 ימים), יום העצמאות, **תשעה באב**.

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
8. **תשעה באב = יום עבודה רגיל** (לא ערב חג) — חמישי שבו חל תשעה באב נשאר 7 משמרות, ושבוע 19.7–24.7/2026 נשאר 30 משמרות.
9. **קלפי סיכום בתחזית כ"א מחושבים מול תקן 30** — לא מול התקן המותאם-חגים. השאלה היא "האם יש מספיק כ"א לשבוע 30-משמרות רגיל?" — שבוע קצר של חג לא צריך להראות 139% רק כי התקן שלו ירד ל-23. הטבלה עצמה ממשיכה להשתמש בתקן מותאם-חגים לתכנון מפורט.

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

### 1. User Tutorial System — שלב 1 בוצע (סיבוב 8), שלבים 2-6 פתוחים
- ✅ **שלב 1 — תשתית:** `useFirstVisit`, `HelpModal`, `TooltipHint` נבנו. כפתור "?" בהדר + מדריך מהיר שנפתח אוטומטית בכניסה ראשונה של המנהלת.
- **שלב 2:** Onboarding Tour עם spotlight על אלמנטים
- **שלב 3:** ממשק עובדת
- **שלב 4:** טאבים פשוטים (עובדות, העדפות, צדק)
- **שלב 5:** טאבים מורכבים (לוח שיבוץ, תחזית כ"א)
- **שלב 6:** ליטוש + הגדרות + תמונות/דוגמאות

### 2. רשימת החלטות של מיה (ממתינים)
- שליחה חזרה עם ההחלטות הספציפיות לכל 29 מועד (סגור/קצר/רגיל/+X/לידיעה)
- עם החזרה יהיה עדכון סופי של `holidays.ts`

---

## נקודות לשיפור אפשריות
1. **WeeklyBoard.tsx** — עדיין גדולה (~4300 שורות). טייפים/קבועים/פונקציות טהורות חולצו (סיבוב 8); פיצול קומפוננטות-משנה נשאר כמשימה עתידית (עדיף בליווי).
2. ✅ **כיסוי בדיקות** — הורחב מ-21 ל-72 unit tests (סיבוב 8).
3. ✅ **ביצועים** — code splitting; bundle ראשוני 1.3MB → 426KB (סיבוב 8).
4. ✅ **נגישות** — נוספו ARIA labels לניווט ולכפתורי אייקון (סיבוב 8). עדיין אפשר להרחיב.
5. ✅ **Error boundary** — נוסף global ErrorBoundary (סיבוב 8).
6. **דריסת רצוי** — כרגע ב-localStorage (לא Supabase), לא מסתנכרן בין מכשירים
7. ✅ **voltFlags / customShifts** — סונכרנו ל-Supabase דרך טבלת `board_settings` (סיבוב 8).

---

## סיבוב 5 — מאי 2026

### תצוגת טבלה חדשה ב-PreferencesView (BETA) — כלי תכנון
- בקשה של מיה: לסדר את ההעדפות כמו שהיא מסדרת באקסל שלה — שורה לעובדת, עמודות יום×משמרת, וי ירוק על שיבוץ בפועל, נכנס במסך אחד וניתן להדפיס בעמוד A4 landscape אחד.
- קומפוננטה חדשה: `PreferencesTableView.tsx` + `PreferencesView.css` (print styles).
- Toggle כרטיסיות/טבלה ב-PreferencesView, נשמר ב-localStorage (`preferences_view_mode`).
- 3 טאבי קיצור לשבועות הקרובים בנוסף לחיצים.
- **עמודת צפי**: מ-`expectedShiftsThisWeek` (utils/forecastGaps.ts) — אותה לוגיקה כמו ForecastTab.
- **כלי תכנון אינטראקטיבי**: לחיצה על תא = הקצאת/ביטול משמרת לעובדת. נשמר ב-`schedules` (Supabase) ולכן מסונכרן עם WeeklyBoard.
- **קיבלה** (עמודה ירוקה): מספר השיבוצים הפעילים של העובדת מתעדכן בזמן אמת.
- משמרות locked / isFixed (כולל מיה) מוצגות עם 🔒 ולא ניתן לבטל אותן מהתצוגה הזו (רק מ-WeeklyBoard).

### שיבוצים → Supabase
- `schedules` table חדשה: `week_start (PK)`, `data (jsonb)`, `updated_at`.
- מודול חדש: `src/lib/scheduleStorage.ts` — load/save/subscribe + מיגרציה אוטומטית מ-localStorage.
- WeeklyBoard.tsx + PreferencesTableView.tsx משתמשים בו עם realtime subscription.
- localStorage נשאר כ-cache למהירות.
- **SQL להריץ ב-Supabase (פעם אחת):**
```sql
CREATE TABLE IF NOT EXISTS schedules (
  week_start date PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedules_all" ON schedules FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
```

---

---

## סיבוב 6 — מאי 2026

### תיקונים ושיפורים ב-PreferencesView
- **תיקון עובדות חסרות:** `notSubmitted` השתמש ב-`today` כ-cutoff — עובדות שמתחילות שבוע הבא לא הופיעו בטבלת התכנון של אותו שבוע. תוקן: הפילטר עכשיו משתמש ב-`weekStart`/`weekEnd` (תחילת/סוף השבוע המתוכנן) כדי לכלול כל עובדת פעילה בשבוע הנבחר.
- **כפתור הדפסה — שינוי פורמט:** כפתור 🖨️ בתצוגת הטבלה פותח כעת את **לוח השיבוץ המוכן להפצה לעובדות** (אותו פורמט WeeklyBoard), ולא את טבלת ההעדפות של המנהלת.
- **חילוץ `printSchedule` ל-utility:** לוגיקת ה-print הועברה מ-`WeeklyBoard.tsx` ל-`src/utils/printSchedule.ts` — shared בין WeeklyBoard ו-PreferencesView. WeeklyBoard עדיין עובד אותו דבר.

### קבצים חדשים/ששונו
- `src/utils/printSchedule.ts` — utility חדש: `printSchedule(weekKeys, employees)` פותח חלון HTML מוכן להדפסה
- `src/components/WeeklyBoard.tsx` — `generatePDF` מאצילה ל-`printSchedule`
- `src/components/PreferencesView.tsx` — כפתור הדפסה → `printSchedule([weekStart], employees)`

---

## סיבוב 7 — מאי 2026

### תיקוני PreferencesTableView + holidays.ts

**באג תאריכים — timezone:**
- `dayDates` ו-`weekEndISO` השתמשו ב-`.toISOString().slice(0,10)` — בישראל (UTC+3) זה גורם לחזרת יום קודם. תוקן: שימוש ב-`getFullYear()/getMonth()/getDate()` (local components) במקום.
- תסמין: ה-20.5 הופיע כיום חמישי במקום רביעי.

**תיקון תאריכי חגים ב-`holidays.ts` (מאומת מול Hebcal):**

*2026:*
- ערב יום השואה: 2026-04-15 → 2026-04-13
- יום השואה: 2026-04-16 → 2026-04-14
- ערב יום הזיכרון: 2026-04-21 → 2026-04-20
- יום הזיכרון / ערב יום העצמאות: 2026-04-22 → 2026-04-21
- יום העצמאות: 2026-04-23 → 2026-04-22
- ערב שבועות: 2026-05-12 → 2026-05-21
- שבועות: 2026-05-13 → 2026-05-22
- יום ירושלים הועבר לפני שבועות בסדר הרשימה

*2027:*
- תענית אסתר 2027-03-22 (חדש), פורים 03-22→03-23, שושן פורים 03-23→03-24
- ערב פסח 04-20→04-21, פסח א׳ 04-21→04-22, חול המועד +1 יום כולם, שביעי 04-27→04-28
- ערב יום השואה 05-04→05-03, יום השואה 05-05→05-04
- ערב שבועות 05-31→06-10, שבועות 06-01→06-11
- כל תשרי 2027 תוקן לחלוטין (היה שגוי בחודש שלם!): ראש השנה א 09-01→10-02, ראש השנה ב 09-02→10-03, יום כיפור 09-09→10-11, סוכות א 09-14→10-16, שמיני עצרת 09-21→10-23
- הוספות: ערב ראש השנה 10-01, ערב יום כיפור 10-10, ערב סוכות 10-15, חול המועד סוכות 10-17..21 (5 ימים), הושענא רבה 10-22

**שיפורים ב-PreferencesTableView:**
- **כפתור ↩ בטל** + **Ctrl+Z** — undo stack עד 20 פעולות; כפתור מופיע מעל הלג'נד (disabled עד לאחר פעולה ראשונה)
- **משמרת קבועה:** במקום 🔒 (emoji מנעול) + רקע צהוב, מוצג ✓ עם תווית קטנה "קבועה" מתחת + רקע צהוב נשמר לזיהוי. הלג'נד עודכן בהתאם.

---

## סיבוב 8 — מאי 2026 (עבודת לילה אוטונומית)

8 משימות בקלוג בוצעו ברצף. כל commit אומת עם `tsc -b` + `vite build` לפני push (האתר חי).

### 1. כפתור "בטל" בכל הלשוניות
- `useUndoStack` hook גנרי חדש (מחסנית snapshots + Ctrl/Cmd+Z) + קומפוננטת `UndoButton` משותפת.
- **טבלת צדק:** ביטול של "אפס היסטוריה" (snapshot של localStorage).
- **העדפות שהוגשו:** ביטול עריכה/מחיקה/איפוס/הזנה ידנית (מצב כרטיסיות; מצב טבלה כבר היה).
- **תחזית כ"א:** ביטול דריסות עמודת "רצוי" ודריסות תאים פר-עובדת.
- **עובדות:** undo מבוסס snapshot שמשחזר את כל טבלת העובדים (עריכה/מחיקה/שחזור מארכיון).

### 2. Global Error Boundary
- `ErrorBoundary.tsx` — קריסה בקומפוננטה לא מפילה את כל האפליקציה; מסך שגיאה ידידותי + כפתור רענון.

### 3. נגישות (ARIA)
- ניווט ראשי: `aria-label` + `aria-current`. כפתורי אייקון (חיצים, עריכה/מחיקה, הזנה ידנית, כניסה) קיבלו `aria-label`.

### 4. ביצועים — code splitting
- כל הטאבים, EmployeeDashboard, JoinPage ו-HiringRecommendation הוסבו ל-`React.lazy`.
- bundle ראשוני: 1,317KB → 426KB (-68%). אין יותר אזהרות chunk מעל 500KB.

### 5. voltFlags/customShifts → Supabase ✅
- מודול `boardSettingsStorage.ts` נכתב (מראה את `scheduleStorage.ts`).
- טבלת `board_settings` נוצרה ב-Supabase (אלון הריץ את ה-SQL).
- `WeeklyBoard.tsx` חובר: טעינה Supabase-first + cache ב-localStorage, סנכרון realtime, שמירה דרך Supabase. localStorage נשאר כ-fallback.

### 6. Unit tests
- תוקן `vite.config` (vitest לא הריץ עוד את Playwright spec). תוקן טסט שקיבע תאריכי שבועות ישנים.
- קבצים חדשים: `holidays.test.ts` (הורחב), `forecastGaps.test.ts`, `submissionWindow.test.ts`. סה"כ 21 → 72 טסטים.

### 7. User Tutorial — שלב תשתית
- `useFirstVisit`, `HelpModal`, `TooltipHint`. כפתור "?" בהדר פותח מדריך מהיר; נפתח אוטומטית בכניסה ראשונה.

### 8. פיצול WeeklyBoard.tsx
- חולצו טייפים → `WeeklyBoard.types.ts`, וקבועים + פונקציות טהורות → `WeeklyBoard.utils.ts` (~218 שורות).
- רק קוד ברמת-מודול (טהור) הוזז — התנהגות זהה. פיצול קומפוננטות-משנה נשאר למשימה עתידית בליווי.

### קבצים חדשים
`src/hooks/useUndoStack.ts`, `src/hooks/useFirstVisit.ts`,
`src/components/UndoButton.tsx`, `src/components/ErrorBoundary.tsx`,
`src/components/HelpModal.tsx`, `src/components/TooltipHint.tsx`,
`src/components/WeeklyBoard.types.ts`, `src/components/WeeklyBoard.utils.ts`,
`src/lib/boardSettingsStorage.ts`,
`tests/unit/forecastGaps.test.ts`, `tests/unit/submissionWindow.test.ts`, `tests/unit/_employeeFactory.ts`,
`MANUAL_TASKS.md`

---

## סיבוב 9 — מאי 2026 (הערות מיה לקראת פרזנטציה להנהלה)

5 הערות של מיה על **תצוגת הטבלה (BETA)** ב-PreferencesView, לקראת הצגת המערכת להנהלת נוי השדה.

### 1. באג שינוי צבע בתאים (PreferencesView.css)
- **שורש:** כלל ה-zebra `tbody tr:nth-child(even) td...` היה בעל specificity גבוה מ-`.cell-assigned`, ולכן בשורות זוגיות תא משובץ לא נצבע ירוק.
- **תיקון:** הוספת `:not(.cell)` לכלל ה-zebra וכלל ה-hover — תאי משמרת נצבעים אך ורק לפי מצבם (לבן/ירוק/צהוב), בעקביות בכל השורות. הוסר כלל `tr:hover .cell-assigned` המיותר.

### 2. כל העובדות הפעילות מוצגות (PreferencesView.tsx)
- לוח התכנון השתמש בסינון חלון-שבוע (`active_from`/`active_until`) + הסתרת `admin`, ולכן **מיה והיא לי** לא הופיעו.
- נוסף `notSubmittedForTable` — מתיישר עם הגדרת "פעילה" של EmployeesTab (inactive רק כש-`active_until` עבר), כולל admin. נוסף `adminId`.

### 3. מיון שורות + מיה ראשונה (PreferencesTableView.tsx)
- `allRows` ממוין לפי שם (`localeCompare('he')`), ומיה (`adminId`) תמיד ראשונה.
- שורת מיה: ללא סימון "לא הגישה" האדום; עמודות "צפי"/"הגישה" מציגות "—".

### 4. הכל במסך אחד + הערות בשורה אחת
- עמודת "הערות": שורה אחת עם `ellipsis`. הטקסט המלא נחשף ב-hover (`title`) וב-לחיצה (popup `.prefs-note-popup`).
- צומצמו מרווחי הכותרת והסרגל ב-PreferencesView.

### 5. הגדלת גופנים
- גופני הטבלה הוגדלו (בסיס 12→14, כותרות 11→13, ✓ 14→16, ימים 12→14, משמרות 10→12, הערות 11→13). גובה תא 24→28.

### משימה ידנית לאלון
- חשבון הבדיקה **"Maya test"** מוגדר כפעיל ולכן מופיע בלוח — למחוק ב-EmployeesTab.
- **היא לי** מוגדרת עם תאריך תחילה 01/09/2026 — מופיעה בלוח אך מתחילה רק בספטמבר. אם התאריך שגוי, לעדכן ב-EmployeesTab.

### סבב משוב שני ממיה
- **סדר עמודות:** עמודות הסיכום (צפי/הגישה/קיבלה/הערות) הועברו מימין ליום ראשון ל**שמאל ליום שישי** — סדר: שם → ימים א׳–ו׳ → צפי/הגישה/קיבלה/הערות → פעולות.
- **גופנים:** התאריכים ותוויות בוקר/ערב הוגדלו ל-14px (כגודל שמות העובדות).

### סבב משוב שלישי ממיה — טקסט בשורה אחת
- **בעיה:** טקסט בתאים נשבר באמצע מילה (למשל "הגיש"+"ה") כי היה `word-wrap: break-word` והעמודות היו צרות מדי.
- **תיקון (PreferencesView.css):** `white-space: nowrap` בכל תאי הטבלה — אף מילה לא נשברת. הורחבו `col-num` (46→54px) ו-`col-name` (100→110px).
- **מובייל:** נוסף `min-width: 980px` לטבלה — במסכים צרים הטבלה נשארת ברוחב מלא ו-`.prefs-table-scroll` גולל אופקית במקום לשבור טקסט. עובד זהה בדסקטופ ובמובייל.

### סבב משוב חמישי — תחזית כ"א: קלפי סיכום + הסרת קלף "עובדות עם תחזית"
- **בעיה:** הקלפים "כיסוי שבוע נוכחי" ו"שבוע הכי בעייתי" השתמשו ב-`summaries[i].ratio` שמחושב מול התקן המותאם-חגים — בשבוע של שבועות זה ירד ל-23, ולכן 32 משמרות צפויות הציגו 139% (מטעה).
- **תיקון (ForecastTab.tsx):** `currentRatio` ו-`worstIdx` מחושבים עכשיו מול `STANDARD_SLOTS = 30` קבוע. הטבלה למטה ממשיכה להשתמש ב-`getStandard(week)` המותאם-חגים — היא לתכנון מפורט; הקלפים לתמונה מנהלית.
- **קלף "עובדות עם תחזית" הוסר** לבקשת מיה — נחשב מיותר לפרזנטציה. הוסר גם המשתנה `forecastCount`.

### ⚠️ סבב משוב רביעי — ניסיון הקפאת כותרת בוטל
- **מה ניסינו (commit `d5f5295`):** sticky thead — `.prefs-table-scroll` עם `max-height: calc(100vh - 290px)` + `overflow: auto`, ו-`.prefs-table thead { position: sticky; top: 0 }`.
- **למה זה לא עבד:** ה-`max-height` יצר תיבת גלילה פנימית לטבלה — ובדפדפן זה גרם לכך שהפקדים שמעל הטבלה (כותרת, בוחר שבוע, סרגל) נראו כ"מוקפאים" יחד עם הטבלה, ולא ניתן היה לראות את כל הטבלה במסך מחשב. מיה ביקשה לבטל.
- **בוטל ב-commit `2118400`** (revert של `d5f5295` + `86d6044`). חזרה מלאה למצב לפני הניסיון.
- **לזכור לעתיד:** אם נחזור לפיצ'ר הזה, הפתרון הנכון יהיה כנראה `position: sticky` ברמת ה-`<th>` עם offset מחושב לשורה שנייה, **בלי** להפוך את עטיפת הטבלה ל-scroll box. הניסיון הנוכחי לא טוב.

### קבצים ששונו
`src/components/PreferencesView.tsx`, `src/components/PreferencesTableView.tsx`, `src/components/PreferencesView.css`, `src/components/ForecastTab.tsx`, `src/data/holidays.ts`

### סטטוס
✅ commit פעיל בפרודקשן: `2118400` (revert לסיבוב 9 בלי הקפאת כותרת). אומת חי
מול ה-CSS המוגש: `.prefs-table-scroll{overflow-x:auto}` בלבד, ללא `position:sticky`.
(`white-space:nowrap`, `col-num:54px`, `min-width:980px`).

---

## סיבוב 10 — מאי 2026

### מדריך שימוש בכל לשונית
- בעבר רק תחזית כ"א הכילה פאנל "מדריך שימוש". נוסף פאנל זהה לכל יתר הלשוניות.
- קומפוננטה חדשה `UsageGuide.tsx` — פאנל מתקפל, פתוח כברירת מחדל; מצב מקופל נשמר ב-localStorage לכל לשונית בנפרד (`guide_dismissed_<tab>`).
- חובר ל: לוח שיבוץ, עובדות, העדפות שהוגשו, טבלת צדק. כל מדריך מסביר בקצרה את ייעוד הלשונית והפעולות העיקריות בה.
- ForecastTab שמרה את המדריך המקורי שלה (זהה ויזואלית).

### קבצים
חדש: `src/components/UsageGuide.tsx`. שונו: `WeeklyBoard.tsx`, `EmployeesTab.tsx`, `PreferencesView.tsx`, `FairnessTab.tsx`.

*עדכון אחרון: 2026-05-21*

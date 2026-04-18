# Shift Manager — CONTEXT

## מהו הפרויקט
מערכת ניהול משמרות ועובדות עבור **"נוי השדה — סניף שוהם"**.
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
| Deploy | Vercel |
| Font | Heebo (Google Fonts) |

---

## מבנה קבצים עיקרי
```
src/
├── main.tsx              — React root, BrowserRouter
├── App.tsx               — Routes, 5-tab admin, role detection
├── index.css / App.css   — Global + component styles
├── types.ts              — PrefShift, EmployeePrefs
├── components/
│   ├── AuthScreen.tsx        — Login (admin email/pass, employee PIN)
│   ├── EmployeeDashboard.tsx — Employee preference submission (708 שורות)
│   ├── WeeklyBoard.tsx       — לוח שיבוץ ראשי (קומפוננטה ענקית)
│   ├── EmployeesTab.tsx      — CRUD עובדות + wizard 3 שלבים (1,562 שורות)
│   ├── PreferencesView.tsx   — תצוגת העדפות למנהל
│   ├── FairnessTab.tsx       — טבלת צדק (92 שורות)
│   ├── WorkforceTab.tsx      — כוח אדם + סימולטור גיוס
│   ├── ForecastTab.tsx       — תחזית כ"א 12 שבועות + סימולטור גיוס (חדש)
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
│   └── submissionWindow.ts   — לוגיקת חלון הגשה
├── lib/
│   └── supabaseClient.ts     — Supabase client init
└── data/
    ├── employees.ts          — Employee interface + legacy data
    └── holidays.ts           — חגים ישראליים 2026–2027
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
  availableFromDate / ToDate: string  // YYYY-MM-DD
  fairnessHistory: { date, type: 1|2 }[]
  flexibilityHistory: { weekStart, submitted, committed }[]
  fixedShifts?: FixedShift[]
  vacationPeriods: VacationPeriod[]
  birthday?: string             // DD/MM
  availabilityForecasts?: AvailabilityForecast[]  // תקופות זמינות מופחתת (מוזן ע"י העובדת)
  expectedDeparture?: string    // תאריך עזיבה צפוי (מוזן ע"י העובדת)
  employeeNote?: string         // הערות חופשיות למנהלת
  trainingStart?: string        // תאריך תחילת חפיפה
  shiftsStart?: string          // תאריך תחילת עבודה עצמאית במשמרות
  forecastOverrides?: Record<string, { shifts: number; friday: boolean }>  // דריסות ידניות של המנהלת
}

interface AvailabilityForecast {
  period_from: string           // YYYY-MM-DD
  period_to: string
  expected_shifts: number       // 0-6
  friday_available: boolean
  reason: 'מבחנים' | 'חופש' | 'אישי' | 'אחר'
  note?: string
}
```

### טבלאות Supabase
- `employees` — נתוני עובדות
- `employee_tokens` — PIN login, email, magic links
- `preferences` — העדפות משמרות (week_start, day, shift, available, note)
- `special_shifts` — משמרות מיוחדות + UNLOCK markers

---

## 6 טאבים במנהל (Admin)

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

### 3. העדפות שהוגשו (PreferencesView)
- תצוגת העדפות שהוגשו לפי שבוע
- עריכה ידנית של העדפות כל עובדת
- כפתור "שיבוץ אוטומטי"

### 4. טבלת צדק (FairnessTab)
- 3 מדדים: צדק (0–10+), גמישות (100–200+), יציבות (0–10)
- ציון משוקלל: (Flex×0.5) + (Stability×0.4) + (Fairness×0.1)
- דירוג צבעוני: אדום/כתום/ירוק/זהב

### 5. כוח אדם (WorkforceTab)
- ניתוח קיבולת: נוכחי vs. יעד (130%)
- התראות: עובדת יוצאת, חופשה, גיוס עתידי
- סימולטור גיוס: שינוי פרמטרים → צפי קיבולת

### 6. תחזית כ"א (ForecastTab) — חדש (BETA)
- **טבלת תחזית**: 12 שבועות קדימה × עובדות פעילות, **תאים עריכים** ע"י מנהלת
- **צבעי תאים**: לבן=ברירת מחדל, צהוב=העובדת הזינה, כחול=דריסה ידנית מנהלת
- **עמודת תקן** — מספר משמרות נדרש + 100%, עריכה ידנית, ברירת מחדל מחגים
- **עמודת צפי** — סה"כ משמרות צפויות + אחוז כיסוי
- **גרף 3 קווים** (Chart.js): צפי קיים / נדרש 100% / יעד 125%
- שילוב חגים ומועדי ישראל (holiday/holiday_eve/memorial)
- **התראות מפורטות**: כמה משמרות חסרות, מתוכן שישי/ערב חג, המלצת גיוס
- **מדריך שימוש מובנה** — מקרא צבעים, סימנים, הסבר עמודות
- popup עריכת תא עם שם עובדת, שישי, ימים חסומים, איפוס דריסה
- פאנל הערות עובדות + תאריכי עזיבה
- סימולטור גיוס עובדת חדשה
- תמיכה בחפיפה (🎓) — עובדת בחפיפה לא נספרת בתחזית

---

## Employee Dashboard
- 5 טאבים של שבועות (נעול / פתוח / 3 עתידיים)
- חלון הגשה: ראשון 20:00 → ראשון הבא 20:00
- בחירת בוקר/ערב לכל יום (✓/✗)
- משמרות מיוחדות (✨)
- סיכום → הגשה → אישור
- **סקשן "זמינות עתידית" (BETA):**
  - תקופות זמינות מופחתת (מבחנים, חופש, אישי)
  - ימים/משמרות חסומים ספציפיים בתוך תקופה (exclusions)
  - תאריך עזיבה צפוי
  - הערות חופשיות למנהלת
  - נשמר ישירות ב-Supabase, מוצג ב-ForecastTab

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
- Admin bg: `#2D5016`
- Employee bg: `#EBF3D8`
- Cream: `#F5F0E8`
- Olive: `#5A8A1F`

---

## Deploy
- **Platform:** Vercel
- **vercel.json:** rewrites `/*` → `/index.html`
- **Build:** `tsc -b && vite build`
- **Env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## גרסאות Git אחרונות (כיוון פיתוח)
- rebrand ל"נוי השדה — סניף שוהם" + שפה ניטרלית מגדרית
- הרחבת סימולטור גיוס (סוג משמרת + שישי)
- טאב כוח אדם חדש
- מערכת Undo גלובלית (Ctrl+Z) per-week
- שיבוץ אוטומטי (slot בודד + משמרת שלמה)
- אילוצי וולט, סגירת משמרות, תכנון קדימה

---

## נקודות לשיפור אפשריות
1. **WeeklyBoard.tsx** — קומפוננטה ענקית, מועמדת לפיצול
2. **כיסוי בדיקות** — Playwright קיים אבל מוגבל; unit tests חסרים
3. **ביצועים** — שימוש מועט ב-useCallback/useMemo
4. **נגישות** — ללא ARIA labels
5. **Error boundary** — אין global error handling
6. **PDF export** — ספרייה מותקנת אבל לא משולבת ב-UI

---

*עדכון אחרון: 2026-04-18*

# משימות ידניות לאלון — Shift Manager

רשימת פעולות שדורשות התערבות ידנית (Claude לא יכול לבצע אותן אוטומטית).

עודכן לאחרונה: 2026-05-21.

---

## ✅ אין משימות ידניות פתוחות

כל המשימות הידניות הושלמו.

---

## היסטוריה

### 1. הרצת SQL ל-Supabase — טבלת `board_settings` — ✅ הושלם (2026-05-21)

- **מה היה צריך:** יצירת טבלת `board_settings` ב-Supabase לסנכרון `voltFlags`
  ו-`customShifts` בין מכשירים.
- **בוצע ע"י אלון:** ה-SQL הורץ ב-Supabase SQL Editor.
- **השלמת קוד ע"י Claude:** `WeeklyBoard.tsx` חובר למודול `boardSettingsStorage.ts` —
  טעינה מ-Supabase עם cache ב-localStorage, סנכרון realtime, ושמירה דרך Supabase.
  אומת עם `tsc` + `vite build` + 72 טסטים.

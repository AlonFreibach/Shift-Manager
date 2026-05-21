# משימות ידניות לאלון — Shift Manager

רשימת פעולות שדורשות התערבות ידנית (Claude לא יכול לבצע אותן אוטומטית).

נוצר אוטומטית במהלך עבודת לילה. עודכן לאחרונה: 2026-05-21.

---

## 1. הרצת SQL ל-Supabase — טבלת `board_settings`

**הקשר:** משימה #5 בבקלוג — העברת `voltFlags` ו-`customShifts` מ-localStorage ל-Supabase
כדי שיסתנכרנו בין מכשירים (כמו שטבלת `schedules` כבר עושה).

**למה ידני:** יצירת טבלה (DDL) דורשת הרשאות מנהל ב-Supabase. ל-Claude יש רק
מפתח `anon` שלא יכול להריץ `CREATE TABLE`.

**מה לעשות:** פתח את Supabase → SQL Editor → הדבק והרץ:

```sql
CREATE TABLE IF NOT EXISTS board_settings (
  week_start    date PRIMARY KEY,
  volt_flags    jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_shifts jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE board_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board_settings_all" ON board_settings
  FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE board_settings;
```

**אחרי הרצת ה-SQL:** נותר שלב קוד אחד — לחבר את `WeeklyBoard.tsx` להשתמש
במודול `src/lib/boardSettingsStorage.ts` (כבר נכתב ומוכן) במקום קריאה/כתיבה
ישירה ל-localStorage. השלב הזה לא בוצע בלילה כי `WeeklyBoard.tsx` הוא הקובץ
הקריטי ביותר (~3700 שורות) ועדיף לבצע בו רפקטור כזה כשאתה נוכח לבדוק.
המודול `boardSettingsStorage.ts` מתפקד בדיוק כמו `scheduleStorage.ts` —
אם הטבלה לא קיימת הוא פשוט נופל בחזרה ל-localStorage, כך שאין סיכון.

**סטטוס:** ⏳ ממתין

---

# משימות ידניות לאלון — Shift Manager

רשימת פעולות שדורשות התערבות ידנית (Claude לא יכול לבצע אותן אוטומטית).

עודכן לאחרונה: 2026-06-01.

---

## 📋 משימות ידניות פתוחות

### 0. ⚠️ דחוף — ה-Deploy האוטומטי של Vercel לא התניע (commits `fd5d222` + `b768166`)

- **מה קרה:** דחפתי שני commits ל-`main` (סנכרון "רצוי" + בורר טווח תחזית). אומת
  מקומית: `tsc -b --force` ✓, `vite build` ✓, 72/72 טסטים ✓. **אבל** האתר החי עדיין
  מגיש את ה-bundle הישן (`index-DCaoxOUh.js`) — לא עלה deployment חדש לפרודקשן גם
  אחרי ~10 דקות. הקוד תקין ונמצא על `origin/main`; זו בעיית תשתית-deploy בלבד.
- **למה ידני:** Vercel לא מקושר מקומית (אין `.vercel/project.json` ואין token),
  ו-`vercel login` הוא אינטראקטיבי — לא ניתן לאוטומציה.
- **מה לעשות (אחת מהאפשרויות):**
  1. **הכי פשוט בתוך הסשן:** להריץ כאן `!npx vercel login` ואז `!npx vercel --prod`
     (אחרי לוגין, פקודה אחת מעלה את הפרודקשן).
  2. להיכנס ל-Vercel Dashboard → הפרויקט → Deployments — לבדוק אם יש deployment
     שנכשל/תקוע, ולעשות **Redeploy**.
  3. לוודא שאינטגרציית GitHub עדיין מחוברת (Settings → Git). אם התנתקה — לחבר מחדש
     ואז לדחוף commit ריק (`git commit --allow-empty -m "redeploy" && git push`).
- **בדיקת אימות אחרי שעולה:** האתר צריך להפנות ל-`index-DQO-4MBR.js` (או חדש יותר),
  ובטאב "תחזית כ"א" יופיע **בורר טווח (12 / 24 / 52 שבועות)** מעל הטבלה.

### 1. הרצת SQL ל-Supabase — טבלת `app_settings` (לסנכרון דריסות "רצוי")

- **מה צריך:** ליצור טבלת `app_settings` ב-Supabase כדי שדריסות עמודת **"רצוי"**
  בתחזית כ"א יסתנכרנו בין מכשירים (כרגע נשמרות גם ב-localStorage כ-cache).
- **למה ידני:** יצירת טבלה (DDL) דורשת הרשאות SQL Editor — ה-anon key של האפליקציה
  לא יכול. **הקוד כבר עובד גם בלי הטבלה** (נופל חזרה ל-localStorage כמו `board_settings`),
  אז שום דבר לא שבור — הסנכרון בין מכשירים פשוט יתחיל לפעול ברגע שתריץ את ה-SQL.
- **איך:** Supabase → SQL Editor → להדביק ולהריץ:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_all" ON app_settings FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
```

- **אחרי ההרצה:** הדריסה הראשונה שכבר קיימת ב-localStorage תהגר אוטומטית ל-Supabase
  בטעינה הבאה של טאב תחזית כ"א. אין צורך בשינוי קוד נוסף.

---

## היסטוריה

### 1. הרצת SQL ל-Supabase — טבלת `board_settings` — ✅ הושלם (2026-05-21)

- **מה היה צריך:** יצירת טבלת `board_settings` ב-Supabase לסנכרון `voltFlags`
  ו-`customShifts` בין מכשירים.
- **בוצע ע"י אלון:** ה-SQL הורץ ב-Supabase SQL Editor.
- **השלמת קוד ע"י Claude:** `WeeklyBoard.tsx` חובר למודול `boardSettingsStorage.ts` —
  טעינה מ-Supabase עם cache ב-localStorage, סנכרון realtime, ושמירה דרך Supabase.
  אומת עם `tsc` + `vite build` + 72 טסטים.

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# מנהל משמרות - הוראות Copilot

פרויקט ניהול משמרות עבודה בנוי עם React, Vite ו-Tailwind CSS.

## 📋 סטנדרטים בפרויקט

- **שפה:** Hebrew עברית
- **כיוון:** RTL (מימין לשמאל)
- **סגנון:** Tailwind CSS
- **ניהול מצב:** useState + useLocalStorage
- **שמירת נתונים:** localStorage (ללא backend)

## 🗂️ מבנה תיקיות

- `src/components/` - קומפוננטות React
- `src/hooks/` - Hook מותאמים (כגון useLocalStorage)
- `src/utils/` - פונקציות עזר
- `src/data/` - קבצי נתונים (employees.js)

## 🔧 סגנונות קוד

- השתמש ב-TypeScript לבטיחות סוגים
- כל הקומפוננטות ב-tsx/ts
- שימוש ב-Tailwind classes במקום CSS מותאם (כאשר זה אפשרי)
- העברית בכל התוויות וה-UI

## 📌 הרעיון הראשי

מערכת ניהול משמרות שחוסכת נתונים ב-localStorage של הדפדפן ללא צורך בserver.

## 🛠️ פקודות עזר

- `npm run dev` - הרצת שרת פיתוח
- `npm run build` - בנייה לייצור
- `npm run lint` - בדיקת ESLint

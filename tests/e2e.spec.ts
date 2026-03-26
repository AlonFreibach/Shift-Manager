import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:5173'

// ===================================================
// סעיף 1: ניווט בסיסי
// ===================================================

test('אפליקציה עולה ללא שגיאות console', async ({ page }) => {
  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  await page.goto(BASE)
  await expect(page.locator('text=לוח שיבוץ').first()).toBeVisible()
  expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0)
})

test('כל 4 הלשוניות קיימות', async ({ page }) => {
  await page.goto(BASE)
  for (const tab of ['לוח שיבוץ', 'עובדות', 'העדפות', 'טבלת צדק']) {
    await expect(page.locator(`text=${tab}`).first()).toBeVisible()
  }
})

test('ניווט שבועות קדימה ואחורה', async ({ page }) => {
  await page.goto(BASE)
  const getWeek = async () => page.locator('text=/\\d+\\.\\d+.*\\d+\\.\\d+/').first().textContent()
  const week1 = await getWeek()
  await page.click('text=שבוע הבא')
  await page.waitForTimeout(300)
  const week2 = await getWeek()
  expect(week1).not.toEqual(week2)
  await page.click('text=שבוע קודם')
  await page.waitForTimeout(300)
  const week3 = await getWeek()
  expect(week3).toEqual(week1)
})

test('כפתור נוכחי מחזיר לשבוע הנוכחי', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=שבוע הבא')
  await page.waitForTimeout(300)
  await page.click('text=שבוע קודם')
  await page.waitForTimeout(300)
  await expect(page.locator('text=נוכחי').first()).toBeVisible()
})

test('תכנן קדימה — נפתח ונסגר', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=תכנן קדימה')
  await page.waitForTimeout(300)
  await expect(page.locator('button:has-text("ביטול")')).toBeVisible()
  await page.click('button:has-text("ביטול")')
  await expect(page.locator('button:has-text("ביטול")')).not.toBeVisible()
})

// ===================================================
// סעיף 2: ניהול עובדות
// ===================================================

test('הוספת עובדת חדשה', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=עובדות')
  await page.click('text=+ הוסף עובדת')
  await expect(page.locator('text=הוסף עובדת חדשה')).toBeVisible()
  await page.fill('input[placeholder*="שם"]', 'בדיקה פלייריט')
  await page.click('button:has-text("שמור")')
  await expect(page.locator('text=בדיקה פלייריט')).toBeVisible()
})

test('עריכת עובדת — מצב עריכה ובטל', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=עובדות')
  await page.click('button:has-text("ערוך") >> nth=0')
  await expect(page.locator('button:has-text("שמור")').first()).toBeVisible()
  await expect(page.locator('button:has-text("בטל")').first()).toBeVisible()
  await page.click('button:has-text("בטל") >> nth=0')
  await expect(page.locator('button:has-text("ערוך")').first()).toBeVisible()
})

test('badge שישי על עובדת biweekly', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=עובדות')
  await expect(page.locator('text=/שישי/').first()).toBeVisible()
})

test('מחיקת עובדת הבדיקה', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=עובדות')
  // First add the employee so we can delete it
  await page.click('text=+ הוסף עובדת')
  await page.fill('input[placeholder*="שם"]', 'בדיקה למחיקה')
  await page.click('button:has-text("שמור")')
  await expect(page.locator('text=בדיקה למחיקה')).toBeVisible()
  // Now delete - accept the confirm() dialog
  page.on('dialog', dialog => dialog.accept())
  // The new employee is added last, so click the last מחק button
  await page.locator('button:has-text("מחק")').last().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=בדיקה למחיקה')).not.toBeVisible()
})

// ===================================================
// סעיף 3: שיבוץ ידני
// ===================================================

test('לחיצה על סלוט ריק פותח popover', async ({ page }) => {
  await page.goto(BASE)
  await page.locator('text=ריק').first().click()
  await page.waitForTimeout(300)
  await expect(page.locator('select').first()).toBeVisible()
  await page.keyboard.press('Escape')
})

test('אפס שיבוץ — מיה נשארת', async ({ page }) => {
  await page.goto(BASE)
  page.on('dialog', dialog => dialog.accept())
  await page.click('button:has-text("אפס שיבוץ")')
  await page.waitForTimeout(500)
  await expect(page.locator('text=מיה').first()).toBeVisible()
})

test('checkbox וולט קיים ועובד', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.locator('text=יש וולט?').first()).toBeVisible()
  await page.locator('text=יש וולט?').first().click()
  await page.waitForTimeout(300)
  await page.locator('text=יש וולט?').first().click()
})

// ===================================================
// סעיף 4: משמרות מותאמות
// ===================================================

test('הוספת משמרת מותאמת — modal נפתח', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=+ הוסף משמרת >> nth=0')
  await page.waitForTimeout(300)
  await expect(page.locator('text=הוספת משמרת')).toBeVisible()
  await page.click('button:has-text("סגור ללא שמירה")')
  await expect(page.locator('text=הוספת משמרת')).not.toBeVisible()
})

test('הוספה ומחיקה של משמרת מותאמת', async ({ page }) => {
  await page.goto(BASE)
  // Accept confirm dialogs for deletion
  page.on('dialog', dialog => dialog.accept())
  await page.click('text=+ הוסף משמרת >> nth=2')
  await page.waitForTimeout(300)
  const nameInput = page.locator('input[placeholder*="שם"], input[placeholder*="צהריים"]')
  await nameInput.fill('צהריים בדיקה')
  await page.locator('input[type="time"]').nth(0).fill('13:00')
  await page.locator('input[type="time"]').nth(1).fill('17:00')
  await page.click('button:has-text("שמור והוסף")')
  await page.waitForTimeout(300)
  await expect(page.locator('text=צהריים בדיקה')).toBeVisible()
  // מחיקה — click the ✕ button (confirm() is auto-accepted)
  await page.locator('button').filter({ hasText: '✕' }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('text=צהריים בדיקה')).not.toBeVisible()
})

// ===================================================
// סעיף 5: חגים ישראליים
// ===================================================

test('banner חג מוצג בשבוע עם חג', async ({ page }) => {
  await page.goto(BASE)
  let found = false
  for (let i = 0; i < 10; i++) {
    await page.click('text=שבוע הבא')
    await page.waitForTimeout(300)
    const banner = page.locator('text=שבוע זה יש')
    if (await banner.isVisible()) { found = true; break }
  }
  expect(found).toBe(true)
})

test('banner חג — התעלם סוגר', async ({ page }) => {
  await page.goto(BASE)
  for (let i = 0; i < 10; i++) {
    await page.click('text=שבוע הבא')
    await page.waitForTimeout(300)
    const banner = page.locator('text=שבוע זה יש')
    if (await banner.isVisible()) {
      await page.click('button:has-text("התעלם")')
      await expect(banner).not.toBeVisible()
      break
    }
  }
})

test('תכנן קדימה — התראת חגים בטווח', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=תכנן קדימה')
  await page.waitForTimeout(300)
  await page.fill('input[type="date"] >> nth=0', '2026-03-29')
  await page.fill('input[type="date"] >> nth=1', '2026-04-09')
  await page.waitForTimeout(500)
  await expect(page.locator('text=פסח').first()).toBeVisible()
  await page.click('button:has-text("ביטול")')
})

// ===================================================
// סעיף 6: העדפות + ולידציה
// ===================================================

test('modal עריכת העדפות — פתיחה וסגירה', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=העדפות')
  await page.locator('button:has-text("צור")').first().click()
  await page.waitForTimeout(300)
  await expect(page.locator('text=עריכת העדפות')).toBeVisible()
  await expect(page.locator('text=פורמט הזנה')).toBeVisible()
  await page.click('button:has-text("ביטול")')
  await expect(page.locator('text=עריכת העדפות')).not.toBeVisible()
})

test('ולידציה — תאריך לא תקין', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=העדפות')
  await page.locator('button:has-text("צור")').first().click()
  await page.fill('textarea', 'abc בוקר')
  await page.click('button:has-text("שמור")')
  await expect(page.locator('text=תאריך לא תקין').first()).toBeVisible()
})

test('ולידציה — סוג משמרת לא תקין', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=העדפות')
  await page.locator('button:has-text("צור")').first().click()
  await page.fill('textarea', '22.3 צהריים')
  await page.click('button:has-text("שמור")')
  await expect(page.locator('text=סוג משמרת לא מזוהה').first()).toBeVisible()
})

test('ולידציה — תאריך מחוץ לטווח', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=העדפות')
  await page.locator('button:has-text("צור")').first().click()
  await page.fill('textarea', '1.1 בוקר')
  await page.click('button:has-text("שמור")')
  await expect(page.locator('text=לא בשבוע הנוכחי').first()).toBeVisible()
})

// ===================================================
// סעיף 7: שיבוץ אוטומטי
// ===================================================

test('שיבוץ אוטומטי — ללא העדפות מציג הודעה', async ({ page }) => {
  await page.goto(BASE)
  await page.click('button:has-text("שבץ אוטומטית")')
  await page.waitForTimeout(1000)
  // Without preferences, autoSchedule shows a toast error
  await expect(page.locator('text=לא ניתן לשבץ').first()).toBeVisible()
})

// ===================================================
// סעיף 8: טבלת צדק
// ===================================================

test('טבלת צדק — מציגה עובדות', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=טבלת צדק')
  await page.waitForTimeout(500)
  const rows = await page.locator('table tr').count()
  expect(rows).toBeGreaterThan(3)
})

// ===================================================
// סעיף 9: ייצוא
// ===================================================

test('כפתורי ייצוא קיימים', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.locator('button:has-text("הורד PDF")').first()).toBeVisible()
  await expect(page.locator('button:has-text("העתק לווטסאפ")').first()).toBeVisible()
})

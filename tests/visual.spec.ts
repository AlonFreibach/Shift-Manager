import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:5173'

test('לוח שיבוץ — מצב ריק', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'tests/screenshots/01-board-empty.png', fullPage: true })
})

test('לוח שיבוץ — אחרי שיבוץ אוטומטי', async ({ page }) => {
  await page.goto(BASE)
  await page.click('button:has-text("שבץ אוטומטית")')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'tests/screenshots/02-board-scheduled.png', fullPage: true })
})

test('לשונית עובדות', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=עובדות')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'tests/screenshots/03-employees.png', fullPage: true })
})

test('כרטיס עובדת — מצב עריכה', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=עובדות')
  await page.locator('button:has-text("ערוך")').first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'tests/screenshots/04-employee-edit.png', fullPage: true })
})

test('לשונית העדפות', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=העדפות')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'tests/screenshots/05-preferences.png', fullPage: true })
})

test('modal עריכת העדפות', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=העדפות')
  await page.locator('button:has-text("צור")').first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'tests/screenshots/06-preferences-modal.png', fullPage: true })
})

test('ולידציה העדפות — שגיאה', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=העדפות')
  await page.locator('button:has-text("צור")').first().click()
  await page.fill('textarea', 'abc בוקר')
  await page.click('button:has-text("שמור")')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'tests/screenshots/07-preferences-error.png', fullPage: true })
})

test('טבלת צדק', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=טבלת צדק')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'tests/screenshots/08-fairness.png', fullPage: true })
})

test('modal הוספת משמרת מותאמת', async ({ page }) => {
  await page.goto(BASE)
  await page.locator('text=+ הוסף משמרת').first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'tests/screenshots/09-custom-shift-modal.png', fullPage: true })
})

test('modal תכנן קדימה', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=תכנן קדימה')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'tests/screenshots/10-plan-ahead-modal.png', fullPage: true })
})

test('banner חג', async ({ page }) => {
  await page.goto(BASE)
  for (let i = 0; i < 10; i++) {
    await page.click('text=שבוע הבא')
    await page.waitForTimeout(300)
    const banner = page.locator('text=שבוע זה יש')
    if (await banner.isVisible()) {
      await page.screenshot({ path: 'tests/screenshots/11-holiday-banner.png', fullPage: true })
      break
    }
  }
})

test('לוח שיבוץ — שבוע עם חג', async ({ page }) => {
  await page.goto(BASE)
  for (let i = 0; i < 10; i++) {
    await page.click('text=שבוע הבא')
    await page.waitForTimeout(300)
    const banner = page.locator('text=שבוע זה יש')
    if (await banner.isVisible()) {
      await page.screenshot({ path: 'tests/screenshots/12-board-with-holiday.png', fullPage: true })
      break
    }
  }
})

test('modal משמרות מיוחדות לטווח', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=תכנן קדימה')
  await page.waitForTimeout(300)
  await page.locator('input[type="date"]').first().fill('2026-03-29')
  await page.locator('input[type="date"]').nth(1).fill('2026-04-09')
  await page.waitForTimeout(500)
  await page.click('button:has-text("המשך לשיבוץ")')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'tests/screenshots/13-special-shifts-modal.png', fullPage: true })
})

test('modal סיכום שיבוץ', async ({ page }) => {
  await page.goto(BASE)
  await page.click('text=תכנן קדימה')
  await page.waitForTimeout(300)
  await page.locator('input[type="date"]').first().fill('2026-03-29')
  await page.locator('input[type="date"]').nth(1).fill('2026-04-04')
  await page.waitForTimeout(300)
  await page.click('button:has-text("המשך לשיבוץ")')
  await page.waitForTimeout(300)
  await page.click('button:has-text("לא, המשך לשיבוץ")')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'tests/screenshots/14-schedule-summary.png', fullPage: true })
})

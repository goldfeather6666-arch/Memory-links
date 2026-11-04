import { expect, test } from '@playwright/test'

test('hero primary CTA points to the solution', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#hero a[href="#solution"]')).toBeVisible()
})

test('hero secondary CTA points to the problem', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#hero a[href="#problem"]')).toBeVisible()
})

test('final CTA anchors to the waitlist form', async ({ page }) => {
  await page.goto('/')
  const el = page.locator('#final-cta a[href="#waitlist-form"]')
  await expect(el).toBeVisible()
  await el.click()
  await expect(page).toHaveURL(/#waitlist-form/)
})

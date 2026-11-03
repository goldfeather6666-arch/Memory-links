import { expect, test } from '@playwright/test'

test('waitlist demo form submits and confirms locally', async ({ page }) => {
  await page.goto('/')
  await page.locator('#final-cta').scrollIntoViewIfNeeded()
  await page.locator('[data-testid="waitlist-form"] input[name="email"]').fill('you@example.com')
  await page.locator('[data-testid="waitlist-submit"]').click()
  const message = page.locator('[data-testid="waitlist-message"]')
  await expect(message).toBeVisible()
  await expect(message).toContainText(/demo/i)
})

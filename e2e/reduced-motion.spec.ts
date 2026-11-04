import { expect, test } from '@playwright/test'

test('loads cleanly with reduced motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto('/')
  await page.waitForTimeout(1200)
  expect(errors).toEqual([])
  await expect(page.locator('#hero')).toBeVisible()
})

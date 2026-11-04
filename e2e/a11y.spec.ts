import { expect, test } from '@playwright/test'

test('buttons have accessible names', async ({ page }) => {
  await page.goto('/')
  const buttons = page.locator('button')
  const count = await buttons.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const el = buttons.nth(i)
    const label = (await el.getAttribute('aria-label')) ?? (await el.textContent())
    expect(label?.trim()).toBeTruthy()
  }
})

test('text inputs have accessible labels', async ({ page }) => {
  await page.goto('/')
  const inputs = page.locator('input')
  const count = await inputs.count()
  for (let i = 0; i < count; i++) {
    const aria = await inputs.nth(i).getAttribute('aria-label')
    expect(aria).toBeTruthy()
  }
})

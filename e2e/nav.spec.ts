import { expect, test } from '@playwright/test'

const TARGETS = [
  'problem',
  'solution',
  'dimensions',
  'digital-universe',
  'agent-memory',
  'knowledge-graph',
  'privacy',
  'final-cta',
]

test('section anchor links exist and navigate', async ({ page }) => {
  await page.goto('/')
  for (const target of TARGETS) {
    const href = `#${target}`
    await expect(page.locator(`a[href="${href}"]`).first()).toHaveAttribute('href', href)
    await page.evaluate((hash) => {
      const el = document.querySelector(`a[href="${hash}"]`) as HTMLElement | null
      el?.click()
    }, href)
    await page.waitForTimeout(150)
    await expect(page).toHaveURL(new RegExp(href))
  }
})

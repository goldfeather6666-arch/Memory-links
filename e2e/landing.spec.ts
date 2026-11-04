import { expect, test } from '@playwright/test'

const SECTIONS = [
  'hero',
  'problem',
  'solution',
  'dimensions',
  'digital-universe',
  'agent-memory',
  'knowledge-graph',
  'privacy',
  'final-cta',
  'footer',
]

test('landing page loads with the brand title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/MNEMOSYNE/)
})

test('all sections are present', async ({ page }) => {
  await page.goto('/')
  for (const id of SECTIONS) {
    await expect(page.locator(`#${id}`)).toBeVisible()
  }
})

test('no console or page errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto('/')
  await page.waitForTimeout(1500)
  expect(errors).toEqual([])
})

test('no horizontal overflow', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

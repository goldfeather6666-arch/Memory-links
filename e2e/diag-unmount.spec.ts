import { test, expect } from '@playwright/test'

test('diag: capture unmount stack', async ({ page }) => {
  const hits: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('unmount a root')) {
      hits.push(`CONSOLE: ${msg.text()}`)
    }
  })
  page.on('pageerror', (err) => {
    if (String(err).includes('unmount a root')) {
      hits.push(`PAGEERROR: ${String(err)}`)
      hits.push(`STACK: ${err.stack?.split('\n').slice(0, 8).join('\n') ?? 'n/a'}`)
    }
  })
  await page.goto('/')
  await page.waitForTimeout(2500)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1200)
  console.log('=== HITS ===\n' + hits.join('\n---\n'))
  expect(hits.length).toBe(0)
})

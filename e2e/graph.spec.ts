import { expect, test } from '@playwright/test'

test('interactive knowledge graph canvas renders', async ({ page }) => {
  await page.goto('/')
  await page.locator('#knowledge-graph').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-testid="knowledge-graph-canvas"]')).toBeVisible()
})

import type { Page } from '@playwright/test'
import { LOGIN_BUTTON, SELECT_PROMPT } from './support/constants.ts'
import { PLAYLISTS } from './support/data.ts'
import { expect, readStoredTokens, test } from './support/fixtures.ts'

async function openDrawer(page: Page) {
  const menuButton = page.getByRole('button', { name: 'Menu' })
  await menuButton.click()
  const drawer = page.getByRole('dialog', { name: 'Playlists' })
  await expect(drawer).toBeVisible()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  return { menuButton, drawer }
}

test('drawer lists owned and saved playlists and hides restricted ones', async ({
  page,
}) => {
  await page.goto('./')
  await expect(page.getByText(SELECT_PROMPT)).toBeVisible()
  const { menuButton, drawer } = await openDrawer(page)

  const owned = drawer.getByRole('region', { name: 'Your playlists' })
  const saved = drawer.getByRole('region', { name: 'Saved playlists' })
  await expect(owned.getByRole('button')).toHaveCount(2)
  await expect(
    owned.getByRole('button', { name: PLAYLISTS.mine.name }),
  ).toBeEnabled()
  await expect(
    owned.getByRole('button', { name: PLAYLISTS.second.name }),
  ).toBeEnabled()

  await expect(saved.getByRole('button')).toHaveCount(1)
  await expect(
    saved.getByRole('button', { name: PLAYLISTS.shared.name }),
  ).toBeEnabled()
  for (const restricted of [PLAYLISTS.friend, PLAYLISTS.radar]) {
    await expect(
      drawer.getByRole('button', { name: restricted.name }),
    ).toHaveCount(0)
  }

  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  await expect(menuButton).toBeFocused()

  await openDrawer(page)
  const backdrop = page.getByTestId('drawer-backdrop')
  const box = await backdrop.boundingBox()
  await backdrop.click({
    position: { x: box!.width - 10, y: box!.height / 2 },
  })
  await expect(drawer).toBeHidden()
  await expect(menuButton).toBeFocused()
})

test('logout from the drawer returns to the login screen', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText(SELECT_PROMPT)).toBeVisible()
  const { drawer } = await openDrawer(page)

  await drawer.getByRole('button', { name: 'Log out' }).click()

  await expect(page.getByRole('button', { name: LOGIN_BUTTON })).toBeVisible()
  expect(await readStoredTokens(page)).toBeNull()

  await page.reload()
  await expect(page.getByRole('button', { name: LOGIN_BUTTON })).toBeVisible()
})

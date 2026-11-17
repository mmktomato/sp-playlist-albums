import { LOGIN_BUTTON } from './support/constants.ts'
import { ME, PLAYLISTS } from './support/data.ts'
import { expect, test } from './support/fixtures.ts'

test.describe('logged out', () => {
  test.use({ auth: 'none' })

  test('renders the app shell', async ({ page, spotify }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: LOGIN_BUTTON })).toBeVisible()
    expect(spotify.apiRequests).toHaveLength(0)
  })
})

test('debug page lists playlists from the mocked API', async ({
  page,
  spotify,
}) => {
  await page.goto('./?debug=1')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Debug' }),
  ).toBeVisible()
  await expect(page.getByTestId('me-id')).toHaveText(ME.id)
  await expect(
    page.getByRole('heading', {
      name: `Playlists (${spotify.data.playlists.length})`,
    }),
  ).toBeVisible()

  const mine = page.getByTestId(`playlist-${PLAYLISTS.mine.id}`)
  const friend = page.getByTestId(`playlist-${PLAYLISTS.friend.id}`)
  await expect(mine.getByTestId('access-owner-or-collaborative')).toHaveText(
    'true',
  )
  await expect(friend.getByTestId('access-owner-or-collaborative')).toHaveText(
    'false',
  )
  await expect(friend.getByTestId('access-items-field')).toHaveText('false')

  await mine.getByRole('button', { name: PLAYLISTS.mine.name }).click()
  await expect(page.getByTestId('album-count')).toHaveText('3')
})

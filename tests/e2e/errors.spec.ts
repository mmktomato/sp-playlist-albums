import {
  LOGIN_BUTTON,
  OFFLINE_TEXT,
  SELECT_PROMPT,
} from './support/constants.ts'
import {
  ALPHA,
  ME,
  PLAYLISTS,
  addPlaylist,
  trackEntry,
} from './support/data.ts'
import {
  FAILED_RESOURCE,
  FETCH_FAILED,
  STORED_ACCESS_TOKEN,
  STORED_REFRESH_TOKEN,
  expect,
  readStoredTokens,
  test,
} from './support/fixtures.ts'
import { spotifyError } from './support/spotifyMock.ts'

const LOCKED = { id: 'pl-locked', name: 'Locked List', owner: ME }

test.describe('API errors', () => {
  test.beforeEach(({ consoleErrors }) => {
    consoleErrors.allow(FAILED_RESOURCE)
  })

  test('shows a restriction message when a selectable playlist returns 403', async ({
    page,
    spotify,
  }) => {
    addPlaylist(spotify.data, LOCKED, [trackEntry('t-locked', ALPHA)])
    spotify.respond(
      `/v1/playlists/${LOCKED.id}/items`,
      spotifyError(403, 'Forbidden'),
    )

    await page.goto(`./?playlist=${LOCKED.id}`)

    const alert = page.getByRole('main').getByRole('alert')
    await expect(alert).toContainText("Can't load due to Spotify restrictions")
    await expect(alert.getByRole('button', { name: 'Retry' })).toHaveCount(0)
    expect(spotify.playlistItemsRequests(LOCKED.id)).toHaveLength(1)
  })

  test('does not request items of a playlist owned by someone else', async ({
    page,
    spotify,
  }) => {
    await page.goto(`./?playlist=${PLAYLISTS.friend.id}`)

    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Unavailable due to Spotify restrictions',
    )
    expect(spotify.playlistItemsRequests(PLAYLISTS.friend.id)).toHaveLength(0)
  })

  test('shows a dedicated message when GET /me returns 403', async ({
    page,
    spotify,
  }) => {
    spotify.respond(
      '/v1/me',
      spotifyError(403, 'User not registered in the Developer Dashboard'),
    )

    await page.goto('./')

    const alert = page.getByRole('main').getByRole('alert')
    await expect(alert).toContainText(
      "This account isn't allowed to use the app",
    )
    expect(spotify.requestsTo('/v1/me/playlists')).toHaveLength(0)

    await alert.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByRole('button', { name: LOGIN_BUTTON })).toBeVisible()
    expect(await readStoredTokens(page)).toBeNull()
  })

  test('shows a quota message on 429 QUOTA_EXCEEDED without retrying', async ({
    page,
    spotify,
  }) => {
    spotify.respond(
      '/v1/me/playlists',
      spotifyError(429, 'Quota exceeded', 'QUOTA_EXCEEDED'),
    )

    await page.goto('./')

    const alert = page.getByRole('main').getByRole('alert')
    await expect(alert).toContainText('Spotify API rate limit reached')
    await expect(alert).toContainText('Please wait a while and try again.')
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(spotify.requestsTo('/v1/me/playlists')).toHaveLength(1)
    expect(await readStoredTokens(page)).not.toBeNull()
  })
})

test.describe('offline', () => {
  test('shows the unavailable message when API requests fail and keeps the session', async ({
    page,
    spotify,
    consoleErrors,
  }) => {
    consoleErrors.allow(FAILED_RESOURCE, FETCH_FAILED)
    spotify.offline = true

    await page.goto('./')

    const alert = page.getByRole('main').getByRole('alert')
    await expect(alert).toContainText(OFFLINE_TEXT)
    await expect(page.getByRole('button', { name: LOGIN_BUTTON })).toHaveCount(
      0,
    )
    expect(await readStoredTokens(page)).toMatchObject({
      accessToken: STORED_ACCESS_TOKEN,
      refreshToken: STORED_REFRESH_TOKEN,
    })

    spotify.offline = false
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText(SELECT_PROMPT)).toBeVisible()
  })

  test('shows the unavailable message when the browser goes offline and keeps the session', async ({
    page,
    context,
  }) => {
    await page.goto(`./?playlist=${PLAYLISTS.mine.id}`)
    await expect(page.getByText('3 / 3 albums')).toBeVisible()

    await context.setOffline(true)

    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      OFFLINE_TEXT,
    )
    await expect(
      page.getByRole('main').getByRole('link', { name: ALPHA.name }),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: LOGIN_BUTTON })).toHaveCount(
      0,
    )
    expect(await readStoredTokens(page)).toMatchObject({
      accessToken: STORED_ACCESS_TOKEN,
      refreshToken: STORED_REFRESH_TOKEN,
    })

    await context.setOffline(false)
    await expect(
      page.getByRole('main').getByRole('link', { name: ALPHA.name }),
    ).toBeVisible()
  })

  test.describe('logged out', () => {
    test.use({ auth: 'none' })

    test('disables the login button while offline', async ({
      page,
      context,
    }) => {
      await page.goto('./')
      const loginButton = page.getByRole('button', { name: LOGIN_BUTTON })
      await expect(loginButton).toBeEnabled()

      await context.setOffline(true)

      await expect(page.getByRole('alert')).toHaveText(OFFLINE_TEXT)
      await expect(loginButton).toBeDisabled()

      await context.setOffline(false)
      await expect(loginButton).toBeEnabled()
    })
  })
})

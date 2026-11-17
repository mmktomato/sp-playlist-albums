import { createHash } from 'node:crypto'
import { PKCE_KEY, type StoredPkce } from '../../src/auth/tokenStore.ts'
import {
  E2E_CLIENT_ID,
  LOGIN_BUTTON,
  REQUIRED_SCOPES,
  SELECT_PROMPT,
} from './support/constants.ts'
import {
  EXPIRED_ACCESS_TOKEN,
  FAILED_RESOURCE,
  STORED_ACCESS_TOKEN,
  STORED_REFRESH_TOKEN,
  expect,
  readStoredPkce,
  readStoredTokens,
  test,
} from './support/fixtures.ts'
import {
  AUTHORIZE_URL,
  CODE_ACCESS_TOKEN,
  CODE_REFRESH_TOKEN,
  REFRESHED_ACCESS_TOKEN,
  spotifyError,
} from './support/spotifyMock.ts'

const APP_TITLE = 'Playlist Albums'

test.describe('login redirect', () => {
  test.use({ auth: 'none' })

  test('shows the login screen and redirects to the authorize URL', async ({
    page,
    baseURL,
    spotify,
  }) => {
    await page.goto('./')
    await expect(
      page.getByRole('heading', { level: 1, name: APP_TITLE }),
    ).toBeVisible()
    const loginButton = page.getByRole('button', { name: LOGIN_BUTTON })
    await expect(loginButton).toBeEnabled()

    const authorizeRequest = page.waitForRequest((request) =>
      request.url().startsWith(AUTHORIZE_URL),
    )
    await loginButton.click()
    const url = new URL((await authorizeRequest).url())
    await expect(
      page.getByRole('heading', { name: 'Authorize stub' }),
    ).toBeVisible()

    expect(url.origin + url.pathname).toBe(AUTHORIZE_URL)
    const params = url.searchParams
    expect(params.get('response_type')).toBe('code')
    expect(params.get('client_id')).toBe(E2E_CLIENT_ID)
    expect(params.get('redirect_uri')).toBe(baseURL)
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('scope')?.split(' ').sort()).toEqual(
      [...REQUIRED_SCOPES].sort(),
    )

    const appOrigin = new URL(baseURL!).origin
    const storage = await page.context().storageState()
    const rawPkce = storage.origins
      .find((entry) => entry.origin === appOrigin)
      ?.localStorage.find((item) => item.name === PKCE_KEY)?.value
    expect(rawPkce).toBeDefined()
    const pkce = JSON.parse(rawPkce!) as StoredPkce
    expect(params.get('state')).toBe(pkce.state)
    expect(pkce.state.length).toBeGreaterThan(0)
    expect(params.get('code_challenge')).toBe(
      createHash('sha256').update(pkce.verifier).digest('base64url'),
    )
    expect(spotify.authorizeRequests).toHaveLength(1)
  })
})

test.describe('authorization callback', () => {
  test.use({
    auth: 'none',
    pkce: { verifier: 'e2e-code-verifier', state: 'e2e-state' },
  })

  test('exchanges the code for tokens and removes it from the URL', async ({
    page,
    baseURL,
    spotify,
  }) => {
    await page.goto('./?code=abc&state=e2e-state')

    await expect(page.getByText(SELECT_PROMPT)).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 1, name: APP_TITLE }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
    await expect(page).toHaveURL(
      (url) =>
        url.href === baseURL &&
        !url.searchParams.has('code') &&
        !url.searchParams.has('state'),
    )

    expect(spotify.tokenRequests).toHaveLength(1)
    const params = spotify.tokenRequests[0]
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code')).toBe('abc')
    expect(params.get('redirect_uri')).toBe(baseURL)
    expect(params.get('client_id')).toBe(E2E_CLIENT_ID)
    expect(params.get('code_verifier')).toBe('e2e-code-verifier')

    expect(await readStoredTokens(page)).toMatchObject({
      accessToken: CODE_ACCESS_TOKEN,
      refreshToken: CODE_REFRESH_TOKEN,
    })
    expect(await readStoredPkce(page)).toBeNull()
    expect(
      spotify.apiRequests.every(
        (record) => record.authorization === `Bearer ${CODE_ACCESS_TOKEN}`,
      ),
    ).toBe(true)
  })

  test('shows a message when the user denied access', async ({
    page,
    spotify,
  }) => {
    await page.goto('./?error=access_denied&state=e2e-state')

    await expect(page.getByRole('alert')).toHaveText('Login was canceled')
    await expect(page.getByRole('button', { name: LOGIN_BUTTON })).toBeEnabled()
    await expect(page).toHaveURL((url) => !url.searchParams.has('error'))
    expect(spotify.tokenRequests).toHaveLength(0)
  })

  test('shows a message when the state does not match', async ({
    page,
    spotify,
  }) => {
    await page.goto('./?code=abc&state=forged-state')

    await expect(page.getByRole('alert')).toHaveText('Login failed')
    expect(spotify.tokenRequests).toHaveLength(0)
    expect(await readStoredTokens(page)).toBeNull()
  })
})

test.describe('authorization callback without a code verifier', () => {
  test.use({ auth: 'none', pkce: null })

  test('asks the user to log in again', async ({ page, spotify }) => {
    await page.goto('./?code=abc&state=e2e-state')

    await expect(page.getByRole('alert')).toHaveText('Please log in again')
    await expect(page.getByRole('button', { name: LOGIN_BUTTON })).toBeEnabled()
    await expect(page).toHaveURL((url) => !url.searchParams.has('code'))
    expect(spotify.tokenRequests).toHaveLength(0)
  })
})

test.describe('expired access token', () => {
  test.use({ auth: 'expired' })

  test('refreshes the token and shows the main screen', async ({
    page,
    spotify,
  }) => {
    await page.goto('./')

    await expect(page.getByText(SELECT_PROMPT)).toBeVisible()
    expect(spotify.tokenRequests).toHaveLength(1)
    const params = spotify.tokenRequests[0]
    expect(params.get('grant_type')).toBe('refresh_token')
    expect(params.get('refresh_token')).toBe(STORED_REFRESH_TOKEN)
    expect(params.get('client_id')).toBe(E2E_CLIENT_ID)

    expect(spotify.apiRequests.length).toBeGreaterThan(0)
    for (const record of spotify.apiRequests) {
      expect(record.authorization).toBe(`Bearer ${REFRESHED_ACCESS_TOKEN}`)
    }
    expect(await readStoredTokens(page)).toMatchObject({
      accessToken: REFRESHED_ACCESS_TOKEN,
      refreshToken: STORED_REFRESH_TOKEN,
    })
  })

  test('returns to the login screen when the refresh token is invalid', async ({
    page,
    spotify,
    consoleErrors,
  }) => {
    consoleErrors.allow(FAILED_RESOURCE)
    spotify.tokenResponder = () => ({
      status: 400,
      body: {
        error: 'invalid_grant',
        error_description: 'Refresh token expired',
      },
    })

    await page.goto('./')

    await expect(page.getByRole('button', { name: LOGIN_BUTTON })).toBeVisible()
    expect(await readStoredTokens(page)).toBeNull()
    expect(spotify.tokenRequests).toHaveLength(1)
    expect(
      spotify.apiRequests.some(
        (record) => record.authorization === `Bearer ${EXPIRED_ACCESS_TOKEN}`,
      ),
    ).toBe(false)
  })
})

test.describe('access token rejected by the API', () => {
  test('refreshes once after a 401 and retries the request', async ({
    page,
    spotify,
    consoleErrors,
  }) => {
    consoleErrors.allow(FAILED_RESOURCE)
    spotify.intercept(
      (url) => url.pathname === '/v1/me',
      (_url, record) =>
        record.authorization === `Bearer ${STORED_ACCESS_TOKEN}`
          ? spotifyError(401, 'The access token expired')
          : { body: spotify.data.me },
    )

    await page.goto('./')

    await expect(page.getByText(SELECT_PROMPT)).toBeVisible()
    expect(spotify.tokenRequests).toHaveLength(1)
    expect(spotify.requestsTo('/v1/me')).toHaveLength(2)
    expect(await readStoredTokens(page)).toMatchObject({
      accessToken: REFRESHED_ACCESS_TOKEN,
      refreshToken: STORED_REFRESH_TOKEN,
    })
  })
})

import { expect, test, type Page } from '@playwright/test'
import { BASE_PATH } from '../../app.config.ts'

const APP_TITLE = 'Playlist Albums'

type ManifestIcon = {
  src: string
  sizes: string
  type: string
  purpose?: string
}

type Manifest = {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: ManifestIcon[]
}

function collectCspViolations(page: Page): string[] {
  const violations: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (/Content[ -]Security[ -]Policy/i.test(text)) violations.push(text)
  })
  return violations
}

async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => resolve(),
        {
          once: true,
        },
      )
    })
  })
}

test('serves a valid web app manifest', async ({ page }) => {
  await page.goto('./')

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe(`${BASE_PATH}manifest.webmanifest`)

  const manifestUrl = new URL(href!, page.url())
  const response = await page.request.get(manifestUrl.href)
  expect(response.ok()).toBe(true)

  const manifest = (await response.json()) as Manifest
  expect(manifest).toMatchObject({
    name: APP_TITLE,
    short_name: expect.any(String),
    start_url: BASE_PATH,
    scope: BASE_PATH,
    display: 'standalone',
    theme_color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
    background_color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
  })

  const sizes = manifest.icons.map((icon) => icon.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)

  for (const icon of manifest.icons) {
    const iconResponse = await page.request.get(
      new URL(icon.src, manifestUrl).href,
    )
    expect(iconResponse.ok(), icon.src).toBe(true)
    expect(iconResponse.headers()['content-type']).toContain('image/png')
  }
})

test('registers and activates the service worker', async ({ page }) => {
  const cspViolations = collectCspViolations(page)
  await page.goto('./')
  await waitForServiceWorkerControl(page)

  const registration = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return {
      scope: reg?.scope,
      scriptURL: reg?.active?.scriptURL,
      state: reg?.active?.state,
    }
  })

  const origin = new URL(page.url()).origin
  expect(registration.scope).toBe(`${origin}${BASE_PATH}`)
  expect(registration.scriptURL).toBe(`${origin}${BASE_PATH}sw.js`)
  expect(registration.state).toBe('activated')
  expect(cspViolations).toEqual([])
})

test('loads the app shell from the service worker while offline', async ({
  page,
  context,
}) => {
  await page.goto('./')
  await waitForServiceWorkerControl(page)

  await context.setOffline(true)
  await page.reload()

  await expect(page).toHaveTitle(APP_TITLE)
  await expect(page.locator('#root')).not.toBeEmpty()
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
  ).toBe(true)
})

test('shows the unavailable message while offline', async ({
  page,
  context,
}) => {
  await page.goto('./')
  await waitForServiceWorkerControl(page)

  await context.setOffline(true)
  await page.reload()

  await expect(
    page.getByText("Can't connect to Spotify. The app is unavailable."),
  ).toBeVisible()
})

import { test as base, expect, type Page } from '@playwright/test'
import {
  PKCE_KEY,
  TOKENS_KEY,
  type StoredPkce,
  type StoredTokens,
} from '../../../src/auth/tokenStore.ts'
import { SpotifyMock } from './spotifyMock.ts'

export { expect }

export type AuthState = 'valid' | 'expired' | 'none'

export const STORED_ACCESS_TOKEN = 'stored-access'
export const EXPIRED_ACCESS_TOKEN = 'expired-access'
export const STORED_REFRESH_TOKEN = 'stored-refresh'

export const FAILED_RESOURCE = /Failed to load resource/
export const FETCH_FAILED = /Fetch API cannot load/

const CSP_PATTERN =
  /Content[ -]Security[ -]Policy|securitypolicyviolation|Refused to (load|execute|apply|connect|create)/i

export class ConsoleErrors {
  readonly messages: string[] = []
  private readonly allowed: RegExp[] = []

  allow(...patterns: RegExp[]): void {
    this.allowed.push(...patterns)
  }

  record(message: string): void {
    this.messages.push(message)
  }

  unexpected(): string[] {
    return this.messages.filter(
      (message) =>
        CSP_PATTERN.test(message) ||
        !this.allowed.some((pattern) => pattern.test(message)),
    )
  }
}

function tokensFor(auth: AuthState): StoredTokens | null {
  switch (auth) {
    case 'valid':
      return {
        accessToken: STORED_ACCESS_TOKEN,
        refreshToken: STORED_REFRESH_TOKEN,
        expiresAt: Date.now() + 3600_000,
      }
    case 'expired':
      return {
        accessToken: EXPIRED_ACCESS_TOKEN,
        refreshToken: STORED_REFRESH_TOKEN,
        expiresAt: Date.now() - 60_000,
      }
    case 'none':
      return null
  }
}

export async function readStoredTokens(
  page: Page,
): Promise<StoredTokens | null> {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    TOKENS_KEY,
  )
  return raw === null ? null : (JSON.parse(raw) as StoredTokens)
}

export async function readStoredPkce(page: Page): Promise<StoredPkce | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), PKCE_KEY)
  return raw === null ? null : (JSON.parse(raw) as StoredPkce)
}

type Options = {
  auth: AuthState
  pkce: StoredPkce | null
}

type Fixtures = {
  spotify: SpotifyMock
  consoleErrors: ConsoleErrors
}

export const test = base.extend<Options & Fixtures>({
  auth: ['valid', { option: true }],
  pkce: [null, { option: true }],

  storageState: async ({ auth, pkce, baseURL }, use) => {
    const entries: { name: string; value: string }[] = []
    const tokens = tokensFor(auth)
    if (tokens) {
      entries.push({ name: TOKENS_KEY, value: JSON.stringify(tokens) })
    }
    if (pkce) {
      entries.push({ name: PKCE_KEY, value: JSON.stringify(pkce) })
    }
    await use({
      cookies: [],
      origins: [{ origin: new URL(baseURL!).origin, localStorage: entries }],
    })
  },

  consoleErrors: [
    async ({ page }, use) => {
      const errors = new ConsoleErrors()
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(
            `securitypolicyviolation: ${event.violatedDirective} ${event.blockedURI}`,
          )
        })
      })
      page.on('console', (message) => {
        const text = message.text()
        if (message.type() === 'error' || CSP_PATTERN.test(text)) {
          errors.record(
            `[${message.type()}] ${text} (${message.location().url})`,
          )
        }
      })
      page.on('pageerror', (error) => {
        errors.record(`[pageerror] ${error.message}`)
      })
      await use(errors)
      expect(errors.unexpected(), 'unexpected console errors').toEqual([])
    },
    { auto: true },
  ],

  spotify: [
    async ({ page }, use) => {
      const mock = new SpotifyMock()
      await mock.install(page)
      await use(mock)
      expect(mock.unhandled, 'requests not handled by the mock').toEqual([])
    },
    { auto: true },
  ],
})

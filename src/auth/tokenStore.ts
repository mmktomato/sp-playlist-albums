export type StoredTokens = {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

export type StoredPkce = {
  verifier: string
  state: string
}

export const TOKENS_KEY = 'sp-playlist-albums.auth.tokens'
export const PKCE_KEY = 'sp-playlist-albums.auth.pkce'

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function loadTokens(): StoredTokens | null {
  const value = readJson(TOKENS_KEY)
  if (
    !isRecord(value) ||
    typeof value.accessToken !== 'string' ||
    typeof value.expiresAt !== 'number'
  ) {
    return null
  }
  return {
    accessToken: value.accessToken,
    refreshToken:
      typeof value.refreshToken === 'string' ? value.refreshToken : undefined,
    expiresAt: value.expiresAt,
  }
}

export function saveTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY)
}

export function loadPkce(): StoredPkce | null {
  const value = readJson(PKCE_KEY)
  if (
    !isRecord(value) ||
    typeof value.verifier !== 'string' ||
    typeof value.state !== 'string'
  ) {
    return null
  }
  return { verifier: value.verifier, state: value.state }
}

export function savePkce(pkce: StoredPkce): void {
  localStorage.setItem(PKCE_KEY, JSON.stringify(pkce))
}

export function clearPkce(): void {
  localStorage.removeItem(PKCE_KEY)
}

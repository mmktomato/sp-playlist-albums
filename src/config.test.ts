import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRedirectUri } from './config'

describe('getRedirectUri', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('combines the origin and the base path', () => {
    vi.stubEnv('BASE_URL', '/sp-playlist-albums/')
    expect(getRedirectUri()).toBe(`${location.origin}/sp-playlist-albums/`)
  })
})

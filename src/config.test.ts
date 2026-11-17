import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRedirectUri } from './config'

describe('getRedirectUri', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('combines the origin and the base path', () => {
    vi.stubEnv('BASE_URL', '/sp-album-playlist/')
    expect(getRedirectUri()).toBe(`${location.origin}/sp-album-playlist/`)
  })
})

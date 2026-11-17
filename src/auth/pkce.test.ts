import { describe, expect, it } from 'vitest'
import {
  base64UrlEncode,
  createCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce'

describe('pkce', () => {
  it('creates the S256 challenge from the RFC 7636 example', async () => {
    await expect(
      createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('generates a verifier of valid length and characters', () => {
    const verifier = generateCodeVerifier()
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/)
    expect(generateCodeVerifier()).not.toBe(verifier)
  })

  it('generates a url-safe state', () => {
    expect(generateState()).toMatch(/^[A-Za-z0-9\-_]+$/)
  })

  it('encodes base64url without padding', () => {
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
  })
})

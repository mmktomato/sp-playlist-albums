import { describe, expect, it } from 'vitest'
import {
  ApiError,
  AuthError,
  ForbiddenError,
  NetworkError,
  QuotaExceededError,
} from './errors'

describe('errors', () => {
  it('keeps the class identity and name', () => {
    const errors = [
      new AuthError(),
      new ForbiddenError('user'),
      new QuotaExceededError(),
      new NetworkError(),
      new ApiError(500),
    ]
    expect(errors.map((e) => e.name)).toEqual([
      'AuthError',
      'ForbiddenError',
      'QuotaExceededError',
      'NetworkError',
      'ApiError',
    ])
    expect(errors.every((e) => e instanceof Error)).toBe(true)
    expect(errors[0]).toBeInstanceOf(AuthError)
  })

  it('carries the forbidden scope', () => {
    expect(new ForbiddenError('resource').scope).toBe('resource')
  })

  it('carries the HTTP status', () => {
    expect(new ApiError(503).status).toBe(503)
  })

  it('carries the cause', () => {
    const cause = new TypeError('Failed to fetch')
    expect(new NetworkError(undefined, { cause }).cause).toBe(cause)
  })
})

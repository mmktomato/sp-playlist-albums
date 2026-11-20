export class AuthError extends Error {
  constructor(message = 'Authentication required', options?: ErrorOptions) {
    super(message, options)
    this.name = 'AuthError'
  }
}

export type ForbiddenScope = 'user' | 'resource'

export class ForbiddenError extends Error {
  readonly scope: ForbiddenScope

  constructor(
    scope: ForbiddenScope,
    message = 'Forbidden',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ForbiddenError'
    this.scope = scope
  }
}

export class QuotaExceededError extends Error {
  readonly retryAfterSeconds?: number

  constructor(
    retryAfterSeconds?: number,
    message = 'Quota exceeded',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'QuotaExceededError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network request failed', options?: ErrorOptions) {
    super(message, options)
    this.name = 'NetworkError'
  }
}

export class PartialRemovalError extends Error {
  readonly succeededChunks: number

  constructor(
    succeededChunks: number,
    message = `Removal stopped after ${succeededChunks} chunk(s)`,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'PartialRemovalError'
    this.succeededChunks = succeededChunks
  }
}

export class ApiError extends Error {
  readonly status: number

  constructor(
    status: number,
    message = `API error (${status})`,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
  }
}

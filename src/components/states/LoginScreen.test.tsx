import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login } from '../../auth/auth'
import { LoginScreen } from './LoginScreen'

vi.mock('../../auth/auth', () => ({ login: vi.fn() }))

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.mocked(login).mockReset()
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'onLine')
    vi.restoreAllMocks()
  })

  it('starts the login flow', async () => {
    vi.mocked(login).mockResolvedValue()
    render(<LoginScreen callbackResult="none" clientIdConfigured />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Log in with Spotify' }),
    )

    expect(login).toHaveBeenCalledOnce()
  })

  it.each([
    ['denied', 'Login was canceled'],
    ['missing-verifier', 'Please log in again'],
    ['error', 'Login failed'],
  ] as const)('explains the %s callback result', (result, message) => {
    render(<LoginScreen callbackResult={result} clientIdConfigured />)
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(
      screen.getByRole('button', { name: 'Log in with Spotify' }),
    ).toBeEnabled()
  })

  it('shows a failure when login throws', async () => {
    vi.mocked(login).mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LoginScreen callbackResult="none" clientIdConfigured />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Log in with Spotify' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Login failed')
  })

  it('disables login when the client ID is missing', () => {
    render(<LoginScreen callbackResult="none" clientIdConfigured={false} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Client ID is not set')
    expect(
      screen.getByRole('button', { name: 'Log in with Spotify' }),
    ).toBeDisabled()
  })

  it('disables login while offline and re-enables it when back online', () => {
    setOnline(false)
    render(<LoginScreen callbackResult="none" clientIdConfigured />)
    const button = screen.getByRole('button', { name: 'Log in with Spotify' })

    expect(button).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Can't connect to Spotify. The app is unavailable.",
    )

    setOnline(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(button).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

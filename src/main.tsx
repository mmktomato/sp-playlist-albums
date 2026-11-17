import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { handleCallback, type CallbackResult } from './auth/auth'
import './index.css'
import { registerPwa } from './pwa'

async function resolveCallback(): Promise<CallbackResult> {
  try {
    return await handleCallback(new URL(location.href))
  } catch (error) {
    console.error(error)
    return 'error'
  }
}

const callbackResult = await resolveCallback()

registerPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App callbackResult={callbackResult} />
  </StrictMode>,
)

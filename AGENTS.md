# AGENTS.md

Guide for coding agents and contributors. User-facing setup lives in [README.md](README.md).

## Project

Mobile-first PWA that lists the albums of a Spotify playlist (deduplicated, in first-appearance order). No backend: Spotify Authorization Code + PKCE in the browser, static hosting on GitHub Pages at `/sp-album-playlist/`. UI text is English.

Stack: Vite, React 19, TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`), TanStack Query v5, `vite-plugin-pwa`, Vitest + Testing Library, Playwright.

## Commands

| Command               | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| `npm run dev`         | Dev server at http://127.0.0.1:5173/sp-album-playlist/    |
| `npm run build`       | `tsc -b` + production build to `dist/`                    |
| `npm run preview`     | Serve `dist/` at http://127.0.0.1:4173/sp-album-playlist/ |
| `npm run lint`        | ESLint                                                    |
| `npm run typecheck`   | `tsc -b` (no emit)                                        |
| `npm test`            | Unit tests (Vitest, jsdom)                                |
| `npm run e2e:install` | Install Chromium and WebKit for Playwright                |
| `npm run test:e2e`    | Playwright (builds and serves the preview itself)         |
| `npm run icons`       | Regenerate icons from `public/icon.svg`                   |
| `npm run format`      | Prettier                                                  |

Before finishing a change, run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npx prettier --check .`. Run `npm run test:e2e` when UI text, roles, or flows change.

Node version: `.node-version` / `mise.toml`. The client ID comes from `VITE_SPOTIFY_CLIENT_ID` in `.env.local` (gitignored, never commit it).

## Layout

```
app.config.ts          BASE_PATH, shared by vite.config.ts and playwright.config.ts
src/
  main.tsx             Handles the OAuth callback once before render, registers the SW, renders <App callbackResult>
  App.tsx              Login screen / main screen / ?debug page switch, QueryClient
  config.ts            Client ID, redirect URI (location.origin + BASE_URL), scopes, Spotify URLs
  errors.ts            AuthError, ForbiddenError(scope), QuotaExceededError, NetworkError, ApiError
  auth/                PKCE, token storage (localStorage), refresh
  spotify/             fetch client, paging, endpoints, API types
  domain/              Pure logic: album aggregation, follow filter, playlist classification
  hooks/               TanStack Query hooks and small UI hooks
  components/          UI; components/states/ holds login, loading and error states
  dev/DebugPage.tsx    ?debug=1 page for checking real API responses
tests/e2e/             Functional E2E with a mocked Spotify API (projects e2e-*)
tests/pwa/             Manifest, service worker, offline shell (projects pwa-*)
.github/workflows/     CI (lint, typecheck, unit, e2e, build) and Pages deploy on main
```

Layering: `components`/`hooks` → `spotify` + `domain` → `errors`/`config`. `domain` has no I/O. Only `spotify/client.ts` calls `fetch` for the Web API, and only `auth/` talks to the token endpoint.

## Spotify Web API constraints (Development Mode, 2026)

These shape the design. Check the [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) before changing API calls.

- Playlist tracks: `GET /playlists/{id}/items` (`/tracks` was removed). Entries carry the track in `item`; the deprecated `track` key may also appear, so read `item ?? track`. `limit` max 50. Returns 403 unless the user owns or collaborates on the playlist.
- Saved check: `GET /me/library/contains?uris=...` with up to 40 URIs. The per-type `contains` endpoints were removed.
- Followed artists: `GET /me/following?type=artist` (cursor paging, limit 50).
- Batch endpoints (`GET /albums?ids=`) and `GET /users/{id}/playlists` were removed. Albums come from `item.album` in playlist items.
- Refresh tokens expire 6 months after authorization; the token endpoint then returns `400 invalid_grant`.
- Quota is per developer account; exhaustion returns 429 with `reason: QUOTA_EXCEEDED`.
- Redirect URIs cannot use `localhost`; use `127.0.0.1`.

Whether a playlist is selectable is decided only by `isAccessible` in `src/domain/playlists.ts`. `ACCESSIBILITY_METHOD` switches between `'owner-or-collaborative'` (current) and `'items-field'`. Use the `?debug=1` page to verify real responses before switching.

## Design rules

- Auth
  - The OAuth callback is handled in `main.tsx` before React renders. Never in an effect, because StrictMode would run it twice.
  - Refresh is single-flight within a tab and serialized across tabs with `navigator.locks`. Pass the rejected token as `getAccessToken({ rejectedToken })` so parallel 401s refresh only once.
  - Clear tokens only on `invalid_grant`. Network errors and 5xx must not log the user out.
  - Logout and `AuthError` reload the page (`location.replace(BASE_URL)`). There is no auth-state event system.
- API client: max 4 concurrent requests. Retry a 401 once with a fresh token. Retry a 429 only when `Retry-After` is at most 10 s, at most twice. Pass `AbortSignal` everywhere, and never turn `AbortError` into `NetworkError`.
- TanStack Query: `networkMode: 'always'`, `retry: false`, no refetch on focus or reconnect, `staleTime` 5 min. Retries belong to the client only.
- Offline: the service worker precaches the app shell only. There is no `runtimeCaching`, so Spotify requests go to the network and failures show the offline state.
- CSP: injected into `index.html` only in production builds (`vite.config.ts`). Don't use inline scripts, `style` props, or `dangerouslySetInnerHTML`. New image or API hosts must be added to the CSP.
- Album links are plain `<a href="https://open.spotify.com/album/{id}">` so universal links open the Spotify app.
- `BASE_PATH` is defined only in `app.config.ts`. If the repository is renamed, update it and the Dashboard redirect URIs.
- Icons: edit `public/icon.svg`, run `npm run icons`, and commit the generated files.

## Testing notes

- Unit tests sit next to the source (`*.test.ts(x)`) and mock `spotify/endpoints` or `auth/auth` at the module boundary.
- E2E runs against the preview build with a fake client ID (`tests/e2e/support/constants.ts`). `reuseExistingServer` is on locally: stop any preview built with a real client ID first, or the login test fails.
- E2E uses `serviceWorkers: 'block'` because `page.route` cannot see requests handled by a service worker. PWA behavior is covered in `tests/pwa/`.
- Seed login state with `storageState`, not `addInitScript`. Open pages with relative paths (`page.goto('./')`), because `baseURL` includes the base path.
- The E2E fixtures fail a test on console errors and CSP violations. Allow expected errors explicitly.
- Browsers are installed under `node_modules` (`PLAYWRIGHT_BROWSERS_PATH=0` in the npm scripts).

## Conventions

- Prettier (single quotes, no semicolons) and ESLint flat config.
- As a rule, don't write comments. When one is necessary, keep it to one short English line that stays meaningful later.
- Keep Spotify calls in `src/spotify/endpoints.ts` and branching on API shape in `domain/`.

# Playlist Albums (sp-album-playlist)

A mobile-first web app (PWA) that lists the albums in a Spotify playlist, with duplicates removed.
It has no backend and is served statically from GitHub Pages.

## Features

- Log in and out with Spotify
- Pick a playlist from the menu at the top left
  - Playlists are split into "Your playlists" and "Saved playlists"
  - Playlists whose tracks can't be fetched are grayed out
- See the albums of the selected playlist, without duplicates, in the order they first appear
- Tap an album to open it in the Spotify app
- Filter to albums where at least one album artist is an artist you follow
- See whether each album is saved in your library (heart icon, read-only)
- Add it to your home screen and use it as a PWA
  - When offline, the app says it is unavailable

## Using the app

No build or setup is needed to use a deployed instance.

1. Ask the person who runs the instance to add your Spotify account (name and email) to their app's User Management. Spotify only lets allowlisted accounts use apps in Development Mode.
2. Open the instance URL (for example `https://<user>.github.io/sp-album-playlist/`) in your phone's browser and log in with Spotify.
3. Optionally, add it to your home screen to use it as a PWA.

## Hosting your own instance

Do this only if you want to run the app under your own Spotify app and GitHub Pages.

### 1. Set up the Spotify Developer Dashboard

Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) (an existing app also works) and configure it as follows.

1. Add these redirect URIs. They must match exactly, including the trailing slash.
   - `https://<user>.github.io/sp-album-playlist/` (production; `<user>` is your GitHub user name)
   - `http://127.0.0.1:5173/sp-album-playlist/` (dev server)
   - `http://127.0.0.1:4173/sp-album-playlist/` (preview; only needed if you log in on the preview build)
2. Under "Which API/SDKs are you planning to use?", check Web API.
3. Under User Management, add the Spotify accounts (name and email) that will use the app.
   - In Development Mode, every API call returns 403 for users not listed here.
4. Copy the Client ID shown in Settings. The Client Secret is not used.

### 2. Run locally (optional)

Only needed for development or for trying changes before deploying.
The Node.js version is in `.node-version` (or `mise.toml` if you use mise).

1. Install dependencies.

   ```sh
   npm ci
   ```

2. Create `.env.local` in the repository root with your Client ID. `.env.local` is gitignored.

   ```sh
   VITE_SPOTIFY_CLIENT_ID=<your client id>
   ```

3. Start the dev server and open http://127.0.0.1:5173/sp-album-playlist/.

   ```sh
   npm run dev
   ```

   Use `127.0.0.1`, not `localhost`. Spotify doesn't accept `localhost` in redirect URIs.

### 3. Deploy to GitHub Pages

Configure the repository as below, then push to `main`. GitHub Actions runs the tests and deploys.

1. In Settings > Pages > Build and deployment, set Source to "GitHub Actions".
2. In Settings > Secrets and variables > Actions > Variables, add a repository variable `SPOTIFY_CLIENT_ID` with your Client ID.
   - The Client ID is not a secret, so it goes in a variable rather than a secret.

The app is deployed to `https://<user>.github.io/sp-album-playlist/`.
To let others use it, add their accounts to User Management (step 1.3) and share the URL.

## Development Mode limitations

Since Spotify's 2026 changes, apps in Development Mode have these limitations.

- Tracks of playlists owned by other users can't be fetched.
  - Only playlists you own or collaborate on work.
  - Other playlists are grayed out in the menu and can't be selected.
- Made for You playlists such as Release Radar and Discover Weekly are owned by Spotify, so they are grayed out too.
  - To view one, copy it into a playlist of your own.
- Up to 5 users, added in User Management by the instance owner, can use the app. Spotify Premium is required.
- You need to log in again every 6 months (refresh tokens expire).
- The API quota is shared per developer account. When it runs out, the app is temporarily unavailable.

## Debug page (`?debug=1`)

Add `?debug=1` to the URL (for example http://127.0.0.1:5173/sp-album-playlist/?debug=1) to open a page that shows raw Spotify API responses.
Use it to find out why a playlist is grayed out, or to check whether the API behavior has changed.

- Each playlist's owner, `collaborative` flag, presence of `items`, and the accessibility result
- The raw response of `/playlists/{id}/items`
- Album links in two forms (`https://open.spotify.com/...` and `spotify:`)
- Saved-album and followed-artist results

## For developers

Commands, project layout, testing, and design rules are in [AGENTS.md](AGENTS.md).

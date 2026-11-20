# Playlist Albums for Spotify

A mobile web app (PWA) that lists the albums in a Spotify playlist, without duplicates.

- Pick one of your playlists from the menu.
- Tap an album to open it in the Spotify app.
- A heart shows whether the album is saved in your library.
- Filter to albums by artists you follow.

## Using the app

1. Ask the instance owner to add your Spotify account to their app's User Management.
2. Open the instance URL (e.g. `https://<user>.github.io/sp-playlist-albums/`) and log in.
3. Optionally, add it to your home screen.

## Limitations

Spotify restricts apps in Development Mode.

- Only playlists you own or collaborate on can be read.
  - Other playlists are hidden from the menu.
  - Made for You playlists such as Release Radar don't work. Copy their tracks into your own playlist instead.
- Up to 5 users, all with Spotify Premium.
- You need to log in again every 6 months.

## Hosting your own instance

1. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), create an app.
   - Redirect URIs (exact match, with the trailing slash):
     - `https://<user>.github.io/sp-playlist-albums/`
     - `http://127.0.0.1:15555/sp-playlist-albums/` (local development)
   - APIs: Web API.
   - User Management: add the accounts that will use the app.
2. In the GitHub repository settings:
   - Pages: set Source to "GitHub Actions".
   - Actions variables: add `SPOTIFY_CLIENT_ID`.
3. Push to `main`. GitHub Actions tests and deploys the app.

## Development

```sh
npm ci
echo 'VITE_SPOTIFY_CLIENT_ID=<your client id>' > .env.local
npm run dev
```

Open http://127.0.0.1:15555/sp-playlist-albums/ (`localhost` doesn't work with Spotify).
Add `?debug=1` to see raw Spotify API responses.

See [AGENTS.md](AGENTS.md) for commands, project layout and design notes.

## License

[MIT](LICENSE)

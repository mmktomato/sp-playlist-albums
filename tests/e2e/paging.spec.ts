import type { Page } from '@playwright/test'
import { OFFLINE_TEXT } from './support/constants.ts'
import {
  DELTA,
  ECHO,
  ME,
  OTHER_ARTIST,
  PLAYLISTS,
  addPlaylist,
  album,
  trackEntry,
} from './support/data.ts'
import { expect, test } from './support/fixtures.ts'
import type { SpotifyMock } from './support/spotifyMock.ts'

const HUGE = { id: 'pl-huge', name: 'Huge List', owner: ME }
const HUGE_TRACKS = 120
const HUGE_ALBUMS = HUGE_TRACKS / 2

function addHugePlaylist(spotify: SpotifyMock) {
  const entries = Array.from({ length: HUGE_TRACKS }, (_, i) => {
    const n = String(Math.floor(i / 2)).padStart(3, '0')
    return trackEntry(
      `huge-${i}`,
      album(`huge-${n}`, `Huge Album ${n}`, [OTHER_ARTIST], { image: false }),
    )
  })
  addPlaylist(spotify.data, HUGE, entries)
}

function holdPage(spotify: SpotifyMock, playlistId: string, offset: number) {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  spotify.intercept(
    (url) =>
      url.pathname === `/v1/playlists/${playlistId}/items` &&
      url.searchParams.get('offset') === String(offset),
    async (url) => {
      await released
      return spotify.defaultResponse(url)
    },
  )
  return release
}

function offsetsOf(spotify: SpotifyMock, playlistId: string): number[] {
  return spotify
    .playlistItemsRequests(playlistId)
    .map((url) => Number(url.searchParams.get('offset') ?? '0'))
}

function albumLinks(page: Page) {
  return page.getByRole('main').getByRole('list').getByRole('link')
}

test('pages through a playlist with more than 50 items and shows progress', async ({
  page,
  spotify,
}) => {
  addHugePlaylist(spotify)
  const release = holdPage(spotify, HUGE.id, 50)

  await page.goto(`./?playlist=${HUGE.id}`)

  const status = page.getByRole('main').getByRole('status')
  await expect(status).toContainText(`Loading 50 / ${HUGE_TRACKS} tracks`)
  release()

  await expect(
    page.getByText(`${HUGE_ALBUMS} / ${HUGE_ALBUMS} albums`),
  ).toBeVisible()
  await expect(albumLinks(page)).toHaveCount(HUGE_ALBUMS)
  expect(offsetsOf(spotify, HUGE.id)).toEqual([0, 50, 100])
  for (const url of spotify.playlistItemsRequests(HUGE.id)) {
    expect(url.searchParams.get('limit')).toBe('50')
    expect(url.searchParams.get('fields')).not.toBeNull()
  }

  await expect(
    albumLinks(page)
      .first()
      .getByRole('img', { name: 'Not saved', exact: true }),
  ).toBeVisible()
  const chunks = spotify
    .requestsTo('/v1/me/library/contains')
    .map((url) => url.searchParams.get('uris')!.split(',').length)
  expect(chunks.sort((a, b) => b - a)).toEqual([40, HUGE_ALBUMS - 40])
})

test('switching playlists while loading stops fetching the previous one', async ({
  page,
  spotify,
  consoleErrors,
}) => {
  consoleErrors.allow(/ERR_ABORTED|cancelled|canceled/i)
  addHugePlaylist(spotify)
  const release = holdPage(spotify, HUGE.id, 50)

  await page.goto(`./?playlist=${HUGE.id}`)
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    `Loading 50 / ${HUGE_TRACKS} tracks`,
  )

  await page.getByRole('button', { name: 'Menu' }).click()
  await page
    .getByRole('dialog', { name: 'Playlists' })
    .getByRole('button', { name: PLAYLISTS.second.name })
    .click()

  await expect(
    page.getByRole('heading', { level: 1, name: PLAYLISTS.second.name }),
  ).toBeVisible()
  await expect(page.getByText('2 / 2 albums')).toBeVisible()
  await expect(albumLinks(page)).toHaveCount(2)
  await expect(albumLinks(page).nth(0)).toContainText(DELTA.name)
  await expect(albumLinks(page).nth(1)).toContainText(ECHO.name)

  release()
  await page.waitForTimeout(1000)

  expect(offsetsOf(spotify, HUGE.id)).toEqual([0, 50])
  await expect(page.getByText(OFFLINE_TEXT)).toHaveCount(0)
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('2 / 2 albums')).toBeVisible()
})

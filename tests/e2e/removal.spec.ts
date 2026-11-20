import type { Page } from '@playwright/test'
import { MODIFY_SCOPES } from './support/constants.ts'
import {
  ALPHA,
  BRAVO,
  FOXTROT,
  ME,
  OTHER_ARTIST,
  PLAYLISTS,
  addPlaylist,
  album,
  trackEntry,
} from './support/data.ts'
import {
  FAILED_RESOURCE,
  STORED_ACCESS_TOKEN,
  expect,
  test,
} from './support/fixtures.ts'
import { spotifyError, type SpotifyMock } from './support/spotifyMock.ts'

const REMOVE_ITEM = 'Remove album from playlist'
const OTHER_MIX = { id: 'pl-other-mix', name: 'Other Mix', owner: ME }
const LONG = { id: 'pl-long', name: 'Long List', owner: ME }
const LONG_ALBUMS = 30

function albumLink(page: Page, name: string) {
  return page.getByRole('main').getByRole('list').getByRole('link', { name })
}

function actionsButton(page: Page, albumName: string) {
  return page.getByRole('button', {
    name: `More actions for ${albumName}`,
    exact: true,
  })
}

function confirmDialog(page: Page, playlistName: string) {
  return page.getByRole('dialog', { name: `Remove from “${playlistName}”?` })
}

function banner(page: Page, role: 'status' | 'alert') {
  return page
    .getByRole(role)
    .filter({ has: page.getByRole('button', { name: 'Dismiss' }) })
}

function trackUris(spotify: SpotifyMock, playlistId: string) {
  return (spotify.data.playlistItems.get(playlistId) ?? []).map(
    (entry) => (entry.item ?? entry.track)?.uri,
  )
}

async function removeAlbum(
  page: Page,
  albumName: string,
  playlistName: string,
) {
  await actionsButton(page, albumName).click()
  await page
    .getByRole('dialog', { name: albumName })
    .getByRole('button', { name: REMOVE_ITEM })
    .click()
  await confirmDialog(page, playlistName)
    .getByRole('button', { name: 'Remove', exact: true })
    .click()
}

function longAlbumName(index: number) {
  return `Long Album ${String(index + 1).padStart(2, '0')}`
}

function addLongPlaylist(spotify: SpotifyMock) {
  const entries = Array.from({ length: LONG_ALBUMS }, (_, i) =>
    trackEntry(
      `long${i}`,
      album(`long-${i}`, longAlbumName(i), [OTHER_ARTIST], { image: false }),
    ),
  )
  addPlaylist(spotify.data, LONG, entries)
}

test('removes every track of the album from the shown playlist only', async ({
  page,
  spotify,
}) => {
  addPlaylist(spotify.data, OTHER_MIX, [
    trackEntry('t1', ALPHA),
    trackEntry('t8', BRAVO),
  ])
  spotify.data.playlistItems
    .get(PLAYLISTS.mine.id)!
    .push(trackEntry('t1', ALPHA))

  await page.goto(`./?playlist=${PLAYLISTS.mine.id}`)
  await expect(page.getByText('3 / 3 albums')).toBeVisible()
  await expect(
    albumLink(page, BRAVO.name).getByRole('img', {
      name: 'Not saved',
      exact: true,
    }),
  ).toBeVisible()
  expect(spotify.requestsTo('/v1/me/library/contains')).toHaveLength(1)

  const button = actionsButton(page, ALPHA.name)
  await expect(button).toHaveAttribute('aria-haspopup', 'dialog')
  await button.click()
  await page
    .getByRole('dialog', { name: ALPHA.name })
    .getByRole('button', { name: REMOVE_ITEM })
    .click()

  const confirm = confirmDialog(page, PLAYLISTS.mine.name)
  await expect(confirm).toContainText(
    `All 3 tracks from “${ALPHA.name}” will be removed from this playlist.`,
  )
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
  expect(spotify.records('DELETE')).toHaveLength(0)

  await confirm.getByRole('button', { name: 'Remove', exact: true }).click()

  const status = banner(page, 'status')
  await expect(status).toHaveText(
    `Removed 3 tracks from “${PLAYLISTS.mine.name}”`,
  )
  await expect(status).toBeInViewport()
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)
  await expect(albumLink(page, ALPHA.name)).toHaveCount(0)
  await expect(page.getByText('2 / 2 albums')).toBeVisible()
  await expect(page.getByRole('main')).toBeFocused()

  const deletes = spotify.records('DELETE')
  expect(deletes).toHaveLength(1)
  expect(deletes[0].url.pathname).toBe(
    `/v1/playlists/${PLAYLISTS.mine.id}/items`,
  )
  expect(deletes[0].url.search).toBe('')
  expect(deletes[0].authorization).toBe(`Bearer ${STORED_ACCESS_TOKEN}`)
  expect(deletes[0].body).toEqual({
    items: [{ uri: 'spotify:track:t1' }, { uri: 'spotify:track:t3' }],
  })

  expect(trackUris(spotify, PLAYLISTS.mine.id)).toEqual([
    'spotify:track:t2',
    'spotify:local:artist:album:track:180',
    'spotify:episode:episode-1',
    'spotify:track:t4',
  ])
  expect(trackUris(spotify, OTHER_MIX.id)).toEqual([
    'spotify:track:t1',
    'spotify:track:t8',
  ])
  expect(spotify.playlistItemsRequests(PLAYLISTS.mine.id)).toHaveLength(1)
  expect(spotify.playlistItemsRequests(OTHER_MIX.id)).toHaveLength(0)
  expect(spotify.requestsTo('/v1/me/library/contains')).toHaveLength(1)

  await status.getByRole('button', { name: 'Dismiss' }).click()
  await expect(status).toHaveCount(0)
})

test('canceling the sheet sends no request', async ({ page, spotify }) => {
  await page.goto(`./?playlist=${PLAYLISTS.mine.id}`)
  await expect(page.getByText('3 / 3 albums')).toBeVisible()

  const button = actionsButton(page, BRAVO.name)
  const menu = page.getByRole('dialog', { name: BRAVO.name })
  await button.click()
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: 'Cancel' }).click()
  await expect(menu).toBeHidden()

  await button.click()
  await menu.getByRole('button', { name: REMOVE_ITEM }).click()
  const confirm = confirmDialog(page, PLAYLISTS.mine.name)
  await expect(confirm).toContainText(
    `1 track from “${BRAVO.name}” will be removed from this playlist.`,
  )
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()

  await button.click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  expect(spotify.records('DELETE')).toHaveLength(0)
  await expect(albumLink(page, BRAVO.name)).toBeVisible()
  await expect(page.getByText('3 / 3 albums')).toBeVisible()
})

test.describe('token without the modify scopes', () => {
  test.use({ auth: 'valid-legacy' })

  test('asks to log in again instead of removing', async ({
    page,
    spotify,
  }) => {
    await page.goto(`./?playlist=${PLAYLISTS.mine.id}`)
    await expect(page.getByText('3 / 3 albums')).toBeVisible()

    await actionsButton(page, ALPHA.name).click()
    await page
      .getByRole('dialog', { name: ALPHA.name })
      .getByRole('button', { name: REMOVE_ITEM })
      .click()

    const permission = page.getByRole('dialog', {
      name: 'Editing playlists needs extra permission',
    })
    const loginAgain = permission.getByRole('button', { name: 'Log in again' })
    await expect(loginAgain).toBeFocused()
    await expect(confirmDialog(page, PLAYLISTS.mine.name)).toHaveCount(0)
    expect(spotify.records('DELETE')).toHaveLength(0)

    await loginAgain.click()
    await expect(
      page.getByRole('heading', { name: 'Authorize stub' }),
    ).toBeVisible()

    expect(spotify.authorizeRequests).toHaveLength(1)
    const scopes =
      spotify.authorizeRequests[0].searchParams.get('scope')?.split(' ') ?? []
    expect(scopes).toEqual(expect.arrayContaining(MODIFY_SCOPES))
    expect(spotify.records('DELETE')).toHaveLength(0)
  })
})

test.describe('removal errors', () => {
  test.beforeEach(({ consoleErrors }) => {
    consoleErrors.allow(FAILED_RESOURCE)
  })

  test('403 tells the user the playlist is not editable without reloading', async ({
    page,
    spotify,
  }) => {
    spotify.respond(
      `/v1/playlists/${PLAYLISTS.mine.id}/items`,
      spotifyError(403, 'Forbidden'),
      'DELETE',
    )
    const before = trackUris(spotify, PLAYLISTS.mine.id)

    await page.goto(`./?playlist=${PLAYLISTS.mine.id}`)
    await expect(page.getByText('3 / 3 albums')).toBeVisible()
    await removeAlbum(page, ALPHA.name, PLAYLISTS.mine.name)

    await expect(banner(page, 'alert')).toHaveText(
      "You can't edit this playlist",
    )
    await expect(
      page.getByRole('button', { name: 'Log in again' }),
    ).toHaveCount(0)
    await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)
    await expect(albumLink(page, ALPHA.name)).toBeVisible()
    await expect(page.getByText('3 / 3 albums')).toBeVisible()

    expect(spotify.records('DELETE')).toHaveLength(1)
    expect(spotify.playlistItemsRequests(PLAYLISTS.mine.id)).toHaveLength(1)
    expect(trackUris(spotify, PLAYLISTS.mine.id)).toEqual(before)
  })

  test('500 shows a failure banner in view and reloads the items', async ({
    page,
    spotify,
  }) => {
    addLongPlaylist(spotify)
    spotify.respond(
      `/v1/playlists/${LONG.id}/items`,
      spotifyError(500, 'Server error'),
      'DELETE',
    )
    const lastName = longAlbumName(LONG_ALBUMS - 1)

    await page.goto(`./?playlist=${LONG.id}`)
    await expect(
      page.getByText(`${LONG_ALBUMS} / ${LONG_ALBUMS} albums`),
    ).toBeVisible()

    const lastButton = actionsButton(page, lastName)
    await lastButton.scrollIntoViewIfNeeded()
    await expect(lastButton).toBeInViewport()
    await expect(albumLink(page, longAlbumName(0))).not.toBeInViewport()

    await removeAlbum(page, lastName, LONG.name)

    const alert = banner(page, 'alert')
    await expect(alert).toHaveText(
      "The removal may not have completed (Couldn't load data from Spotify)",
    )
    await expect(alert).toBeInViewport()
    await expect
      .poll(() => spotify.playlistItemsRequests(LONG.id).length)
      .toBe(2)
    await expect(albumLink(page, lastName)).toBeVisible()
    expect(spotify.records('DELETE')).toHaveLength(1)
  })
})

test('collaborative playlists owned by others offer the actions menu', async ({
  page,
}) => {
  await page.goto(`./?playlist=${PLAYLISTS.shared.id}`)
  await expect(albumLink(page, FOXTROT.name)).toBeVisible()

  const button = actionsButton(page, FOXTROT.name)
  await expect(button).toBeEnabled()
  await button.click()
  await expect(
    page
      .getByRole('dialog', { name: FOXTROT.name })
      .getByRole('button', { name: REMOVE_ITEM }),
  ).toBeEnabled()
})

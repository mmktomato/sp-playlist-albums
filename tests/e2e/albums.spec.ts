import type { Page } from '@playwright/test'
import { SELECT_PROMPT } from './support/constants.ts'
import {
  ALPHA,
  BRAVO,
  CHARLIE,
  FOLLOWED_FILLER_COUNT,
  OTHER_ARTIST,
  PLAYLISTS,
  album,
  imageUrl,
  trackEntry,
} from './support/data.ts'
import { expect, test } from './support/fixtures.ts'

const SAVED = 'Saved to library'
const UNSAVED = 'Not saved'

function albumList(page: Page) {
  return page.getByRole('main').getByRole('list')
}

function albumLink(page: Page, name: string) {
  return albumList(page).getByRole('link', { name })
}

async function selectFromDrawer(page: Page, playlistName: string) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page
    .getByRole('dialog', { name: 'Playlists' })
    .getByRole('button', { name: playlistName })
    .click()
}

test('selecting a playlist shows its albums without duplicates', async ({
  page,
  spotify,
}) => {
  await page.goto('./')
  await expect(page.getByText(SELECT_PROMPT)).toBeVisible()

  await selectFromDrawer(page, PLAYLISTS.mine.name)

  await expect(page).toHaveURL(
    (url) => url.searchParams.get('playlist') === PLAYLISTS.mine.id,
  )
  await expect(page.getByRole('dialog', { name: 'Playlists' })).toBeHidden()
  await expect(
    page.getByRole('heading', { level: 1, name: PLAYLISTS.mine.name }),
  ).toBeVisible()
  await expect(page.getByText('3 / 3 albums')).toBeVisible()

  const links = albumList(page).getByRole('link')
  await expect(links).toHaveCount(3)
  await expect(links.nth(0)).toContainText(ALPHA.name)
  await expect(links.nth(1)).toContainText(BRAVO.name)
  await expect(links.nth(2)).toContainText(CHARLIE.name)
  await expect(links.nth(0)).toContainText('Followed Artist')
  await expect(links.nth(1)).toContainText('Other Artist')

  await expect(
    albumLink(page, ALPHA.name).getByRole('img', { name: SAVED, exact: true }),
  ).toBeVisible()
  await expect(
    albumLink(page, BRAVO.name).getByRole('img', {
      name: UNSAVED,
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    albumLink(page, CHARLIE.name).getByRole('img', {
      name: SAVED,
      exact: true,
    }),
  ).toBeVisible()

  await expect(albumLink(page, ALPHA.name).locator('img')).toHaveAttribute(
    'src',
    imageUrl(ALPHA.id!),
  )
  await expect(
    albumLink(page, CHARLIE.name).getByTestId('cover-placeholder'),
  ).toBeVisible()

  const containsRequests = spotify.requestsTo('/v1/me/library/contains')
  expect(containsRequests).toHaveLength(1)
  expect(containsRequests[0].searchParams.get('uris')).toBe(
    [ALPHA.uri, BRAVO.uri, CHARLIE.uri].join(','),
  )

  const itemsRequests = spotify.playlistItemsRequests(PLAYLISTS.mine.id)
  expect(itemsRequests).toHaveLength(1)
  expect(itemsRequests[0].searchParams.get('limit')).toBe('50')
})

test('follow filter keeps only albums whose album artists are followed', async ({
  page,
  spotify,
}) => {
  await page.goto(`./?playlist=${PLAYLISTS.mine.id}`)
  await expect(page.getByText('3 / 3 albums')).toBeVisible()
  expect(spotify.requestsTo('/v1/me/following')).toHaveLength(0)

  const toggle = page.getByRole('button', { name: 'Following only' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()

  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('1 / 3 albums')).toBeVisible()
  const links = albumList(page).getByRole('link')
  await expect(links).toHaveCount(1)
  await expect(links.first()).toContainText(ALPHA.name)
  await expect(albumLink(page, BRAVO.name)).toHaveCount(0)

  const followingRequests = spotify.requestsTo('/v1/me/following')
  expect(followingRequests).toHaveLength(
    Math.ceil((FOLLOWED_FILLER_COUNT + 1) / 50),
  )
  expect(followingRequests[0].searchParams.get('type')).toBe('artist')
  expect(followingRequests[1].searchParams.get('after')).not.toBeNull()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('3 / 3 albums')).toBeVisible()
  await expect(links).toHaveCount(3)

  await toggle.click()
  await expect(page.getByText('1 / 3 albums')).toBeVisible()
  expect(spotify.requestsTo('/v1/me/following')).toHaveLength(
    followingRequests.length,
  )
})

test('album cards show the total track count of the album', async ({
  page,
  spotify,
}) => {
  const golf = {
    ...album('golf', 'Golf Album', [OTHER_ARTIST]),
    total_tracks: undefined,
  }
  spotify.data.playlistItems
    .get(PLAYLISTS.mine.id)!
    .push(trackEntry('t-golf', golf))

  await page.goto(`./?playlist=${PLAYLISTS.mine.id}`)
  await expect(page.getByText('4 / 4 albums')).toBeVisible()

  await expect(
    albumLink(page, ALPHA.name).getByText('12 tracks', { exact: true }),
  ).toBeVisible()
  await expect(
    albumLink(page, BRAVO.name).getByText('1 track', { exact: true }),
  ).toBeVisible()
  await expect(
    albumLink(page, CHARLIE.name).getByText('8 tracks', { exact: true }),
  ).toBeVisible()
  await expect(albumLink(page, golf.name)).toBeVisible()
  await expect(albumLink(page, golf.name)).not.toContainText(/\btracks?\b/)
})

test('album cards link to the album on open.spotify.com', async ({ page }) => {
  await page.goto(`./?playlist=${PLAYLISTS.mine.id}`)
  await expect(page.getByText('3 / 3 albums')).toBeVisible()

  for (const album of [ALPHA, BRAVO, CHARLIE]) {
    const link = albumLink(page, album.name)
    await expect(link).toHaveAttribute(
      'href',
      `https://open.spotify.com/album/${album.id}`,
    )
    await expect(link).not.toHaveAttribute('target', /.*/)
  }
})

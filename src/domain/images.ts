import type { SpotifyImage } from '../spotify/types'

const PREFERRED_IMAGE_WIDTH = 300

export function pickImageUrl(
  images: readonly SpotifyImage[] | null | undefined,
): string | undefined {
  if (!images || images.length === 0) return undefined
  let best: SpotifyImage | undefined
  for (const image of images) {
    if (image.width == null) continue
    if (
      best?.width == null ||
      Math.abs(image.width - PREFERRED_IMAGE_WIDTH) <
        Math.abs(best.width - PREFERRED_IMAGE_WIDTH)
    ) {
      best = image
    }
  }
  return (best ?? images[0]).url
}

export function formatTracks(count: number): string {
  return `${count} ${count === 1 ? 'track' : 'tracks'}`
}

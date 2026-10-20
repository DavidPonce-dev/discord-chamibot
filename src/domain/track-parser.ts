// "Artist - Song | Album", "Artist – Song // Live": the first segment is the artist, the second the song
const SEGMENT_SEPARATOR = /\s+[-–—|│]\s+|\s+\/\/\s+/
// Only used when there is no other separator: "Queen: Bohemian Rhapsody"
const COLON_SEPARATOR = /^(.+?)\s?:\s(.+)$/
// Featured artists: "Song ft. X", "Artist feat. X", "Song featuring X"
const FEATURING = /\s+(?:ft\.?|feat\.?|featuring)\s.*$/i
// Upload noise left at the end of a segment once brackets are removed
const TRAILING_NOISE = /\s*\b(?:official\s+(?:music\s+)?(?:video|audio|visualizer)|lyrics?(?:\s+video)?|video\s+oficial|audio\s+oficial|letra|hd|4k)\s*$/i

export type ParsedTitle = Readonly<{ artist: string; song: string }>

export const youtubeThumbnail = (id: string): string =>
  `https://img.youtube.com/vi/${id}/hqdefault.jpg`

const stripFeaturing = (s: string): string => s.replace(FEATURING, "").trim()

const cleanSegment = (s: string): string => stripFeaturing(s).replace(TRAILING_NOISE, "").trim()

// Best-effort split of a YouTube title into artist and song (artist is "" when unknown).
// The result feeds Last.fm lookups, which need clean names to find similar tracks.
export const parseTitle = (title: string): ParsedTitle => {
  const jpOpen = title.indexOf("「")
  const jpClose = title.indexOf("」")
  if (jpOpen > 0 && jpClose > jpOpen) {
    return { artist: title.slice(0, jpOpen).trim(), song: title.slice(jpOpen + 1, jpClose).trim() }
  }

  const clean = title.replace(/\[.*?\]|\(.*?\)/g, " ").replace(/\s+/g, " ").trim()

  const segments = clean.split(SEGMENT_SEPARATOR).map(s => s.trim()).filter(Boolean)
  if (segments.length >= 2) {
    const artist = stripFeaturing(segments[0])
    const song = cleanSegment(segments[1])
    if (artist && song) return { artist, song }
  }

  const colon = clean.match(COLON_SEPARATOR)
  if (colon) {
    const artist = stripFeaturing(colon[1])
    const song = cleanSegment(colon[2])
    if (artist && song) return { artist, song }
  }

  // "Drake feat. Rihanna": no song separator, but the featuring marks the end of the artist
  const withoutFeaturing = stripFeaturing(clean)
  if (withoutFeaturing && withoutFeaturing !== clean) return { artist: withoutFeaturing, song: clean }

  return { artist: "", song: cleanSegment(clean) || clean }
}

export const extractArtist = (title: string): string => parseTitle(title).artist

export const extractSong = (title: string): string => parseTitle(title).song

export const sanitizeYouTubeUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    const vid = parsed.searchParams.get("v")
    if (vid) return `https://www.youtube.com/watch?v=${vid}`
  } catch {}
  return url
}

export const extractVideoId = (url: string): string | undefined => {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get("v") ?? undefined
  } catch {
    return undefined
  }
}

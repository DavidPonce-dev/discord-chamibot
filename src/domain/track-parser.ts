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

// Channels that upload other artists' music: their name is not the artist
const NON_ARTIST_CHANNEL = /lyric|letra|karaoke|\bmusic\b|records|hits|\bmix\b|\btv\b|playlist|vibes/i

const normalize = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "")

// "Bad Bunny - Topic", "BadBunnyVEVO", "Bad Bunny Official" -> "Bad Bunny"
export const artistFromChannel = (channel: string | undefined): string => {
  if (!channel || NON_ARTIST_CHANNEL.test(channel)) return ""
  return channel
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .replace(/\s*(?:official|oficial)(?:\s*(?:channel|canal|page))?$/i, "")
    .trim()
}

// Use the uploader's channel to fix what the title alone can't: reversed "Song - Artist" titles
// and titles without an artist ("Blinding Lights" uploaded by The Weeknd)
const applyChannelHint = (parsed: ParsedTitle, channel: string | undefined): ParsedTitle => {
  const channelArtist = artistFromChannel(channel)
  if (!channelArtist) return parsed
  const ch = normalize(channelArtist)
  if (!ch) return parsed

  if (parsed.artist) {
    // "La Bachata - MTZ Manuel Turizo" by Manuel Turizo: the channel is in the song slot
    const artistMatches = normalize(parsed.artist).includes(ch)
    const songMatches = normalize(parsed.song).includes(ch)
    return !artistMatches && songMatches ? { artist: channelArtist, song: parsed.artist } : parsed
  }
  // "The Weeknd Blinding Lights" by TheWeekndVEVO: the song starts with the artist. Compare
  // normalized text (channel names often drop spaces/accents) and keep the title's spelling
  for (let i = 1; i < parsed.song.length; i++) {
    if (normalize(parsed.song.slice(0, i)) !== ch) continue
    const rest = parsed.song.slice(i).replace(/^[\s:,-]+/, "")
    if (rest) return { artist: parsed.song.slice(0, i).trim(), song: rest }
  }
  return { artist: channelArtist, song: parsed.song }
}

// Best-effort split of a YouTube title into artist and song (artist is "" when unknown).
// The result feeds Last.fm lookups, which need clean names to find similar tracks.
// `channel` (uploader name), when known, disambiguates reversed or artist-less titles.
export const parseTitle = (title: string, channel?: string): ParsedTitle =>
  applyChannelHint(parseTitleText(title), channel)

const parseTitleText = (title: string): ParsedTitle => {
  const jpOpen = title.indexOf("「")
  const jpClose = title.indexOf("」")
  if (jpOpen > 0 && jpClose > jpOpen) {
    return { artist: title.slice(0, jpOpen).trim(), song: title.slice(jpOpen + 1, jpClose).trim() }
  }

  const clean = title.replace(/\[.*?\]|\(.*?\)/g, " ").replace(/\s+/g, " ").trim()

  // Removing "(Video Oficial)" can leave doubled separators ("Song - - Artist"): drop the leftovers
  const segments = clean
    .split(SEGMENT_SEPARATOR)
    .map(s => s.replace(/^[\s\-–—|│]+|[\s\-–—|│]+$/g, ""))
    .filter(Boolean)
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

// The stored thumbnail, or one derived from the video id/URL: some resolution paths
// (fallbacks, playlists) can leave the field empty while the URL still identifies the video
export const trackThumbnail = (track: Readonly<{ thumbnail?: string; id?: string; url: string }>): string | undefined => {
  if (track.thumbnail) return track.thumbnail
  const id = track.id || extractVideoId(track.url) || extractShortVideoId(track.url)
  return id ? youtubeThumbnail(id) : undefined
}

// youtu.be/<id> links carry the id in the path, not in "v="
const extractShortVideoId = (url: string): string | undefined => {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== "youtu.be") return undefined
    return parsed.pathname.slice(1) || undefined
  } catch {
    return undefined
  }
}

type NamedTrack = Readonly<{ title: string; canonicalTitle?: string; artist?: string; song?: string }>

// Artist and song for display: prefer clean names (Last.fm canonical title, yt-dlp metadata)
// over parsing the raw YouTube upload title
export const trackNames = (track: NamedTrack): ParsedTitle =>
  track.artist && track.song
    ? { artist: track.artist, song: track.song }
    : parseTitle(track.canonicalTitle ?? track.title)

// "Artist - Song", or just the song when the artist is unknown
export const displayTitle = (track: NamedTrack): string => {
  const { artist, song } = trackNames(track)
  return artist ? `${artist} - ${song}` : song
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

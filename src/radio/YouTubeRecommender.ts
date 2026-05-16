import play from "play-dl"
import youtubedl from "youtube-dl-exec"
import { Track } from "../core/types"
import { parseDurationSec } from "../utils/format"

const MAX_AUTOPLAY_SEC = 1500

const GENRE_KEYWORDS = [
  "rock", "pop", "metal", "hip hop", "rap", "r&b", "jazz", "blues",
  "country", "electronic", "dance", "classical", "reggae", "punk",
  "alternative", "indie", "soul", "funk", "disco", "folk", "latin",
  "edm", "techno", "house", "trance", "dubstep", "ambient", "grunge",
  "punk rock", "alternative rock", "hard rock", "heavy metal", "nu metal",
  "hip-hop", "trap", "lo-fi", "synthwave", "progressive", "acoustic",
]

interface VideoResult {
  title?: string
  url?: string
  id?: string
  durationRaw?: string
}

function extractArtist(title: string): string {
  const sep = title.search(/ [-–|]/)
  if (sep > 0) return title.slice(0, sep)
  return title.replace(/\[.*?\]|\(.*?\)/g, "").trim() || "popular music"
}

async function detectGenre(url: string): Promise<string | null> {
  try {
    const info = await play.video_basic_info(url)
    const tags = info.video_details.tags ?? []
    const genreTag = tags.find((t: string) => GENRE_KEYWORDS.includes(t.toLowerCase()))
    if (genreTag) return genreTag
  } catch {
    /* ignore */
  }
  return null
}

async function searchPlayDl(query: string): Promise<VideoResult[]> {
  try {
    const results = await play.search(query, { limit: 15 })
    return results.map((r) => ({
      title: r.title,
      url: r.url,
      id: r.id,
      durationRaw: r.durationRaw,
    }))
  } catch {
    return []
  }
}

async function searchYtDlp(query: string): Promise<VideoResult[]> {
  try {
    const out = (await youtubedl(`ytsearch15:${query}`, {
      dumpSingleJson: true,
      noWarnings: true,
      quiet: true,
      flatPlaylist: true,
      matchFilter: "duration < 1500",
    }, { timeout: 15000 })) as any
    const entries = out?.entries ?? []
    return entries.map((e: any) => ({
      title: e.title,
      url: `https://youtube.com/watch?v=${e.id}`,
      id: e.id,
      durationRaw: e.duration ?? undefined,
    }))
  } catch {
    return []
  }
}

function filterResults(
  videos: VideoResult[],
  currentId?: string,
  currentTitle?: string,
): VideoResult[] {
  return videos.filter((v) => {
    if (currentId && v.id === currentId) return false
    if (currentTitle && v.title?.toLowerCase() === currentTitle) return false
    const durSec = parseDurationSec(v.durationRaw)
    if (durSec > MAX_AUTOPLAY_SEC) return false
    return true
  })
}

export class YouTubeRecommender {
  async findRelated(
    currentTrack: Track | null,
    lastTrackTitle: string | null,
  ): Promise<Omit<Track, "requestedBy"> | null> {
    const title = lastTrackTitle ?? ""
    if (!title && !currentTrack?.url) return null

    let genreQuery = ""
    if (currentTrack?.url) {
      const genre = await detectGenre(currentTrack.url)
      if (genre) genreQuery = `${genre} music`
    }

    const artistQuery = extractArtist(title)
    const queries = genreQuery ? [genreQuery, artistQuery] : [artistQuery]

    const currentId = currentTrack?.id
    const currentTitle = currentTrack?.title?.toLowerCase()

    for (const q of queries) {
      let videos = await searchPlayDl(q)
      if (!videos.length) videos = await searchYtDlp(q)
      if (!videos.length) continue

      const filtered = filterResults(videos, currentId, currentTitle)
      if (!filtered.length) continue

      const picked = filtered[Math.floor(Math.random() * filtered.length)]
      return {
        title: picked.title ?? "Unknown",
        url: picked.url ?? `https://youtube.com/watch?v=${picked.id}`,
        duration: picked.durationRaw,
        id: picked.id,
        thumbnail: picked.id
          ? `https://img.youtube.com/vi/${picked.id}/hqdefault.jpg`
          : undefined,
      }
    }

    return null
  }
}

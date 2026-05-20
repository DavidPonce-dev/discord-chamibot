import play from "play-dl"
import { Track } from "../core/types"
import { parseDurationSec } from "../utils/format"
import { VideoResult, searchPlayDl, searchYtDlp } from "./RadioSearchService"

const MAX_AUTOPLAY_SEC = 1500
const MAX_RETRIES = 3
const ARTIST_ROTATION_LIMIT = 3

const GENRE_KEYWORDS = [
  "rock", "pop", "metal", "hip hop", "rap", "r&b", "jazz", "blues",
  "country", "electronic", "dance", "classical", "reggae", "punk",
  "alternative", "indie", "soul", "funk", "disco", "folk", "latin",
  "edm", "techno", "house", "trance", "dubstep", "ambient", "grunge",
  "punk rock", "alternative rock", "hard rock", "heavy metal", "nu metal",
  "hip-hop", "trap", "lo-fi", "synthwave", "progressive", "acoustic",
]

const NON_MUSIC_KEYWORDS = [
  "podcast", "interview", "tutorial", "review", "reaction",
  "vlog", "gameplay", "comedy", "lecture", "documentary",
  "asmr", "full album", "live stream", "audiobook",
]

export function extractArtist(title: string): string {
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

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function filterResults(
  videos: VideoResult[],
  currentId?: string,
  currentTitle?: string,
  excludeTitles: Set<string> = new Set(),
): VideoResult[] {
  return videos.filter((v) => {
    if (currentId && v.id === currentId) return false
    if (currentTitle && v.title?.toLowerCase() === currentTitle) return false
    if (v.title && excludeTitles.has(normalizeTitle(v.title))) return false
    const durSec = parseDurationSec(v.durationRaw)
    if (durSec > MAX_AUTOPLAY_SEC) return false
    return true
  })
}

export async function isMusic(video: VideoResult): Promise<boolean> {
  const title = (video.title ?? "").toLowerCase()
  if (NON_MUSIC_KEYWORDS.some((k) => title.includes(k))) return false

  if (video.url) {
    try {
      const info = await play.video_basic_info(video.url)
      const details = info.video_details as any
      const category = details.category?.toLowerCase()
      if (category === "music") return true
      if (category) return false
    } catch {
      /* ignore */
    }
  }

  return true
}

function isSameArtist(a: string, b: string): boolean {
  const na = a.toLowerCase().trim()
  const nb = b.toLowerCase().trim()
  return na === nb || na.includes(nb) || nb.includes(na)
}

export class YouTubeRecommender {
  async findRelated(
    currentTrack: Track | null,
    lastTrackTitle: string | null,
    excludeTitles: Set<string> = new Set(),
    currentArtist?: string | null,
    shouldSwitch?: boolean,
  ): Promise<Omit<Track, "requestedBy"> | null> {
    const title = lastTrackTitle ?? ""
    if (!title && !currentTrack?.url) return null

    let genre: string | null = null
    if (currentTrack?.url) {
      genre = await detectGenre(currentTrack.url)
    }

    const currentId = currentTrack?.id
    const currentTitle = currentTrack?.title?.toLowerCase()

    let queries: string[]
    if (shouldSwitch && currentArtist) {
      queries = genre ? [`${genre} music`] : ["popular music"]
    } else {
      const artistQuery = extractArtist(title)
      if (genre) {
        queries = [`${genre} music`, `${genre} ${artistQuery}`]
      } else {
        queries = [`${artistQuery} music`]
      }
    }

    for (const q of queries) {
      let videos = await searchPlayDl(q)
      if (!videos.length) videos = await searchYtDlp(q)
      if (!videos.length) continue

      const filtered = filterResults(videos, currentId, currentTitle, excludeTitles)
      if (!filtered.length) continue

      const shuffled = [...filtered].sort(() => Math.random() - 0.5)
      const candidates = shuffled.slice(0, MAX_RETRIES)

      for (const picked of candidates) {
        if (await isMusic(picked)) {
          if (shouldSwitch && currentArtist) {
            const pickedArtist = extractArtist(picked.title ?? "")
            if (isSameArtist(pickedArtist, currentArtist)) continue
          }
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
      }
    }

    return null
  }
}

import play, { YouTubePlayList } from "play-dl"
import { logger } from "@/utils/logger"
import { buildYtDlpArgs, spawnYtDlp, YtDlpResult } from "@/utils/ytdlp"
import { formatTime } from "@/utils/format"
import { YTDL_RESOLVE_TIMEOUT_MS } from "@/config/timeouts"
import { isCookieError, refreshCookies } from "@/cookies/CookieManager"

export interface ResolveResult {
  tracks: {
    url: string
    title: string
    duration?: string
    id?: string
    thumbnail?: string
    track?: string
    artist?: string
    album?: string
    channel?: string
  }[]
  playlistTitle?: string
  type?: "single" | "album" | "playlist"
}

function sanitizeYouTubeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const vid = parsed.searchParams.get("v")
    if (vid) {
      return `https://www.youtube.com/watch?v=${vid}`
    }
  } catch {}
  return url
}

function extractVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get("v") ?? undefined
  } catch {
    return undefined
  }
}

async function resolveWithYtDlp(url: string): Promise<{ title: string; duration: string; id: string; track?: string; artist?: string; album?: string; channel?: string } | null> {
  return resolveWithYtDlpInternal(url, false)
}

async function resolveWithYtDlpInternal(url: string, retried: boolean): Promise<{ title: string; duration: string; id: string; track?: string; artist?: string; album?: string; channel?: string } | null> {
  const args = buildYtDlpArgs(["--dump-json"])
  args.push(url)

  try {
    const result = await spawnYtDlp(args, YTDL_RESOLVE_TIMEOUT_MS)
    if (result.code !== 0 || !result.stdout.trim()) {
      const stderr = result.stderr.slice(0, 150)
      logger.debug("search", "yt-dlp resolve failed", {
        code: result.code,
        error: stderr,
      })

      if (!retried && isCookieError(stderr)) {
        logger.warn("search", "Cookie error detected in resolver, refreshing and retrying")
        const refreshResult = await refreshCookies()
        if (refreshResult.success) {
          logger.info("search", "Cookies refreshed, retrying yt-dlp resolve")
          return resolveWithYtDlpInternal(url, true)
        }
      }

      return null
    }

    const data = JSON.parse(result.stdout)
    const title = data.title ?? "Unknown"
    const duration = data.duration ?? 0
    const id = data.id ?? extractVideoId(url) ?? ""
    const durationStr = formatTime(duration)
    return {
      title,
      duration: durationStr,
      id,
      track: data.track ?? undefined,
      artist: data.artist ?? data.album_artist ?? undefined,
      album: data.album ?? undefined,
      channel: data.channel ?? data.uploader ?? undefined,
    }
  } catch {
    return null
  }
}

export async function resolveQuery(query: string): Promise<ResolveResult> {
  const isUrl = query.startsWith("http://") || query.startsWith("https://")

  if (isUrl) {
    const parsed = new URL(query)
    if (parsed.searchParams.has("list") || parsed.pathname.includes("/playlist")) {
      try {
        const list = await play.playlist_info(query, { incomplete: true })
        const videos = await list.all_videos()
        const tracks = videos.slice(0, 50).map((v) => ({
          url: v.url ?? `https://youtube.com/watch?v=${v.id}`,
          title: v.title ?? "Unknown",
          duration: v.durationRaw,
          id: v.id,
          thumbnail: v.id ? `https://img.youtube.com/vi/${v.id}/hqdefault.jpg` : undefined,
        }))
        return { tracks, playlistTitle: list.title ?? undefined }
      } catch {
        // fallback: treat as single video
      }
    }

    const isChannel = parsed.pathname.includes("/channel/") || parsed.pathname.startsWith("/@")
    if (!isChannel) {
      const cleanUrl = sanitizeYouTubeUrl(query)
      const id = extractVideoId(cleanUrl)

      // Try yt-dlp first (works with cookies from cloud IPs)
      const ytDlpResult = await resolveWithYtDlp(cleanUrl)
      if (ytDlpResult) {
        return {
          tracks: [{
            url: cleanUrl,
            title: ytDlpResult.title,
            duration: ytDlpResult.duration,
            id: ytDlpResult.id,
            thumbnail: ytDlpResult.id ? `https://img.youtube.com/vi/${ytDlpResult.id}/hqdefault.jpg` : undefined,
            track: ytDlpResult.track,
            artist: ytDlpResult.artist,
            album: ytDlpResult.album,
            channel: ytDlpResult.channel,
          }],
        }
      }

      // Fallback to play-dl (works from non-blocked IPs)
      try {
        const info = await play.video_info(cleanUrl)
        return {
          tracks: [{
            url: cleanUrl,
            title: info.video_details.title ?? "Unknown",
            duration: info.video_details.durationRaw,
            id: info.video_details.id ?? id,
            thumbnail: (info.video_details.id ?? id) ? `https://img.youtube.com/vi/${info.video_details.id ?? id}/hqdefault.jpg` : undefined,
          }],
        }
      } catch {
        throw new Error("No se pudo obtener info del video. Usá el admin panel para extraer cookies de YouTube.")
      }
    }
  }

  const results = await play.search(query, { limit: 1 })
  if (!results.length) {
    throw new Error("Sin resultados")
  }

  const video = results[0]
  const id = video.id ?? extractVideoId(video.url)
  return {
    tracks: [{
      url: video.url ?? `https://youtube.com/watch?v=${video.id}`,
      title: video.title ?? "Unknown",
      duration: video.durationRaw,
      id,
      thumbnail: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
    }],
  }
}

const ALBUM_KEYWORDS = /\b(album|full\s*album|ep\b|lp\b|discography|complete\s*album|official\s*album|deluxe\s*edition|remastered|edición\s*completa|album\s*completo)\b/i
const PLAYLIST_KEYWORDS = /\b(playlist|mix|compilation|best\s*of|top\s*\d+|hits|radio|chill|lofi|lo-fi|vibes|party|workout|study|sleep|focus|gym|drive|road\s*trip|karaoke|instrumental|cover|live\s*session|podcast)\b/i

function classifyPlaylist(title: string, videoCount: number): "album" | "playlist" {
  const isAlbumByKeywords = ALBUM_KEYWORDS.test(title)
  const isPlaylistByKeywords = PLAYLIST_KEYWORDS.test(title)

  if (isAlbumByKeywords && !isPlaylistByKeywords) return "album"
  if (isPlaylistByKeywords && !isAlbumByKeywords) return "playlist"

  if (isAlbumByKeywords && isPlaylistByKeywords) {
    return videoCount <= 25 ? "album" : "playlist"
  }

  if (videoCount >= 2 && videoCount <= 25) return "album"
  if (videoCount > 25) return "playlist"

  return "playlist"
}

export async function autocompleteSearch(query: string): Promise<{ name: string; value: string }[]> {
  try {
    const [videos, playlistResults] = await Promise.all([
      play.search(query, { source: { youtube: "video" }, limit: 10 }),
      play.search(query, { source: { youtube: "playlist" }, limit: 20 }),
    ])

    const albums: YouTubePlayList[] = []
    const playlists: YouTubePlayList[] = []

    for (const p of playlistResults) {
      const classification = classifyPlaylist(p.title ?? "", p.videoCount ?? 0)
      if (classification === "album") {
        if (albums.length < 4) albums.push(p)
      } else {
        if (playlists.length < 2) playlists.push(p)
      }
    }

    const results: { name: string; value: string }[] = []

    for (const v of videos.slice(0, 4)) {
      if (results.length >= 10) break
      const name = `🎵 ${v.title ?? "Unknown"}`
      results.push({
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: v.url ?? `https://youtube.com/watch?v=${v.id}`,
      })
    }

    for (const a of albums.slice(0, 4)) {
      if (results.length >= 10) break
      const name = `💿 ${a.title ?? "Unknown"}`
      results.push({
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: a.url ?? "",
      })
    }

    for (const p of playlists.slice(0, 2)) {
      if (results.length >= 10) break
      const name = `📋 ${p.title ?? "Unknown"}`
      results.push({
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: p.url ?? "",
      })
    }

    if (results.length < 10) {
      for (const v of videos.slice(4)) {
        if (results.length >= 10) break
        const name = `🎵 ${v.title ?? "Unknown"}`
        results.push({
          name: name.length > 100 ? name.slice(0, 97) + "..." : name,
          value: v.url ?? `https://youtube.com/watch?v=${v.id}`,
        })
      }
    }

    return results
  } catch {
    return []
  }
}

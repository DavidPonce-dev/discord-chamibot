import play, { YouTubePlayList } from "play-dl"
import youtubedl from "youtube-dl-exec"
import { logger } from "./logger"

export interface ResolveResult {
  tracks: {
    url: string
    title: string
    duration?: string
    id?: string
    thumbnail?: string
  }[]
  playlistTitle?: string
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

async function resolveWithYtDlp(url: string): Promise<{ title: string; duration: string; id: string } | null> {
  try {
    const result = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      skipDownload: true,
      quiet: true,
    })

    if (!result || typeof result !== "object") return null

    const title = (result as any).title ?? "Unknown"
    const duration = (result as any).duration ?? 0
    const id = (result as any).id ?? extractVideoId(url) ?? ""
    const durationStr = duration ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}` : "0:00"

    return { title, duration: durationStr, id }
  } catch (err) {
    logger.warn("search", "yt-dlp resolve failed, falling back to play-dl", {
      error: err instanceof Error ? err.message : String(err),
    })
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

      // Try yt-dlp first (more reliable), fallback to play-dl
      const ytDlpResult = await resolveWithYtDlp(cleanUrl)
      if (ytDlpResult) {
        return {
          tracks: [{
            url: cleanUrl,
            title: ytDlpResult.title,
            duration: ytDlpResult.duration,
            id: ytDlpResult.id,
            thumbnail: ytDlpResult.id ? `https://img.youtube.com/vi/${ytDlpResult.id}/hqdefault.jpg` : undefined,
          }],
        }
      }

      // Fallback to play-dl
      try {
        const info = await play.video_basic_info(cleanUrl)
        return {
          tracks: [{
            url: cleanUrl,
            title: info.video_details.title ?? "Unknown",
            duration: info.video_details.durationRaw,
            id,
            thumbnail: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
          }],
        }
      } catch {
        throw new Error("No se pudo obtener info del video")
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

const ALBUM_KEYWORDS = /\b(album|full\s*album|ep|lp|discography|complete|edición|cd)\b/i

function isAlbumLike(title: string, videoCount: number): boolean {
  return videoCount >= 3 && videoCount <= 20 || ALBUM_KEYWORDS.test(title)
}

export async function autocompleteSearch(query: string): Promise<{ name: string; value: string }[]> {
  try {
    const [videos, playlistResults] = await Promise.all([
      play.search(query, { source: { youtube: "video" }, limit: 5 }),
      play.search(query, { source: { youtube: "playlist" }, limit: 15 }),
    ])

    const albums: YouTubePlayList[] = []
    const playlists: YouTubePlayList[] = []

    for (const p of playlistResults) {
      if (isAlbumLike(p.title ?? "", p.videoCount ?? 0)) {
        if (albums.length < 5) albums.push(p)
      } else {
        if (playlists.length < 3) playlists.push(p)
      }
    }

    const results: { name: string; value: string }[] = []

    for (const v of videos) {
      if (results.length >= 25) break
      results.push({
        name: `🎵 ${v.title ?? "Unknown"}`,
        value: v.url ?? `https://youtube.com/watch?v=${v.id}`,
      })
    }

    for (const a of albums) {
      if (results.length >= 25) break
      results.push({
        name: `💿 ${a.title ?? "Unknown"}`,
        value: a.url ?? "",
      })
    }

    for (const p of playlists) {
      if (results.length >= 25) break
      results.push({
        name: `📋 ${p.title ?? "Unknown"}`,
        value: p.url ?? "",
      })
    }

    return results.slice(0, 25)
  } catch {
    return []
  }
}

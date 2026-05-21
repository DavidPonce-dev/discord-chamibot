import play, { YouTubePlayList } from "play-dl"
import { spawn } from "child_process"
import { logger } from "./logger"
import { getCookieFile } from "./cookies"
import { buildYtDlpArgs, USER_AGENT } from "./ytdlp"
import { formatTime } from "./format"

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
  const args = buildYtDlpArgs(["--dump-json"])
  args.push(url)

  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"], timeout: 15000 })
    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (d) => (stdout += d))
    proc.stderr.on("data", (d) => (stderr += d))

    proc.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        logger.debug("search", "yt-dlp resolve failed", {
          code,
          error: stderr.slice(0, 150),
        })
        resolve(null)
        return
      }

      try {
        const data = JSON.parse(stdout)
        const title = data.title ?? "Unknown"
        const duration = data.duration ?? 0
        const id = data.id ?? extractVideoId(url) ?? ""
        const durationStr = formatTime(duration)
        resolve({ title, duration: durationStr, id })
      } catch {
        resolve(null)
      }
    })

    proc.on("error", () => resolve(null))
  })
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
        throw new Error("No se pudo obtener info del video. Si estás en un servidor cloud, configurá YOUTUBE_COOKIES")
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
      const name = `🎵 ${v.title ?? "Unknown"}`
      results.push({
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: v.url ?? `https://youtube.com/watch?v=${v.id}`,
      })
    }

    for (const a of albums) {
      if (results.length >= 25) break
      const name = `💿 ${a.title ?? "Unknown"}`
      results.push({
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: a.url ?? "",
      })
    }

    for (const p of playlists) {
      if (results.length >= 25) break
      const name = `📋 ${p.title ?? "Unknown"}`
      results.push({
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: p.url ?? "",
      })
    }

    return results.slice(0, 25)
  } catch {
    return []
  }
}

import play, { YouTubePlayList } from "play-dl"
import https from "https"
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

async function fetchOEmbed(url: string): Promise<{ title: string; author_name: string } | null> {
  return new Promise((resolve) => {
    https.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.title) resolve({ title: parsed.title, author_name: parsed.author_name ?? "" })
          else resolve(null)
        } catch {
          resolve(null)
        }
      })
      res.on("error", () => resolve(null))
    }).on("error", () => resolve(null))
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

      // Use YouTube oEmbed API (no auth required, not blocked)
      const oembed = await fetchOEmbed(cleanUrl)
      if (oembed) {
        const title = oembed.author_name ? `${oembed.author_name} - ${oembed.title}` : oembed.title
        return {
          tracks: [{
            url: cleanUrl,
            title,
            id,
            thumbnail: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
          }],
        }
      }

      throw new Error("No se pudo obtener info del video")
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

import play from "play-dl"

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

    const cleanUrl = sanitizeYouTubeUrl(query)
    const info = await play.video_basic_info(cleanUrl)
    const id = extractVideoId(cleanUrl)
    return {
      tracks: [{
        url: cleanUrl,
        title: info.video_details.title ?? "Unknown",
        duration: info.video_details.durationRaw,
        id,
        thumbnail: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
      }],
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

export async function autocompleteSearch(query: string): Promise<{ name: string; value: string }[]> {
  try {
    const results = await play.search(query, { limit: 10 })
    return results.map((r) => ({
      name: `🎵 ${r.title ?? "Unknown"}`,
      value: r.url ?? `https://youtube.com/watch?v=${r.id}`,
    }))
  } catch {
    return []
  }
}

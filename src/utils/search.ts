import play from "play-dl"

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

export async function resolveQuery(query: string): Promise<{
  url: string
  title: string
  duration?: string
}> {
  const isUrl = query.startsWith("http://") || query.startsWith("https://")

  if (isUrl) {
    const cleanUrl = sanitizeYouTubeUrl(query)
    const info = await play.video_basic_info(cleanUrl)
    return {
      url: cleanUrl,
      title: info.video_details.title ?? "Unknown",
      duration: info.video_details.durationRaw,
    }
  }

  const results = await play.search(query, { limit: 1 })
  if (!results.length) {
    throw new Error("Sin resultados")
  }

  const video = results[0]
  return {
    url: video.url ?? `https://youtube.com/watch?v=${video.id}`,
    title: video.title ?? "Unknown",
    duration: video.durationRaw,
  }
}

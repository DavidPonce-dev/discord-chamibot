import play from "play-dl"

export async function resolveQuery(query: string): Promise<{
  url: string
  title: string
  duration?: string
}> {
  const isUrl = query.startsWith("http://") || query.startsWith("https://")

  if (isUrl) {
    const info = await play.video_basic_info(query)
    return {
      url: query,
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

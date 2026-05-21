import play from "play-dl"

export interface VideoResult {
  title?: string
  url?: string
  id?: string
  durationRaw?: string
}

export async function searchPlayDl(query: string): Promise<VideoResult[]> {
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

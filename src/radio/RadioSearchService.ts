import play from "play-dl"
import youtubedl from "youtube-dl-exec"

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

export async function searchYtDlp(query: string): Promise<VideoResult[]> {
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

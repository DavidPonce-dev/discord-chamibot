import type { VideoSearchResult } from "../../domain/types"
import { USER_AGENT } from "./ytdlp"
import { YTDL_SEARCH_TIMEOUT_MS } from "../../config/timeouts"

// In-process YouTube search: one HTTP request (~0.5-1s) instead of spawning yt-dlp
// (~2.5s, mostly Python/deno startup). Callers fall back to yt-dlp when this returns [].

const SEARCH_URL = "https://www.youtube.com/results"
// "sp" filter: videos only
const VIDEOS_ONLY = "EgIQAQ%3D%3D"
const WEB_SEARCH_TIMEOUT_MS = Math.min(4_000, YTDL_SEARCH_TIMEOUT_MS)

type VideoRenderer = {
  videoId?: unknown
  title?: { runs?: { text?: unknown }[]; simpleText?: unknown }
  lengthText?: { simpleText?: unknown }
}

// Walk the whole tree instead of a fixed path so minor layout changes don't break parsing
const collectVideos = (node: unknown, out: VideoSearchResult[], limit: number): void => {
  if (out.length >= limit || !node || typeof node !== "object") return
  if (Array.isArray(node)) {
    for (const child of node) collectVideos(child, out, limit)
    return
  }
  const renderer = (node as { videoRenderer?: VideoRenderer }).videoRenderer
  if (renderer) {
    const id = renderer.videoId
    const title = renderer.title?.runs?.[0]?.text ?? renderer.title?.simpleText
    const duration = renderer.lengthText?.simpleText
    // No length means a live stream or premiere: not playable as a radio track
    if (typeof id === "string" && typeof title === "string" && typeof duration === "string") {
      out.push({ id, title, url: `https://www.youtube.com/watch?v=${id}`, durationRaw: duration })
    }
    return
  }
  for (const value of Object.values(node)) collectVideos(value, out, limit)
}

export const parseSearchPage = (html: string, limit: number): VideoSearchResult[] => {
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)
  if (!match) return []
  try {
    const out: VideoSearchResult[] = []
    collectVideos(JSON.parse(match[1]) as unknown, out, limit)
    return out
  } catch {
    return []
  }
}

export const searchYouTubeWeb = async (
  query: string,
  limit: number,
  timeoutMs = WEB_SEARCH_TIMEOUT_MS,
): Promise<VideoSearchResult[]> => {
  const q = query.trim()
  if (!q || limit <= 0) return []
  try {
    const url = `${SEARCH_URL}?search_query=${encodeURIComponent(q)}&sp=${VIDEOS_ONLY}`
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
        // Skip the EU consent interstitial, which has no results
        cookie: "CONSENT=YES+1; SOCS=CAI",
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return []
    return parseSearchPage(await response.text(), limit)
  } catch {
    return []
  }
}

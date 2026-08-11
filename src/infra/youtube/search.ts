import play from "play-dl"
import type { TrackSearchPort, CookieStorePort, LoggerPort } from "../../domain/ports"
import { withCookieRetry } from "../../domain/ports"
import { ok, err, type Result } from "../../shared/result"
import type { ResolveResult, ResolvedTrack, AutocompleteChoice, VideoSearchResult } from "../../domain/types"
import { buildYtDlpArgs, spawnYtDlp, searchYtDlp } from "./ytdlp"
import { formatTime } from "../../shared/format"
import { sanitizeYouTubeUrl, extractVideoId, youtubeThumbnail } from "../../domain/track-parser"
import { YTDL_RESOLVE_TIMEOUT_MS, AUTOCOMPLETE_FALLBACK_TIMEOUT_MS } from "../../config/timeouts"
import { createSuggestionProvider } from "./suggestions"

const resolveWithYtDlp = async (
  url: string,
  cookieStore: CookieStorePort,
): Promise<Result<ResolvedTrack, string>> => {
  return withCookieRetry(
    async () => {
      const args = buildYtDlpArgs(["--dump-json"], cookieStore)
      args.push(url)

      try {
        const result = await spawnYtDlp(args, YTDL_RESOLVE_TIMEOUT_MS)
        if (result.code !== 0 || !result.stdout.trim()) {
          const stderr = result.stderr.slice(0, 150)
          return err(stderr)
        }

        const data = JSON.parse(result.stdout)
        const title = data.title ?? "Unknown"
        const duration = data.duration ?? 0
        const id = data.id ?? extractVideoId(url) ?? ""
        const durationStr = formatTime(duration)
        return ok({
          url,
          title,
          duration: durationStr,
          id,
          thumbnail: id ? youtubeThumbnail(id) : undefined,
          track: data.track ?? undefined,
          artist: data.artist ?? data.album_artist ?? undefined,
          album: data.album ?? undefined,
          channel: data.channel ?? data.uploader ?? undefined,
        })
      } catch {
        return err("yt-dlp parse failed")
      }
    },
    async () => ({ success: false, timestamp: new Date().toISOString() }),
  )
}

export const createYouTubeSearch = (
  cookieStore: CookieStorePort,
  _logger: LoggerPort,
): TrackSearchPort => {
  const suggestionsProvider = createSuggestionProvider()
  const resolveQuery = async (query: string): Promise<Result<ResolveResult, string>> => {
    const isUrl = query.startsWith("http://") || query.startsWith("https://")

    if (isUrl) {
      const parsed = new URL(query)
      if (parsed.searchParams.has("list") || parsed.pathname.includes("/playlist")) {
        try {
          const list = await play.playlist_info(query, { incomplete: true })
          const videos = await list.all_videos()
          const tracks = videos.slice(0, 50).map((v): ResolvedTrack => ({
            url: v.url ?? `https://youtube.com/watch?v=${v.id}`,
            title: v.title ?? "Unknown",
            duration: v.durationRaw,
            id: v.id,
            thumbnail: v.id ? youtubeThumbnail(v.id) : undefined,
          }))
          return ok({ tracks, playlistTitle: list.title ?? undefined })
        } catch {
          // fallback: treat as single video
        }
      }

      const isChannel = parsed.pathname.includes("/channel/") || parsed.pathname.startsWith("/@")
      if (!isChannel) {
        const cleanUrl = sanitizeYouTubeUrl(query)
        const id = extractVideoId(cleanUrl)

        const ytDlpResult = await resolveWithYtDlp(cleanUrl, cookieStore)
        if (ytDlpResult.ok) {
          return ok({ tracks: [ytDlpResult.value] })
        }

        try {
          const info = await play.video_info(cleanUrl)
          const vid = info.video_details
          const vidId = vid.id ?? id
          return ok({
            tracks: [{
              url: cleanUrl,
              title: vid.title ?? "Unknown",
              duration: vid.durationRaw,
              id: vidId ?? undefined,
              thumbnail: vidId ? youtubeThumbnail(vidId) : undefined,
            }],
          })
        } catch {
          return err("No se pudo obtener info del video")
        }
      }
    }

    const cleanQuery = query.replace(/^\p{Extended_Pictographic}+(?:\s+)?/u, "").trim() || query

    const results = await searchYtDlp(cleanQuery, 1, cookieStore)
    if (results.length > 0) {
      const video = results[0]
      const id = video.id
      return ok({
        tracks: [{
          url: video.url ?? `https://youtube.com/watch?v=${id}`,
          title: video.title ?? "Unknown",
          duration: video.duration !== undefined ? formatTime(video.duration) : undefined,
          id,
          thumbnail: id ? youtubeThumbnail(id) : undefined,
        }],
      })
    }

    try {
      const playResults = await play.search(cleanQuery, { limit: 1, source: { youtube: "video" } })
      const video = playResults[0]
      if (!video) return err("Sin resultados")
      const id = video.id
      return ok({
        tracks: [{
          url: video.url ?? `https://youtube.com/watch?v=${id}`,
          title: video.title ?? "Unknown",
          duration: video.durationRaw,
          id,
          thumbnail: id ? youtubeThumbnail(id) : undefined,
        }],
      })
    } catch {
      return err("Sin resultados")
    }
  }

  const autocomplete = async (query: string): Promise<readonly AutocompleteChoice[]> => {
    const trimmed = query.trim()
    if (!trimmed) return []
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return []

    const suggestions = await suggestionsProvider.suggestions(trimmed)
    if (suggestions.length > 0) return suggestions

    const results = await searchYtDlp(trimmed, 10, cookieStore, {
      type: "video",
      timeoutMs: AUTOCOMPLETE_FALLBACK_TIMEOUT_MS,
    })
    return results.slice(0, 10).map((v): AutocompleteChoice => {
      const name = `\u{1F3B5} ${v.title ?? "Unknown"}`
      return {
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: v.url ?? `https://youtube.com/watch?v=${v.id}`,
      }
    })
  }

  const searchVideos = async (query: string, limit = 15): Promise<readonly VideoSearchResult[]> => {
    const results = await searchYtDlp(query, limit, cookieStore, { type: "video" })
    return results.map((r): VideoSearchResult => ({
      title: r.title,
      url: r.url,
      id: r.id,
      durationRaw: r.duration !== undefined ? formatTime(r.duration) : undefined,
    }))
  }

  return { resolveQuery, autocomplete, searchVideos } as const
}

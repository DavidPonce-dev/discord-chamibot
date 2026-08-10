import play from "play-dl"
import type { TrackSearchPort, CookieStorePort, LoggerPort } from "../../domain/ports"
import { withCookieRetry } from "../../domain/ports"
import { ok, err, type Result } from "../../shared/result"
import type { ResolveResult, ResolvedTrack, AutocompleteChoice, VideoSearchResult } from "../../domain/types"
import { buildYtDlpArgs, spawnYtDlp, searchYtDlp, type YtDlpSearchEntry } from "./ytdlp"
import { formatTime } from "../../shared/format"
import { sanitizeYouTubeUrl, extractVideoId, youtubeThumbnail, classifyPlaylist } from "../../domain/track-parser"
import { YTDL_RESOLVE_TIMEOUT_MS } from "../../config/timeouts"

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

    const results = await searchYtDlp(query, 1, cookieStore)
    if (!results.length) return err("Sin resultados")

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

  const autocomplete = async (query: string): Promise<readonly AutocompleteChoice[]> => {
    if (!query.trim()) return []

    const [videosResult, playlistsResult] = await Promise.allSettled([
      searchYtDlp(query, 10, cookieStore, { type: "video" }),
      searchYtDlp(query, 20, cookieStore, { type: "playlist" }),
    ])

    const videos = videosResult.status === "fulfilled" ? videosResult.value : []
    const playlistResults = playlistsResult.status === "fulfilled" ? playlistsResult.value : []

    const albums: YtDlpSearchEntry[] = []
    const playlists: YtDlpSearchEntry[] = []

    for (const p of playlistResults) {
      const classification = classifyPlaylist(p.title ?? "", 0)
      if (classification === "album") {
        if (albums.length < 4) albums.push(p)
      } else {
        if (playlists.length < 2) playlists.push(p)
      }
    }

    const results: AutocompleteChoice[] = []

    for (const v of videos.slice(0, 4)) {
      if (results.length >= 10) break
      const name = `\u{1F3B5} ${v.title ?? "Unknown"}`
      results.push({
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: v.url ?? `https://youtube.com/watch?v=${v.id}`,
      })
    }

    for (const a of albums.slice(0, 4)) {
      if (results.length >= 10) break
      const name = `\u{1F4BF} ${a.title ?? "Unknown"}`
      results.push({
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: a.url ?? "",
      })
    }

    for (const p of playlists.slice(0, 2)) {
      if (results.length >= 10) break
      const name = `\u{1F4CB} ${p.title ?? "Unknown"}`
      results.push({
        name: name.length > 100 ? name.slice(0, 97) + "..." : name,
        value: p.url ?? "",
      })
    }

    if (results.length < 10) {
      for (const v of videos.slice(4)) {
        if (results.length >= 10) break
        const name = `\u{1F3B5} ${v.title ?? "Unknown"}`
        results.push({
          name: name.length > 100 ? name.slice(0, 97) + "..." : name,
          value: v.url ?? `https://youtube.com/watch?v=${v.id}`,
        })
      }
    }

    return results
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

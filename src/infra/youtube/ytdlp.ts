import { spawn } from "child_process"
import fs from "fs"
import type { CookieStorePort } from "../../domain/ports"
import { YTDL_SEARCH_TIMEOUT_MS, YTDL_TIMEOUT_MS } from "../../config/timeouts"

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

// Format used for playback: metadata and stream URL can come from a single yt-dlp call
export const AUDIO_FORMAT = "bestaudio"

export interface YtDlpResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number | null
}

export function buildYtDlpArgs(baseArgs: string[], cookieStore: CookieStorePort, extraArgs: string[] = []): string[] {
  const args = [...baseArgs, "--js-runtimes", "deno", "--no-playlist", "--quiet", "--no-warnings", "--user-agent", USER_AGENT, ...extraArgs]
  const cookieFile = cookieStore.filePath()
  if (cookieFile && fs.existsSync(cookieFile)) {
    args.push("--cookies", cookieFile)
  }
  return args
}

export function spawnYtDlp(args: string[], timeoutMs = YTDL_TIMEOUT_MS): Promise<YtDlpResult> {
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    proc.stdout.on("data", (d: Buffer) => stdoutChunks.push(d))
    proc.stderr.on("data", (d: Buffer) => stderrChunks.push(d))
    proc.on("close", (code: number | null) => resolve({
      stdout: Buffer.concat(stdoutChunks).toString(),
      stderr: Buffer.concat(stderrChunks).toString(),
      code,
    }))
    proc.on("error", () => resolve({
      stdout: Buffer.concat(stdoutChunks).toString(),
      stderr: Buffer.concat(stderrChunks).toString() || "spawn failed",
      code: -1,
    }))

    const timer = setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL")
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString() || "timeout",
        code: -1,
      })
    }, timeoutMs)

    proc.on("close", () => clearTimeout(timer))
    proc.on("error", () => clearTimeout(timer))
  })
}

export type YtDlpSearchEntry = Readonly<{
  id?: string
  title?: string
  url?: string
  duration?: number
  channel?: string
  track?: string
  artist?: string
  album?: string
  audioUrl?: string
}>

const isGoogleVideoUrl = (url: string): boolean => /^https:\/\/[^/]*googlevideo\.com\//.test(url)

export function parseYtDlpSearchOutput(stdout: string): YtDlpSearchEntry[] {
  const entries: YtDlpSearchEntry[] = []
  for (const line of stdout.trim().split("\n")) {
    if (!line.trim()) continue
    try {
      const d = JSON.parse(line) as Record<string, unknown>
      const id = typeof d.id === "string" ? d.id : ""
      // With a format selected (non-flat), "url" is the stream URL and "webpage_url" the video page
      const rawUrl = typeof d.url === "string" ? d.url : ""
      const audioUrl = isGoogleVideoUrl(rawUrl) ? rawUrl : undefined
      const webpageUrl = typeof d.webpage_url === "string" ? d.webpage_url : ""
      const url = webpageUrl || (audioUrl ? "" : rawUrl) || (id ? `https://www.youtube.com/watch?v=${id}` : "")
      if (!id && !url) continue
      entries.push({
        id: id || undefined,
        title: typeof d.title === "string" && d.title ? d.title : "Unknown",
        url: url || undefined,
        duration: typeof d.duration === "number" && d.duration >= 0 ? d.duration : undefined,
        channel: typeof d.channel === "string" ? d.channel : typeof d.uploader === "string" ? d.uploader : undefined,
        track: typeof d.track === "string" ? d.track : undefined,
        artist: typeof d.artist === "string" ? d.artist : typeof d.album_artist === "string" ? d.album_artist : undefined,
        album: typeof d.album === "string" ? d.album : undefined,
        audioUrl,
      })
    } catch {
      // skip malformed line
    }
  }
  return entries
}

export type YtDlpSearchType = "video" | "playlist"

export async function searchYtDlp(
  query: string,
  limit: number,
  cookieStore: CookieStorePort,
  opts: { type?: YtDlpSearchType; flat?: boolean; timeoutMs?: number; format?: string } = {},
): Promise<YtDlpSearchEntry[]> {
  const { type = "video", format, timeoutMs = YTDL_SEARCH_TIMEOUT_MS } = opts
  // Selecting a format requires full extraction, which flat mode skips
  const flat = format ? false : opts.flat ?? true
  const q = query.trim()
  if (!q || limit <= 0) return []

  const extra: string[] = []
  if (flat) extra.push("--flat-playlist")
  if (format) extra.push("-f", format)
  if (type === "playlist") extra.push("--extractor-args", "youtube:search_type=playlist")

  const args = buildYtDlpArgs(["--dump-json"], cookieStore, extra)
  args.push(`ytsearch${limit}:${q}`)

  const result = await spawnYtDlp(args, timeoutMs)
  if (result.code !== 0 || !result.stdout.trim()) return []
  return parseYtDlpSearchOutput(result.stdout)
}

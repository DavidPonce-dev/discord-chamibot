import type { LoggerPort } from "../../domain/ports"
import { spawnYtDlp } from "./ytdlp"
import { YTDLP_UPDATE_INTERVAL_MS, YTDLP_UPDATE_TIMEOUT_MS } from "../../config/timeouts"

export type YtDlpUpdater = Readonly<{
  start: () => void
  stop: () => void
  updateNow: () => Promise<boolean>
}>

// YouTube changes regularly break older yt-dlp builds. The binary in the image is the one from
// build time, so it is updated in place on start and periodically instead of waiting for a deploy
export const createYtDlpUpdater = (logger: LoggerPort, intervalMs = YTDLP_UPDATE_INTERVAL_MS): YtDlpUpdater => {
  let timer: NodeJS.Timeout | null = null
  let inFlight: Promise<boolean> | null = null

  const runUpdate = async (): Promise<boolean> => {
    const result = await spawnYtDlp(["-U"], YTDLP_UPDATE_TIMEOUT_MS)
    if (result.code !== 0) {
      logger.warn("ytdlp", "No se pudo actualizar yt-dlp", { error: (result.stderr || result.stdout).trim().slice(0, 300) })
      return false
    }
    logger.info("ytdlp", "yt-dlp verificado/actualizado", { output: result.stdout.trim().split("\n").pop() })
    return true
  }

  const updateNow = (): Promise<boolean> => {
    if (inFlight) return inFlight
    inFlight = runUpdate().finally(() => { inFlight = null })
    return inFlight
  }

  const start = (): void => {
    if (timer) return
    // In the background: playback works with the current binary while the update runs
    void updateNow()
    timer = setInterval(() => { void updateNow() }, intervalMs)
    timer.unref()
  }

  const stop = (): void => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { start, stop, updateNow } as const
}

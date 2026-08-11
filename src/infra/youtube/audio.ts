import { spawn } from "child_process"
import fs from "fs"
import { createAudioResource, StreamType, type AudioResource } from "@discordjs/voice"
import type { AudioStreamPort, CookieStorePort, LoggerPort } from "../../domain/ports"
import type { CookieRefreshResult } from "../../domain/types"
import { isCookieError, withCookieRetry } from "../../domain/ports"
import { ok, err, type Result } from "../../shared/result"
import { buildYtDlpArgs, spawnYtDlp, USER_AGENT } from "./ytdlp"
import { formatTime } from "../../shared/format"

export const createYtDlpAudio = (
  cookieStore: CookieStorePort,
  logger: LoggerPort,
  refreshCookies?: () => Promise<CookieRefreshResult>,
): AudioStreamPort => {
  const ffmpegProcesses = new Map<string, ReturnType<typeof spawn>>()
  let cachedCookieHeader: string | null = null
  let cookieCacheDirty = true
  const streamFailedByGuild = new Map<string, boolean>()

  const consumeStreamFailure = (guildId: string): boolean => {
    const value = streamFailedByGuild.get(guildId) ?? false
    streamFailedByGuild.delete(guildId)
    return value
  }

  const getCookieHeader = (): string | null => {
    if (!cookieCacheDirty && cachedCookieHeader !== null) return cachedCookieHeader
    const cookieFile = cookieStore.filePath()
    if (!cookieFile) { cachedCookieHeader = null; cookieCacheDirty = false; return null }
    try {
      if (!fs.existsSync(cookieFile)) { cachedCookieHeader = null; cookieCacheDirty = false; return null }
      const content = fs.readFileSync(cookieFile, "utf-8")
      const cookies: string[] = []
      for (const line of content.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const parts = trimmed.split("\t")
        if (parts.length >= 7) {
          const name = parts[5]
          const value = parts[6]
          if (name) cookies.push(`${name}=${value ?? ""}`)
        }
      }
      cachedCookieHeader = cookies.length > 0 ? cookies.join("; ") : null
      cookieCacheDirty = false
      return cachedCookieHeader
    } catch {
      return null
    }
  }

  const invalidateCookieCache = (): void => {
    cookieCacheDirty = true
  }

  const getAudioUrl = async (url: string): Promise<Result<string, string>> => {
    const attempt = async (): Promise<Result<string, string>> => {
      const args = buildYtDlpArgs(["--get-url", "--format", "bestaudio"], cookieStore)
      args.push(url)

      const result = await spawnYtDlp(args)
      if (result.code !== 0 || !result.stdout.trim()) {
        const msg = result.stderr.slice(0, 200) || `code ${result.code}`
        return err(msg)
      }
      return ok(result.stdout.trim())
    }

    const refresh = async (): Promise<CookieRefreshResult> => {
      invalidateCookieCache()
      if (refreshCookies) return refreshCookies()
      return cookieStore.read()
        ? { success: true, timestamp: new Date().toISOString() }
        : { success: false, timestamp: new Date().toISOString() }
    }

    let lastError = ""
    for (let attemptCount = 1; attemptCount <= 3; attemptCount++) {
      const result = await withCookieRetry(attempt, refresh)
      if (result.ok) return result
      lastError = result.error
      if (attemptCount < 3) {
        logger.warn("audio", "getAudioUrl fallo, reintentando", {
          url: url.slice(0, 60),
          attempt: attemptCount,
          error: lastError.slice(0, 200),
        })
        await new Promise(resolve => setTimeout(resolve, 750 * attemptCount))
      }
    }
    return err(lastError)
  }

  const createFromAudioUrl = async (guildId: string, audioUrl: string, seekTo?: number): Promise<Result<AudioResource, string>> => {
    killProcess(guildId)
    streamFailedByGuild.delete(guildId)

    try {
      logger.debug("audio", "URL obtenida, iniciando FFmpeg stream", {
        host: new URL(audioUrl).hostname,
      })

      const ffmpegArgs = [
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
      ]

      const cookieHeader = getCookieHeader()
      const headerLines = [
        `User-Agent: ${USER_AGENT}`,
        "Referer: https://www.youtube.com/",
      ]
      if (cookieHeader) {
        logger.debug("audio", "Enviando cookies a FFmpeg", { cookieCount: cookieHeader.split("; ").length })
        headerLines.push(`Cookie: ${cookieHeader}`)
      }
      ffmpegArgs.push("-headers", `${headerLines.join("\r\n")}\r\n`)

      if (seekTo !== undefined) {
        ffmpegArgs.push("-ss", formatTime(seekTo, true))
      }

      ffmpegArgs.push(
        "-i", audioUrl,
        "-af", "volume=0.65",
        "-f", "opus",
        "-c:a", "libopus",
        "-b:a", "128k",
        "-application", "audio",
        "pipe:1",
      )

      const ffmpeg = spawn("ffmpeg", ffmpegArgs)
      ffmpegProcesses.set(guildId, ffmpeg)

      let bytesWritten = 0
      ffmpeg.stdout?.on("data", (data: Buffer) => {
        bytesWritten += data.length
      })

      let ffmpegStderr = ""
      ffmpeg.stderr?.on("data", (data: Buffer) => {
        ffmpegStderr += data.toString()
        if (!streamFailedByGuild.get(guildId) && isCookieError(ffmpegStderr)) {
          streamFailedByGuild.set(guildId, true)
          invalidateCookieCache()
        }
      })

      ffmpeg.on("error", (e: Error) =>
        logger.error("audio", "Error en FFmpeg", { error: e.message })
      )

      ffmpeg.on("close", (code: number | null) => {
        logger.debug("audio", "FFmpeg cerrado", {
          code,
          bytesWritten,
          stderr: ffmpegStderr.slice(0, 2000),
        })
        ffmpegProcesses.delete(guildId)
        if (code && code !== 0) {
          const stderr = ffmpegStderr.slice(0, 2000)
          if (isCookieError(stderr)) {
            logger.warn("audio", "FFmpeg fallo por posible error de cookies, refrescando para el siguiente track")
            streamFailedByGuild.set(guildId, true)
            invalidateCookieCache()
            refreshCookies?.().catch(() => {})
          }
          logger.error("audio", "FFmpeg termino con error", { code, stderr })
        }
      })

      logger.debug("audio", "Stream iniciado exitosamente (opus via FFmpeg)")
      return ok(createAudioResource(ffmpeg.stdout!, { inputType: StreamType.OggOpus }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error("audio", "Error al crear recurso de audio", {
        url: audioUrl.slice(0, 60),
        error: msg,
        seek: seekTo,
      })
      return err(msg)
    }
  }

  const createResource = async (guildId: string, url: string, seekTo?: number): Promise<Result<AudioResource, string>> => {
    logger.debug("audio", `Obteniendo URL de audio${seekTo !== undefined ? ` (seek: ${seekTo}s)` : ""}`, { url: url.slice(0, 60) })

    try {
      const audioUrlResult = await getAudioUrl(url)
      if (!audioUrlResult.ok) return err(audioUrlResult.error)
      return createFromAudioUrl(guildId, audioUrlResult.value, seekTo)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error("audio", "Error al crear recurso de audio", {
        url: url.slice(0, 60),
        error: msg,
        seek: seekTo,
      })
      return err(msg)
    }
  }

  const killProcess = (guildId: string): void => {
    const ffmpegProcess = ffmpegProcesses.get(guildId)
    if (ffmpegProcess && !ffmpegProcess.killed) {
      ffmpegProcess.kill("SIGKILL")
    }
    ffmpegProcesses.delete(guildId)
  }

  return { createResource, getAudioUrl, createFromAudioUrl, killProcess, consumeStreamFailure } as const
}

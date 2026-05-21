import { createAudioResource, AudioResource, StreamType } from "@discordjs/voice"
import { spawn } from "child_process"
import { logger } from "@/utils/logger"
import { getCookieFile } from "@/utils/cookies"
import { buildYtDlpArgs, spawnYtDlp, USER_AGENT } from "@/utils/ytdlp"
import { formatTimeFFmpeg } from "@/utils/format"
import { getErrorMessage } from "@/utils/error"
import { isCookieError, refreshCookies } from "@/utils/cookieRefresher"

const ERROR_MSG_MAX_LENGTH = 200
const LOG_ERROR_MAX_LENGTH = 150
const DIAGNOSTIC_OUTPUT_MAX_LENGTH = 1_000
const FFMPEG_STDERR_MAX_LENGTH = 500

interface YtDlpFormat {
  url?: string
  acodec?: string
  vcodec?: string
}

interface FormatStrategy {
  format: string
  label: string
}

const FORMAT_STRATEGIES: FormatStrategy[] = [
  { format: "bestaudio", label: "bestaudio" },
  { format: "worstaudio", label: "worstaudio" },
  { format: "", label: "default" },
  { format: "best", label: "best" },
]

export class AudioService {
  private activeFfmpeg: ReturnType<typeof spawn> | null = null

  killProcess() {
    if (this.activeFfmpeg && !this.activeFfmpeg.killed) {
      this.activeFfmpeg.kill("SIGKILL")
    }
    this.activeFfmpeg = null
  }

  private async tryGetUrlWithFormat(format: string, url: string): Promise<string> {
    const args = buildYtDlpArgs(["--get-url"], format ? ["--format", format] : [])
    args.push(url)

    const result = await spawnYtDlp(args)
    if (result.code !== 0 || !result.stdout.trim()) {
      throw new Error(result.stderr.slice(0, ERROR_MSG_MAX_LENGTH) || `code ${result.code}`)
    }
    return result.stdout.trim()
  }

  private async tryFormatStrategies(url: string): Promise<string | null> {
    for (const strategy of FORMAT_STRATEGIES) {
      try {
        logger.debug("audio", `Trying format strategy: ${strategy.label}`)
        const result = await this.tryGetUrlWithFormat(strategy.format, url)
        logger.debug("audio", `URL obtained with strategy: ${strategy.label}`)
        return result
      } catch (err) {
        logger.debug("audio", `Strategy ${strategy.label} failed`, {
          error: err instanceof Error ? err.message.slice(0, LOG_ERROR_MAX_LENGTH) : String(err),
        })
      }
    }
    return null
  }

  private async runListFormatsDiagnostic(url: string): Promise<void> {
    logger.warn("audio", "All format strategies failed, running --list-formats for diagnostics")
    const listArgs = ["--list-formats", "--js-runtimes", "deno", "--no-playlist", "--user-agent", USER_AGENT]
    const cookieFile = getCookieFile()
    if (cookieFile) listArgs.push("--cookies", cookieFile)
    listArgs.push(url)

    const listResult = await new Promise<string>((resolve, reject) => {
      const proc = spawn("yt-dlp", listArgs, { stdio: ["ignore", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      proc.stdout.on("data", (d) => (stdout += d))
      proc.stderr.on("data", (d) => (stderr += d))
      proc.on("close", (code) => {
        resolve(`stdout:\n${stdout}\nstderr:\n${stderr}`)
      })
      proc.on("error", reject)
    })

    logger.error("audio", "--list-formats diagnostic output", { output: listResult.slice(0, DIAGNOSTIC_OUTPUT_MAX_LENGTH) })
  }

  private findBestAudioUrl(formats: YtDlpFormat[]): string | undefined {
    // Prefer audio-only (no video), then audio-with-video, then any format with URL
    return formats.find((f) => f.url && f.acodec !== "none" && f.vcodec === "none")?.url
      || formats.find((f) => f.url && f.acodec !== "none")?.url
      || formats.find((f) => f.url)?.url
  }

  private async tryDumpJsonFallback(url: string): Promise<string> {
    logger.debug("audio", "Trying --dump-json fallback")
    const jsonArgs = buildYtDlpArgs(["--dump-json"])
    jsonArgs.push(url)

    const result = await spawnYtDlp(jsonArgs)
    if (result.code !== 0 || !result.stdout.trim()) {
      throw new Error(result.stderr.slice(0, ERROR_MSG_MAX_LENGTH) || `code ${result.code}`)
    }

    const data = JSON.parse(result.stdout)
    const audioUrl = this.findBestAudioUrl(data.formats ?? []) || data.url
    if (!audioUrl) {
      throw new Error("No audio URL found in formats")
    }
    return audioUrl
  }

  private async getAudioUrl(url: string, retries = 0): Promise<string> {
    const strategyResult = await this.tryFormatStrategies(url)
    if (strategyResult) return strategyResult

    await this.runListFormatsDiagnostic(url)

    try {
      return await this.tryDumpJsonFallback(url)
    } catch (err) {
      const msg = getErrorMessage(err)
      if (retries === 0 && isCookieError(msg)) {
        logger.warn("audio", "Posible error de cookies, intentando refrescar")
        const refreshed = await refreshCookies()
        if (refreshed.success) {
          logger.info("audio", "Cookies refrescadas, reintentando")
          return this.getAudioUrl(url, 1)
        }
      }
      throw err
    }
  }

  async createResource(url: string, seekTo?: number): Promise<AudioResource> {
    this.killProcess()

    const seekInfo = seekTo !== undefined ? ` (seek: ${seekTo}s)` : ""
    logger.debug("audio", `Obteniendo URL de audio${seekInfo}`, { url: url.slice(0, 60) })

    try {
      const audioUrl = await this.getAudioUrl(url)
      logger.debug("audio", "URL obtenida, iniciando FFmpeg stream", {
        host: new URL(audioUrl).hostname,
      })

      const ffmpegArgs = [
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
      ]

      if (seekTo !== undefined) {
        ffmpegArgs.push("-ss", formatTimeFFmpeg(seekTo))
      }

      ffmpegArgs.push(
        "-i", audioUrl,
        "-f", "opus",
        "-c:a", "libopus",
        "-b:a", "128k",
        "-application", "audio",
        "pipe:1",
      )

      const ffmpeg = spawn("ffmpeg", ffmpegArgs)
      this.activeFfmpeg = ffmpeg

      let bytesWritten = 0
      ffmpeg.stdout?.on("data", (data) => {
        bytesWritten += data.length
      })

      let ffmpegStderr = ""
      ffmpeg.stderr?.on("data", (data) => {
        ffmpegStderr += data.toString()
      })

      ffmpeg.on("error", (err) =>
        logger.error("audio", "Error en FFmpeg", { error: err.message })
      )

      ffmpeg.on("close", (code) => {
        logger.debug("audio", "FFmpeg cerrado", {
          code,
          bytesWritten,
          stderr: ffmpegStderr.slice(0, FFMPEG_STDERR_MAX_LENGTH),
        })
        if (code && code !== 0) {
          logger.error("audio", "FFmpeg terminó con error", {
            code,
            stderr: ffmpegStderr.slice(0, FFMPEG_STDERR_MAX_LENGTH),
          })
        }
      })

      logger.debug("audio", "Stream iniciado exitosamente (opus via FFmpeg)")
      return createAudioResource(ffmpeg.stdout!, { inputType: StreamType.OggOpus })
    } catch (err) {
      logger.error("audio", "Error al crear recurso de audio", {
        url: url.slice(0, 60),
        error: getErrorMessage(err),
        seek: seekTo,
      })
      throw err
    }
  }
}

import { createAudioResource, AudioResource, StreamType } from "@discordjs/voice"
import { spawn } from "child_process"
import { logger } from "@/utils/logger"
import { getCookieFile, isCookieError, refreshCookies } from "@/cookies/CookieManager"
import { buildYtDlpArgs, spawnYtDlp } from "@/utils/ytdlp"
import { formatTime } from "@/utils/format"
import { getErrorMessage } from "@/utils/error"

export class AudioService {
  private activeFfmpeg: ReturnType<typeof spawn> | null = null

  killProcess() {
    if (this.activeFfmpeg && !this.activeFfmpeg.killed) {
      this.activeFfmpeg.kill("SIGKILL")
    }
    this.activeFfmpeg = null
  }

  private async getAudioUrl(url: string, retries = 0): Promise<string> {
    const args = buildYtDlpArgs(["--get-url", "--format", "bestaudio"])
    args.push(url)

    const result = await spawnYtDlp(args)
    if (result.code !== 0 || !result.stdout.trim()) {
      const msg = result.stderr.slice(0, 200) || `code ${result.code}`
      if (retries === 0 && isCookieError(msg)) {
        logger.warn("audio", "Posible error de cookies, intentando refrescar")
        const refreshed = await refreshCookies()
        if (refreshed.success) {
          logger.info("audio", "Cookies refrescadas, reintentando")
          return this.getAudioUrl(url, 1)
        }
      }
      throw new Error(msg)
    }
    return result.stdout.trim()
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
          stderr: ffmpegStderr.slice(0, 500),
        })
        if (code && code !== 0) {
          logger.error("audio", "FFmpeg terminó con error", {
            code,
            stderr: ffmpegStderr.slice(0, 500),
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

import { createAudioResource, AudioResource, StreamType } from "@discordjs/voice"
import play from "play-dl"
import { spawn } from "child_process"
import { logger } from "../utils/logger"

export class AudioService {
  private activeFfmpeg: ReturnType<typeof spawn> | null = null

  killProcess() {
    if (this.activeFfmpeg && !this.activeFfmpeg.killed) {
      this.activeFfmpeg.kill("SIGKILL")
    }
    this.activeFfmpeg = null
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  private async getAudioUrl(url: string, seekTo?: number): Promise<string> {
    const info = await play.video_info(url)
    logger.debug("audio", "video_info obtenido", {
      title: info.video_details.title,
      formats: info.format.length,
    })

    // Prefer opus/webm audio, fallback to any format with URL
    const audioFmt = info.format.find(
      (f) => f.url && f.mimeType?.includes("audio/webm")
    ) || info.format.find(
      (f) => f.url && f.mimeType?.includes("audio/")
    ) || info.format.find(
      (f) => f.url
    )

    if (!audioFmt?.url) {
      throw new Error("No se encontró URL de audio en los formatos")
    }

    return audioFmt.url
  }

  async createResource(url: string, seekTo?: number): Promise<AudioResource> {
    this.killProcess()

    const seekInfo = seekTo !== undefined ? ` (seek: ${seekTo}s)` : ""
    logger.debug("audio", `Obteniendo URL de audio${seekInfo}`, { url: url.slice(0, 60) })

    try {
      const audioUrl = await this.getAudioUrl(url, seekTo)
      logger.debug("audio", "URL obtenida, iniciando FFmpeg stream", {
        host: new URL(audioUrl).hostname,
      })

      const ffmpegArgs = [
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
      ]

      if (seekTo !== undefined) {
        ffmpegArgs.push("-ss", this.formatTime(seekTo))
      }

      ffmpegArgs.push(
        "-i", audioUrl,
        "-f", "opus",
        "-c:a", "libopus",
        "-b:a", "128k",
        "-application", "audio",
        "-v", "quiet",
        "pipe:1",
      )

      const ffmpeg = spawn("ffmpeg", ffmpegArgs)
      this.activeFfmpeg = ffmpeg

      ffmpeg.on("error", (err) =>
        logger.error("audio", "Error en FFmpeg", { error: err.message })
      )
      ffmpeg.stderr?.on("data", (data) => {
        const msg = data.toString()
        if (msg.toLowerCase().includes("error")) {
          logger.error("audio", "FFmpeg stderr", { msg: msg.slice(0, 200) })
        }
      })
      ffmpeg.on("close", (code) => {
        if (code && code !== 0) {
          logger.error("audio", "FFmpeg terminó con error", { code })
        }
      })

      logger.debug("audio", "Stream iniciado exitosamente (opus via FFmpeg)")
      return createAudioResource(ffmpeg.stdout!, { inputType: StreamType.Opus })
    } catch (err) {
      logger.error("audio", "Error al crear recurso de audio", {
        url: url.slice(0, 60),
        error: err instanceof Error ? err.message : String(err),
        seek: seekTo,
      })
      throw err
    }
  }
}

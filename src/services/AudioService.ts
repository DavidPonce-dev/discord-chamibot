import { demuxProbe, createAudioResource, AudioResource } from "@discordjs/voice"
import youtubedl from "youtube-dl-exec"
import { logger } from "../utils/logger"

export class AudioService {
  private activeProcess: ReturnType<typeof youtubedl.exec> | null = null

  killProcess() {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill()
    }
    this.activeProcess = null
  }

  private buildOpts(seekTo?: number) {
    const opts: Record<string, string | boolean> = {
      format: "bestaudio",
      output: "-",
      quiet: true,
      noWarnings: true,
      forceOverwrites: true,
    }
    if (seekTo !== undefined) {
      opts.downloadSections = `*${this.formatTime(seekTo)}-*`
    }
    return opts
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  async createResource(url: string, seekTo?: number): Promise<AudioResource> {
    this.killProcess()

    const seekInfo = seekTo !== undefined ? ` (seek: ${seekTo}s)` : ""
    logger.debug("audio", `Iniciando stream yt-dlp${seekInfo}`, { url: url.slice(0, 60) })

    try {
      const subprocess = youtubedl.exec(url, this.buildOpts(seekTo), {
        stdio: ["ignore", "pipe", "ignore"],
      })

      this.activeProcess = subprocess
      subprocess.catch(() => {})
      const stream = subprocess.stdout!

      subprocess.on("error", (err) =>
        logger.error("audio", "Error en proceso yt-dlp", { error: err.message })
      )
      stream.on("error", () => {})
      subprocess.on("close", (code) => {
        if (code && code !== 0) {
          logger.error("audio", "yt-dlp terminó con error", { code })
        }
      })

      const probe = await demuxProbe(stream)
      logger.debug("audio", "Stream iniciado exitosamente", { type: probe.type })
      return createAudioResource(probe.stream, { inputType: probe.type })
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

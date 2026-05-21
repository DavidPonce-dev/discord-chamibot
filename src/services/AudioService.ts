import { createAudioResource, AudioResource, StreamType } from "@discordjs/voice"
import { spawn } from "child_process"
import { logger } from "../utils/logger"
import { getCookieFile } from "../utils/cookies"
import { buildYtDlpArgs, spawnYtDlp, USER_AGENT } from "../utils/ytDlp"
import { formatTimeFFmpeg } from "../utils/format"

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
      throw new Error(result.stderr.slice(0, 200) || `code ${result.code}`)
    }
    return result.stdout.trim()
  }

  private async getAudioUrl(url: string): Promise<string> {
    const strategies = [
      { format: "bestaudio", label: "bestaudio" },
      { format: "worstaudio", label: "worstaudio" },
      { format: "", label: "default" },
      { format: "best", label: "best" },
    ]

    for (const strategy of strategies) {
      try {
        logger.debug("audio", `Trying format strategy: ${strategy.label}`)
        const result = await this.tryGetUrlWithFormat(strategy.format, url)
        logger.debug("audio", `URL obtained with strategy: ${strategy.label}`)
        return result
      } catch (err) {
        logger.debug("audio", `Strategy ${strategy.label} failed`, {
          error: err instanceof Error ? err.message.slice(0, 150) : String(err),
        })
      }
    }

    // All strategies failed - diagnostic: list available formats
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

    logger.error("audio", "--list-formats diagnostic output", { output: listResult.slice(0, 1000) })

    // Try --dump-json fallback anyway
    logger.debug("audio", "Trying --dump-json fallback")
    const jsonArgs = buildYtDlpArgs(["--dump-json"])
    jsonArgs.push(url)

    return new Promise((resolve, reject) => {
      const proc = spawn("yt-dlp", jsonArgs, { stdio: ["ignore", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""

      proc.stdout.on("data", (d) => (stdout += d))
      proc.stderr.on("data", (d) => (stderr += d))

      proc.on("close", (code) => {
        if (code !== 0 || !stdout.trim()) {
          reject(new Error(stderr.slice(0, 200) || `code ${code}`))
          return
        }

        try {
          const data = JSON.parse(stdout)
          const audioFmt = data.formats?.find(
            (f: any) => f.url && f.acodec !== "none" && f.vcodec === "none"
          ) || data.formats?.find(
            (f: any) => f.url && f.acodec !== "none"
          ) || data.formats?.find(
            (f: any) => f.url
          ) || data.url

          if (audioFmt?.url || typeof audioFmt === "string") {
            resolve(typeof audioFmt === "string" ? audioFmt : audioFmt.url)
          } else {
            reject(new Error("No audio URL found in formats"))
          }
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })

      proc.on("error", reject)
    })
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
        error: err instanceof Error ? err.message : String(err),
        seek: seekTo,
      })
      throw err
    }
  }
}

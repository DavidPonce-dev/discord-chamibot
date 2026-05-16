import {
  demuxProbe,
  createAudioResource,
  AudioResource,
} from "@discordjs/voice"
import youtubedl from "youtube-dl-exec"
import { formatTime } from "../utils/format"

export class AudioService {
  private activeProcess?: ReturnType<typeof youtubedl.exec>

  killProcess() {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill()
    }
    this.activeProcess = undefined
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
      opts.downloadSections = `*${formatTime(seekTo)}-*`
    }
    return opts
  }

  async createResource(url: string, seekTo?: number): Promise<AudioResource> {
    this.killProcess()

    const subprocess = youtubedl.exec(url, this.buildOpts(seekTo), {
      stdio: ["ignore", "pipe", "ignore"],
    })

    this.activeProcess = subprocess
    subprocess.catch(() => {})
    const stream = subprocess.stdout!

    subprocess.on("error", (err) => console.error("[yt-dlp] Error:", err))
    stream.on("error", () => {})
    subprocess.on("close", (code) => {
      if (code && code !== 0) console.error(`[yt-dlp] Salió con código ${code}`)
    })

    const probe = await demuxProbe(stream)
    return createAudioResource(probe.stream, { inputType: probe.type })
  }
}

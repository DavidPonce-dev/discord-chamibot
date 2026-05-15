import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
  demuxProbe,
  entersState,
  StreamType,
  VoiceConnectionStatus,
} from "@discordjs/voice"
import youtubedl from "youtube-dl-exec"
import play from "play-dl"
import { Track } from "./Track"

export class MusicQueue {
  private queue: Track[] = []
  private current: Track | null = null
  private lastTrackTitle: string | null = null
  private player: AudioPlayer
  private connection: VoiceConnection
  private isPlaying = false
  private autoplay: boolean
  private activeProcess?: import("child_process").ChildProcess

  constructor(connection: VoiceConnection, autoplay = false) {
    this.connection = connection
    this.autoplay = autoplay
    this.player = createAudioPlayer()
    this.connection.subscribe(this.player)
    this.registerEvents()
  }

  private registerEvents() {
    this.player.on(AudioPlayerStatus.Idle, async () => {
      this.isPlaying = false
      this.current = null
      await this.processQueue()
    })

    this.player.on("error", async (error) => {
      console.error("Player Error:", error)
      this.isPlaying = false
      this.current = null
      await this.processQueue()
    })

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ])
      } catch {
        this.destroy()
      }
    })
  }

  async add(track: Track) {
    this.queue.push(track)
    if (!this.isPlaying) {
      await this.processQueue()
    }
  }

  private async processQueue() {
    if (this.isPlaying) return

    const nextTrack = this.queue.shift()

    if (!nextTrack) {
      if (this.autoplay && this.lastTrackTitle) {
        await this.autoplaySearch()
      }
      return
    }

    this.isPlaying = true
    this.current = nextTrack
    this.lastTrackTitle = nextTrack.title

    try {
      if (!nextTrack.url) {
        console.error("Track sin URL, saltando")
        this.isPlaying = false
        this.current = null
        return
      }

      const subprocess = youtubedl.exec(nextTrack.url, {
        format: "bestaudio",
        output: "-",
        quiet: true,
        noWarnings: true,
      }, { stdio: ["ignore", "pipe", "ignore"] })

      this.activeProcess = subprocess
      const stream = subprocess.stdout!

      subprocess.on("error", async (err) => {
        console.error("yt-dlp error:", err.message)
        this.isPlaying = false
        this.current = null
        if (this.player) this.player.stop()
        await this.processQueue()
      })

      const probe = await demuxProbe(stream)

      const resource: AudioResource = createAudioResource(probe.stream, {
        inputType: probe.type,
      })
      this.player.play(resource)
    } catch (error) {
      console.error("Track Error:", error)
      this.isPlaying = false
      this.current = null
      await this.processQueue()
    }
  }

  private async autoplaySearch() {
    try {
      const results = await play.search(`${this.lastTrackTitle} music`, { limit: 1 })
      if (!results.length) return

      const video = results[0]
      this.queue.push({
        title: video.title ?? "Unknown",
        url: video.url ?? `https://youtube.com/watch?v=${video.id}`,
        requestedBy: "Autoplay",
        duration: video.durationRaw,
      })
      await this.processQueue()
    } catch (error) {
      console.error("Autoplay Error:", error)
    }
  }

  skip() {
    this.player.stop()
  }

  pause() {
    this.player.pause()
  }

  resume() {
    this.player.unpause()
  }

  stop() {
    this.queue = []
    this.player.stop()
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill()
    }
    this.activeProcess = undefined
  }

  destroy() {
    this.stop()
    this.connection.destroy()
  }

  toggleAutoplay(): boolean {
    this.autoplay = !this.autoplay
    return this.autoplay
  }

  getQueue(): Track[] {
    return [...this.queue]
  }

  getCurrentTrack(): Track | null {
    return this.current
  }

  isPaused(): boolean {
    return this.player.state.status === AudioPlayerStatus.Paused
  }

  isAutoplayEnabled(): boolean {
    return this.autoplay
  }

  getSize(): number {
    return this.queue.length
  }
}

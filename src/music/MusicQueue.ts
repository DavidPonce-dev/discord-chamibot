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

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

export class MusicQueue {
  private queue: Track[] = []
  private current: Track | null = null
  private lastTrackTitle: string | null = null
  private player: AudioPlayer
  private connection: VoiceConnection
  private isPlaying = false
  private autoplay: boolean
  private activeProcess?: import("child_process").ChildProcess
  private loopMode: "none" | "one" | "all" = "none"
  private playbackStart: number | null = null
  private seeking = false
  private autoplayFails = 0
  onTrackChange?: (guildId: string) => void | Promise<void>
  onDisconnect?: (guildId: string) => void | Promise<void>

  constructor(connection: VoiceConnection, autoplay = false) {
    this.connection = connection
    this.autoplay = autoplay
    this.player = createAudioPlayer()
    this.connection.subscribe(this.player)
    this.registerEvents()
  }

  private registerEvents() {
    this.player.on(AudioPlayerStatus.Idle, async () => {
      if (this.seeking) return
      try {
        const finished = this.current
        if (this.loopMode === "one" && finished) {
          this.queue.unshift({ ...finished })
        } else if (this.loopMode === "all" && finished) {
          this.queue.push({ ...finished })
        }
        this.isPlaying = false
        this.current = null
        this.playbackStart = null
        await this.processQueue()
        await this.onTrackChange?.(this.connection.joinConfig.guildId)
      } catch (error) {
        console.error("Error en Idle handler")
      }
    })

    this.player.on("error", async (error) => {
      try {
        console.error("Error del AudioPlayer")
        this.isPlaying = false
        this.current = null
        this.playbackStart = null
        await this.processQueue()
        await this.onTrackChange?.(this.connection.joinConfig.guildId)
      } catch (error) {
        console.error("Error en Player handler")
      }
    })

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ])
      } catch {
        const guildId = this.connection.joinConfig.guildId
        this.destroy()
        await this.onDisconnect?.(guildId)
      }
    })
  }

  async add(track: Track) {
    this.queue.push(track)
    if (!this.isPlaying) {
      await this.processQueue()
    }
  }

  async addMultiple(tracks: Track[]) {
    this.queue.push(...tracks)
    if (!this.isPlaying) {
      await this.processQueue()
    }
  }

  addNext(track: Track) {
    this.queue.unshift(track)
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
        await this.processQueue()
        return
      }

      const subprocess = youtubedl.exec(nextTrack.url, {
        format: "bestaudio",
        output: "-",
        quiet: true,
        noWarnings: true,
        forceOverwrites: true,
      }, { stdio: ["ignore", "pipe", "ignore"] })

      this.activeProcess = subprocess
      const stream = subprocess.stdout!

      subprocess.on("error", () => console.error("Error en descarga"))

      const probe = await demuxProbe(stream)

      const resource: AudioResource = createAudioResource(probe.stream, {
        inputType: probe.type,
      })
      this.playbackStart = Date.now()
      this.player.play(resource)
    } catch (error) {
      console.error("Error al reproducir track")
      this.isPlaying = false
      this.current = null
      this.playbackStart = null
      await this.processQueue()
    }
  }

  getPosition(): number {
    if (!this.playbackStart) return 0
    return Math.floor((Date.now() - this.playbackStart) / 1000)
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]]
    }
  }

  remove(index: number): Track | null {
    if (index < 0 || index >= this.queue.length) return null
    return this.queue.splice(index, 1)[0] ?? null
  }

  moveUp(index: number): boolean {
    if (index <= 0 || index >= this.queue.length) return false
    const temp = this.queue[index]
    this.queue[index] = this.queue[index - 1]
    this.queue[index - 1] = temp
    return true
  }

  moveDown(index: number): boolean {
    if (index < 0 || index >= this.queue.length - 1) return false
    const temp = this.queue[index]
    this.queue[index] = this.queue[index + 1]
    this.queue[index + 1] = temp
    return true
  }

  toggleLoop(): "none" | "one" | "all" {
    if (this.loopMode === "none") this.loopMode = "one"
    else if (this.loopMode === "one") this.loopMode = "all"
    else this.loopMode = "none"
    return this.loopMode
  }

  getLoopMode(): "none" | "one" | "all" {
    return this.loopMode
  }

  async seek(time: number) {
    if (!this.current || !this.current.url) return

    this.seeking = true

    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill()
    }
    this.activeProcess = undefined
    this.player.stop()

    await new Promise((resolve) => setTimeout(resolve, 100))

    this.isPlaying = true

    try {
      const startTime = formatTime(time)
      const subprocess = youtubedl.exec(this.current.url, {
        format: "bestaudio",
        output: "-",
        quiet: true,
        noWarnings: true,
        forceOverwrites: true,
        downloadSections: `*${startTime}-*`,
      }, { stdio: ["ignore", "pipe", "ignore"] })

      this.activeProcess = subprocess
      const stream = subprocess.stdout!

      subprocess.on("error", () => console.error("Error en descarga"))

      const probe = await demuxProbe(stream)

      const resource: AudioResource = createAudioResource(probe.stream, {
        inputType: probe.type,
      })
      this.playbackStart = Date.now()
      this.player.play(resource)
    } catch (error) {
      console.error("Error al buscar")
      this.isPlaying = false
      this.current = null
      this.playbackStart = null
      await this.processQueue()
    } finally {
      this.seeking = false
    }
  }

  private async autoplaySearch() {
    try {
      const results = await play.search(`${this.lastTrackTitle} music`, { limit: 1 })
      if (!results.length) return

      this.autoplayFails = 0
      const video = results[0]
      const id = video.id
      this.queue.push({
        title: video.title ?? "Unknown",
        url: video.url ?? `https://youtube.com/watch?v=${video.id}`,
        requestedBy: "Autoplay",
        duration: video.durationRaw,
        id,
        thumbnail: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
      })
      await this.processQueue()
    } catch (error) {
      console.error("Error en autoplay")
      this.autoplayFails++
      if (this.autoplayFails >= 3) {
        this.autoplay = false
        this.autoplayFails = 0
        console.error("Autoplay desactivado por fallos consecutivos")
      }
    }
  }

  clear() {
    this.queue = []
  }

  skip() {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill()
    }
    this.activeProcess = undefined
    this.player.stop()
  }

  pause() {
    this.player.pause()
  }

  resume() {
    this.player.unpause()
  }

  isPaused(): boolean {
    return this.player.state.status === AudioPlayerStatus.Paused
  }

  togglePause() {
    if (this.isPaused()) {
      this.resume()
    } else {
      this.pause()
    }
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

  isAutoplayEnabled(): boolean {
    return this.autoplay
  }

  getSize(): number {
    return this.queue.length
  }
}

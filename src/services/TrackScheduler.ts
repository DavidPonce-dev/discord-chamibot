import {
  AudioPlayer,
  AudioPlayerStatus,
  VoiceConnection,
  createAudioPlayer,
  entersState,
  VoiceConnectionStatus,
} from "@discordjs/voice"
import { Track, LoopMode } from "../core/types"
import { AudioService } from "./AudioService"
import { RadioService } from "./RadioService"
import { normalizeTitle, extractArtist } from "../radio/YouTubeRecommender"

export class TrackScheduler {
  private queue: Track[] = []
  private current: Track | null = null
  private lastTrackTitle: string | null = null
  private player: AudioPlayer
  private connection: VoiceConnection
  private isPlaying = false
  private autoplay: boolean
  private loopMode: LoopMode = "none"
  private playbackStart: number | null = null
  private pauseOffset = 0
  private pauseTime: number | null = null
  private seeking = false
  private trackHistory: string[] = []
  private sameArtistStreak = 0
  private currentArtist: string | null = null
  private readonly ARTIST_ROTATION_LIMIT = 3
  private artistHistory: string[] = []

  private readonly MAX_HISTORY = 20
  private readonly MAX_ARTIST_HISTORY = 10

  private audio: AudioService
  private radioService: RadioService

  onTrackChange?: (guildId: string) => void
  onDisconnect?: (guildId: string) => void

  constructor(connection: VoiceConnection, autoplay = false) {
    this.connection = connection
    this.autoplay = autoplay
    this.player = createAudioPlayer()
    this.connection.subscribe(this.player)
    this.audio = new AudioService()
    this.radioService = new RadioService()
    this.registerEvents()
  }

  private registerEvents() {
    this.player.on(AudioPlayerStatus.Idle, async () => {
      if (this.seeking) return
      try {
        const finished = this.current
        const willAutoplay = this.autoplay && !!finished && this.queue.length === 0

        if (finished?.title) {
          const norm = normalizeTitle(finished.title)
          this.trackHistory.unshift(norm)
          if (this.trackHistory.length > this.MAX_HISTORY) this.trackHistory.pop()

          const artist = extractArtist(finished.title)
          if (artist && artist === this.currentArtist) {
            this.sameArtistStreak++
          } else if (artist) {
            this.sameArtistStreak = 1
            this.currentArtist = artist
            this.artistHistory.unshift(artist)
            if (this.artistHistory.length > this.MAX_ARTIST_HISTORY) this.artistHistory.pop()
          }
        }

        if (!willAutoplay) {
          if (this.loopMode === "one" && finished) {
            this.queue.unshift({ ...finished })
          } else if (this.loopMode === "all" && finished) {
            this.queue.push({ ...finished })
          }
        }

        if (willAutoplay) {
          const shouldSwitch = this.sameArtistStreak >= this.ARTIST_ROTATION_LIMIT
          const next = await this.radioService.findRelated(
            finished,
            this.lastTrackTitle,
            new Set(this.trackHistory),
            this.currentArtist,
            shouldSwitch,
          )
          if (next) {
            this.queue.unshift(next as Track)
          }
        }

        this.audio.killProcess()
        this.isPlaying = false
        this.current = null
        this.playbackStart = null
        this.pauseOffset = 0
        this.pauseTime = null
        await this.processQueue()
        await this.onTrackChange?.(this.connection.joinConfig.guildId)
      } catch (error) {
        console.error("[Idle] Error:", error)
      }
    })

    this.player.on("error", async () => {
      try {
        console.error("Error del AudioPlayer")
        this.isPlaying = false
        this.current = null
        this.playbackStart = null
        this.pauseOffset = 0
        this.pauseTime = null
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

  private resetPlaybackState() {
    this.playbackStart = null
    this.pauseOffset = 0
    this.pauseTime = null
  }

  private async processQueue() {
    if (this.isPlaying) return

    const nextTrack = this.queue.shift()
    if (!nextTrack) return

    this.isPlaying = true
    this.current = nextTrack
    this.lastTrackTitle = nextTrack.title

    try {
      if (!nextTrack.url) {
        this.isPlaying = false
        this.current = null
        await this.processQueue()
        return
      }

      this.audio.killProcess()
      const resource = await this.audio.createResource(nextTrack.url)

      this.playbackStart = Date.now()
      this.pauseOffset = 0
      this.pauseTime = null
      this.player.play(resource)
    } catch (error) {
      console.error("Error al reproducir track")
      this.isPlaying = false
      this.current = null
      this.resetPlaybackState()
      await this.processQueue()
    }
  }

  getPosition(): number {
    if (!this.playbackStart) return 0
    let elapsed = Date.now() - this.playbackStart - this.pauseOffset
    if (this.pauseTime !== null) {
      elapsed -= Date.now() - this.pauseTime
    }
    return Math.floor(elapsed / 1000)
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

  toggleLoop(): LoopMode {
    if (this.loopMode === "none") this.loopMode = "one"
    else if (this.loopMode === "one") this.loopMode = "all"
    else this.loopMode = "none"
    return this.loopMode
  }

  getLoopMode(): LoopMode {
    return this.loopMode
  }

  async seek(time: number) {
    if (!this.current || !this.current.url) return

    this.seeking = true
    this.audio.killProcess()
    this.player.stop()
    await new Promise((resolve) => setTimeout(resolve, 100))
    this.isPlaying = true

    try {
      const resource = await this.audio.createResource(this.current.url, time)
      this.playbackStart = Date.now()
      this.pauseOffset = 0
      this.pauseTime = null
      this.player.play(resource)
    } catch (error) {
      console.error("Error al buscar (seek)")
      this.isPlaying = false
      this.current = null
      this.resetPlaybackState()
      await this.processQueue()
    } finally {
      this.seeking = false
    }
  }

  clear() {
    this.queue = []
  }

  skip() {
    this.audio.killProcess()
    this.player.stop()
  }

  pause() {
    this.player.pause()
    this.pauseTime = Date.now()
  }

  resume() {
    this.player.unpause()
    if (this.pauseTime !== null) {
      this.pauseOffset += Date.now() - this.pauseTime
      this.pauseTime = null
    }
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
    this.audio.killProcess()
    this.player.stop()
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

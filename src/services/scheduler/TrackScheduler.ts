import {
  AudioPlayer,
  AudioPlayerStatus,
  VoiceConnection,
  createAudioPlayer,
  entersState,
  VoiceConnectionStatus,
} from "@discordjs/voice"
import { Track, LoopMode } from "@/core/types"
import { AudioService } from "@/services/audio/AudioService"
import { findRelated, normalizeTitle, extractArtist } from "@/radio/YouTubeRecommender"
import { logger } from "@/utils/logger"
import { getErrorMessage } from "@/utils/error"

import { VOICE_RECONNECT_TIMEOUT_MS, SEEK_SETTLE_DELAY_MS } from "@/config/timeouts"
const MS_PER_SECOND = 1_000

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
  private destroyed = false

  private audio: AudioService

  onTrackChange?: (guildId: string) => void
  onDisconnect?: (guildId: string) => void

  constructor(connection: VoiceConnection, autoplay = false) {
    this.connection = connection
    this.autoplay = autoplay
    this.player = createAudioPlayer()
    this.connection.subscribe(this.player)
    this.audio = new AudioService()
    this.registerEvents()
    logger.info("scheduler", "Scheduler creado", {
      guildId: connection.joinConfig.guildId,
      autoplay,
    })
  }

  private registerEvents() {
    this.player.on(AudioPlayerStatus.Idle, async () => {
      if (this.seeking || this.destroyed) return
      try {
        const finished = this.current
        const willAutoplay = this.autoplay && !!finished && this.queue.length === 0

        if (finished?.title) {
          this.handleTrackFinished(finished, willAutoplay)
        }

        if (!willAutoplay) {
          this.applyLoopMode(finished)
        }

        if (willAutoplay) {
          await this.handleAutoplay(finished)
        }

        this.resetPlaybackState()
        await this.processQueue()
        await this.onTrackChange?.(this.connection.joinConfig.guildId)
      } catch (error) {
        logger.error("scheduler", "Error en Idle handler", {
          error: getErrorMessage(error),
        })
      }
    })

    this.player.on("error", async (err) => {
      if (this.destroyed) return
      try {
        logger.error("scheduler", "Error del AudioPlayer", {
          error: getErrorMessage(err),
          guildId: this.connection.joinConfig.guildId,
        })
        await this.processQueue()
        await this.onTrackChange?.(this.connection.joinConfig.guildId)
        this.resetPlaybackState()
      } catch (error) {
        logger.error("scheduler", "Error en Player handler", {
          error: getErrorMessage(error),
        })
      }
    })

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      await this.handleVoiceDisconnect()
    })

    this.connection.on(VoiceConnectionStatus.Destroyed, async () => {
      await this.handleVoiceDestroyed()
    })
  }

  private handleTrackFinished(finished: Track, willAutoplay: boolean) {
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

    logger.event("scheduler", "Track finalizado", {
      title: finished.title,
      guildId: this.connection.joinConfig.guildId,
      willAutoplay,
      queueSize: this.queue.length,
    })
  }

  private applyLoopMode(finished: Track | null) {
    if (!finished) return
    if (this.loopMode === "one") {
      this.queue.unshift({ ...finished })
      logger.debug("scheduler", "Loop one: reencolando track", { title: finished.title })
    } else if (this.loopMode === "all") {
      this.queue.push({ ...finished })
      logger.debug("scheduler", "Loop all: reencolando track al final", { title: finished.title })
    }
  }

  private async handleAutoplay(finished: Track | null) {
    if (!finished) return
    const shouldSwitch = this.sameArtistStreak >= this.ARTIST_ROTATION_LIMIT
    logger.debug("radio", "Buscando track relacionado", {
      currentTrack: finished.title,
      lastTitle: this.lastTrackTitle,
      shouldSwitch,
      excludeCount: this.trackHistory.length,
    })
    const next = await findRelated(
      finished,
      this.lastTrackTitle,
      new Set(this.trackHistory),
      this.currentArtist,
      shouldSwitch,
    )
    if (next) {
      this.queue.unshift(next as Track)
      logger.info("radio", "Track relacionado encontrado", {
        title: next.title,
        id: next.id,
      })
    } else {
      logger.warn("radio", "No se encontró track relacionado")
    }
  }

  private async handleVoiceDisconnect() {
    if (this.destroyed) return
    logger.event("scheduler", "Conexión de voz desconectada", {
      guildId: this.connection.joinConfig.guildId,
    })
    try {
      await Promise.race([
        entersState(this.connection, VoiceConnectionStatus.Signalling, VOICE_RECONNECT_TIMEOUT_MS),
        entersState(this.connection, VoiceConnectionStatus.Connecting, VOICE_RECONNECT_TIMEOUT_MS),
      ])
      logger.info("scheduler", "Conexión de voz reconectada", {
        guildId: this.connection.joinConfig.guildId,
      })
    } catch {
      const guildId = this.connection.joinConfig.guildId
      logger.warn("scheduler", "Conexión de voz perdida, destruyendo scheduler", { guildId })
      this.destroy()
      await this.onDisconnect?.(guildId)
    }
  }

  private async handleVoiceDestroyed() {
    if (this.destroyed) return
    const guildId = this.connection.joinConfig.guildId
    logger.event("scheduler", "Canal de voz destruido, limpiando", { guildId })
    this.audio.killProcess()
    this.player.stop()
    this.destroy()
    await this.onDisconnect?.(guildId)
  }

  private resetPlaybackState() {
    this.isPlaying = false
    this.current = null
    this.playbackStart = null
    this.pauseOffset = 0
    this.pauseTime = null
  }

  async add(track: Track) {
    this.queue.push(track)
    logger.event("scheduler", "Track añadido a cola", {
      title: track.title,
      guildId: this.connection.joinConfig.guildId,
      queueSize: this.queue.length,
      wasPlaying: this.isPlaying,
    })
    if (!this.isPlaying) {
      await this.processQueue()
    }
  }

  async addMultiple(tracks: Track[]) {
    this.queue.push(...tracks)
    logger.event("scheduler", "Múltiples tracks añadidos", {
      count: tracks.length,
      guildId: this.connection.joinConfig.guildId,
      queueSize: this.queue.length,
    })
    if (!this.isPlaying) {
      await this.processQueue()
    }
  }

  addNext(track: Track) {
    this.queue.unshift(track)
    logger.event("scheduler", "Track añadido al frente", {
      title: track.title,
      guildId: this.connection.joinConfig.guildId,
    })
  }

  private processingQueue = false
  private queuePending = false

  private async processQueue() {
    if (this.processingQueue) {
      this.queuePending = true
      return
    }

    this.processingQueue = true
    try {
      await this._processQueueLoop()
      while (this.queuePending) {
        this.queuePending = false
        await this._processQueueLoop()
      }
    } finally {
      this.processingQueue = false
    }
  }

  private async _processQueueLoop() {
    while (!this.isPlaying) {
      const nextTrack = this.queue.shift()
      if (!nextTrack) return

      this.isPlaying = true
      this.current = nextTrack
      this.lastTrackTitle = nextTrack.title

      logger.event("scheduler", "Reproduciendo track", {
        title: nextTrack.title,
        id: nextTrack.id,
        guildId: this.connection.joinConfig.guildId,
        queueRemaining: this.queue.length,
      })

      try {
        if (!nextTrack.url) {
          logger.warn("scheduler", "Track sin URL, saltando", { title: nextTrack.title })
          this.resetPlaybackState()
          continue
        }

        this.audio.killProcess()
        const resource = await this.audio.createResource(nextTrack.url)

        this.playbackStart = Date.now()
        this.pauseOffset = 0
        this.pauseTime = null
        this.player.play(resource)
      } catch (error) {
        logger.error("scheduler", "Error al reproducir track", {
          title: nextTrack.title,
          url: nextTrack.url?.slice(0, 60),
          error: getErrorMessage(error),
        })
        this.resetPlaybackState()
      }
    }
  }

  getPosition(): number {
    if (!this.playbackStart) return 0
    const status = this.player.state.status
    if (status === AudioPlayerStatus.Idle) return 0
    if (this.connection.state.status === VoiceConnectionStatus.Destroyed) return 0
    let elapsed = Date.now() - this.playbackStart - this.pauseOffset
    if (this.pauseTime !== null) {
      elapsed -= Date.now() - this.pauseTime
    }
    return Math.floor(elapsed / MS_PER_SECOND)
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]]
    }
    logger.event("scheduler", "Cola mezclada", {
      guildId: this.connection.joinConfig.guildId,
      size: this.queue.length,
    })
  }

  remove(index: number): Track | null {
    if (index < 0 || index >= this.queue.length) return null
    const removed = this.queue.splice(index, 1)[0] ?? null
    if (removed) {
      logger.event("scheduler", "Track removido de cola", {
        title: removed.title,
        index,
        guildId: this.connection.joinConfig.guildId,
      })
    }
    return removed
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
    logger.event("scheduler", "Loop mode cambiado", {
      mode: this.loopMode,
      guildId: this.connection.joinConfig.guildId,
    })
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
    // Brief delay to let FFmpeg process settle before starting new stream
    await new Promise((resolve) => setTimeout(resolve, SEEK_SETTLE_DELAY_MS))
    this.isPlaying = true

    logger.event("scheduler", "Buscando posición", {
      title: this.current.title,
      time,
      guildId: this.connection.joinConfig.guildId,
    })

    try {
      const resource = await this.audio.createResource(this.current.url, time)
      this.playbackStart = Date.now()
      this.pauseOffset = 0
      this.pauseTime = null
      this.player.play(resource)
      logger.info("scheduler", "Seek exitoso", { time })
    } catch (error) {
      logger.error("scheduler", "Error al buscar (seek)", {
        time,
        error: getErrorMessage(error),
      })
      this.resetPlaybackState()
      await this.processQueue()
    } finally {
      this.seeking = false
    }
  }

  clear() {
    const count = this.queue.length
    this.queue = []
    logger.event("scheduler", "Cola limpiada", {
      removedCount: count,
      guildId: this.connection.joinConfig.guildId,
    })
  }

  skip() {
    logger.event("scheduler", "Saltando", {
      title: this.current?.title ?? "none",
      guildId: this.connection.joinConfig.guildId,
    })
    this.audio.killProcess()
    this.player.stop()
  }

  pause() {
    this.player.pause()
    this.pauseTime = Date.now()
    logger.event("scheduler", "Pausado", {
      title: this.current?.title ?? "none",
      position: this.getPosition(),
      guildId: this.connection.joinConfig.guildId,
    })
  }

  resume() {
    this.player.unpause()
    if (this.pauseTime !== null) {
      this.pauseOffset += Date.now() - this.pauseTime
      this.pauseTime = null
    }
    logger.event("scheduler", "Reanudado", {
      title: this.current?.title ?? "none",
      position: this.getPosition(),
      guildId: this.connection.joinConfig.guildId,
    })
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
    logger.event("scheduler", "Stop", {
      title: this.current?.title ?? "none",
      queueSize: this.queue.length,
      guildId: this.connection.joinConfig.guildId,
    })
    this.queue = []
    this.audio.killProcess()
    this.player.stop()
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    logger.info("scheduler", "Scheduler destruido", {
      guildId: this.connection.joinConfig.guildId,
    })
    this.stop()
    this.connection.destroy()
  }

  toggleAutoplay(): boolean {
    this.autoplay = !this.autoplay
    logger.event("scheduler", "Autoplay cambiado", {
      enabled: this.autoplay,
      guildId: this.connection.joinConfig.guildId,
    })
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

  isDestroyed(): boolean {
    return this.destroyed
  }

  isConnected(): boolean {
    const status = this.connection.state.status
    return (
      status === VoiceConnectionStatus.Ready ||
      status === VoiceConnectionStatus.Connecting ||
      status === VoiceConnectionStatus.Signalling
    )
  }
}

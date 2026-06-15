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
import { findRelated, extractArtist, extractSongOnly } from "@/radio/LastFmRecommender"
import { logger } from "@/utils/logger"
import { getErrorMessage } from "@/utils/error"
import { getBotClient } from "@/bot"

import { VOICE_RECONNECT_TIMEOUT_MS, SEEK_SETTLE_DELAY_MS } from "@/config/timeouts"
import { ARTIST_ROTATION_LIMIT } from "@/config/radio"
const MS_PER_SECOND = 1_000

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export class TrackScheduler {
  private userQueue: Track[] = []
  private radioQueue: Track[] = []
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
  private last5Tracks: string[] = []
  private currentArtist: string | null = null
  private sameArtistStreak = 0
  private artistHistory: string[] = []
  private radioNext: Track | null = null
  private radioBaseTitle: string | null = null

  private readonly MAX_LAST5 = 5
  private readonly MAX_ARTIST_HISTORY = 10
  private destroyed = false
  private handlingIdle = false
  private isProcessing = false
  private disconnectCalled = false

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
      if (this.seeking || this.destroyed || this.handlingIdle) return
      this.handlingIdle = true
      try {
        const finished = this.current
        const willAutoplay = this.autoplay && !!finished && this.userQueue.length === 0 && this.radioQueue.length === 0

        if (finished?.title) {
          this.handleTrackFinished(finished, willAutoplay)
        }

        if (!willAutoplay) {
          this.applyLoopMode(finished)
        }

        if (willAutoplay) {
          await this.handleAutoplay(finished)
        }

        if (this.autoplay && this.current) {
          await this.preloadRadioNext()
        }

        this.resetPlaybackState()
        await this.processQueue()

        if (!this.autoplay && this.userQueue.length === 0 && this.radioQueue.length === 0 && !this.current) {
          logger.event("scheduler", "Cola vacía sin autoplay, desconectando", {
            guildId: this.connection.joinConfig.guildId,
          })
          this.destroy()
          return
        }

        await this.onTrackChange?.(this.connection.joinConfig.guildId)
      } catch (error) {
        logger.error("scheduler", "Error en Idle handler", {
          error: getErrorMessage(error),
        })
      } finally {
        this.handlingIdle = false
      }
    })

    this.player.on("error", async (err) => {
      if (this.destroyed) return
      try {
        logger.error("scheduler", "Error del AudioPlayer", {
          error: getErrorMessage(err),
          guildId: this.connection.joinConfig.guildId,
        })
        this.resetPlaybackState()
        await this.processQueue()
        await this.onTrackChange?.(this.connection.joinConfig.guildId)
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
    this.last5Tracks.unshift(norm)
    if (this.last5Tracks.length > this.MAX_LAST5) this.last5Tracks.pop()

    const artist = extractArtist(finished.title)
    if (artist) {
      if (artist === this.currentArtist) {
        this.sameArtistStreak++
      } else {
        this.sameArtistStreak = 1
        this.currentArtist = artist
        this.artistHistory.unshift(artist)
        if (this.artistHistory.length > this.MAX_ARTIST_HISTORY) this.artistHistory.pop()
      }
    }

    logger.event("scheduler", "Track finalizado", {
      title: finished.title,
      guildId: this.connection.joinConfig.guildId,
      willAutoplay,
      queueSize: this.userQueue.length + this.radioQueue.length,
    })
  }

  private applyLoopMode(finished: Track | null) {
    if (!finished) return
    const targetQueue = finished.requestedBy === "radio" ? this.radioQueue : this.userQueue
    if (this.loopMode === "one") {
      targetQueue.unshift({ ...finished })
      logger.debug("scheduler", "Loop one: reencolando track", { title: finished.title })
    } else if (this.loopMode === "all") {
      targetQueue.push({ ...finished })
      logger.debug("scheduler", "Loop all: reencolando track al final", { title: finished.title })
    }
  }

  private async handleAutoplay(finished: Track | null) {
    if (!finished) return

    if (this.radioNext) {
      this.radioQueue.push(this.radioNext)
      logger.info("radio", "Radio next encolado (pre-calculado)", {
        title: this.radioNext.title,
        id: this.radioNext.id,
      })
      this.radioNext = null
      return
    }

    const searchTitle = this.radioBaseTitle ?? finished.title
    const shouldSwitch = this.sameArtistStreak >= ARTIST_ROTATION_LIMIT
    logger.debug("radio", "Buscando track relacionado (fallback)", {
      baseTitle: searchTitle,
      historyCount: this.last5Tracks.length,
      shouldSwitch,
    })
    const result = await findRelated(searchTitle, this.last5Tracks, shouldSwitch, this.currentArtist, this.artistHistory)
    if (result) {
      const track = { ...result.track, requestedBy: "radio", canonicalTitle: result.canonicalTitle } as Track
      this.radioQueue.push(track)
      logger.info("radio", "Track relacionado encontrado", {
        title: result.track.title,
        id: result.track.id,
        canonicalTitle: result.canonicalTitle,
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
      logger.warn("scheduler", "Conexión de voz perdida, destruyendo scheduler", {
        guildId: this.connection.joinConfig.guildId,
      })
      this.destroy()
    }
  }

  private async handleVoiceDestroyed() {
    if (this.destroyed) return
    const guildId = this.connection.joinConfig.guildId
    logger.event("scheduler", "Canal de voz destruido, limpiando", { guildId })
    this.audio.killProcess()
    this.player.stop()
    this.destroy()
  }

  private resetPlaybackState() {
    this.isPlaying = false
    this.current = null
    this.playbackStart = null
    this.pauseOffset = 0
    this.pauseTime = null
  }

  async add(track: Track) {
    this.radioQueue = []
    this.radioNext = null

    this.userQueue.push(track)
    const totalSize = this.userQueue.length + this.radioQueue.length
    logger.event("scheduler", "Track añadido a cola", {
      title: track.title,
      guildId: this.connection.joinConfig.guildId,
      queueSize: totalSize,
      wasPlaying: this.isPlaying,
    })
    if (!this.isPlaying) {
      await this.processQueue()
    }
  }

  async addMultiple(tracks: Track[]) {
    this.radioQueue = []
    this.radioNext = null
    this.userQueue.push(...tracks)
    const totalSize = this.userQueue.length + this.radioQueue.length
    logger.event("scheduler", "Múltiples tracks añadidos", {
      count: tracks.length,
      guildId: this.connection.joinConfig.guildId,
      queueSize: totalSize,
    })
    if (!this.isPlaying) {
      await this.processQueue()
    }
  }

  addNext(track: Track) {
    this.userQueue.unshift(track)
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
    this.isProcessing = true
    try {
      while (!this.isPlaying) {
        const nextTrack = this.userQueue.shift() ?? this.radioQueue.shift()
        if (!nextTrack) return

        this.isPlaying = true
        this.current = nextTrack
        this.lastTrackTitle = nextTrack.canonicalTitle ?? nextTrack.title
        if (nextTrack.requestedBy !== "radio") {
          this.radioBaseTitle = null
        }

        if (this.userQueue.length === 0 && this.radioQueue.length === 0 && this.autoplay) {
          this.populateRadioQueue().catch((error: unknown) => {
            logger.error("scheduler", "Error poblando cola de radio", { error: getErrorMessage(error) })
          })
        }

        const logArtist = nextTrack.canonicalTitle ? extractArtist(nextTrack.canonicalTitle) : extractArtist(nextTrack.title)
        const logSong = nextTrack.canonicalTitle ? extractSongOnly(nextTrack.canonicalTitle) : extractSongOnly(nextTrack.title)

        logger.event("scheduler", "Reproduciendo track", {
          artist: logArtist || "(desconocido)",
          song: logSong || nextTrack.title,
          album: "(no disponible)",
          image: nextTrack.thumbnail ?? "(no disponible)",
          youtubeTitle: nextTrack.title,
          id: nextTrack.id,
          guildId: this.connection.joinConfig.guildId,
          queueRemaining: this.userQueue.length + this.radioQueue.length,
        })

        try {
          if (!nextTrack.url) {
            logger.warn("scheduler", "Track sin URL, saltando", { title: nextTrack.title })
            this.resetPlaybackState()
            continue
          }

          this.player.stop()
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
    } finally {
      this.isProcessing = false
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
    const combined = [...this.userQueue, ...this.radioQueue]
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]]
    }
    this.userQueue = combined.filter(t => t.requestedBy !== "radio")
    this.radioQueue = combined.filter(t => t.requestedBy === "radio")
    const totalSize = this.userQueue.length + this.radioQueue.length
    logger.event("scheduler", "Cola mezclada", {
      guildId: this.connection.joinConfig.guildId,
      size: totalSize,
    })
  }

  remove(index: number): Track | null {
    const totalSize = this.userQueue.length + this.radioQueue.length
    if (index < 0 || index >= totalSize) return null
    let removed: Track | null = null
    if (index < this.userQueue.length) {
      removed = this.userQueue.splice(index, 1)[0] ?? null
    } else {
      const radioIndex = index - this.userQueue.length
      removed = this.radioQueue.splice(radioIndex, 1)[0] ?? null
    }
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
    const totalSize = this.userQueue.length + this.radioQueue.length
    if (index <= 0 || index >= totalSize) return false

    if (index < this.userQueue.length) {
      const temp = this.userQueue[index]
      this.userQueue[index] = this.userQueue[index - 1]
      this.userQueue[index - 1] = temp
      return true
    }

    const radioIndex = index - this.userQueue.length
    if (radioIndex === 0) return false
    const temp = this.radioQueue[radioIndex]
    this.radioQueue[radioIndex] = this.radioQueue[radioIndex - 1]
    this.radioQueue[radioIndex - 1] = temp
    return true
  }

  moveDown(index: number): boolean {
    const totalSize = this.userQueue.length + this.radioQueue.length
    if (index < 0 || index >= totalSize - 1) return false

    if (index < this.userQueue.length) {
      if (index === this.userQueue.length - 1) return false
      const temp = this.userQueue[index]
      this.userQueue[index] = this.userQueue[index + 1]
      this.userQueue[index + 1] = temp
      return true
    }

    const radioIndex = index - this.userQueue.length
    if (radioIndex >= this.radioQueue.length - 1) return false
    const temp = this.radioQueue[radioIndex]
    this.radioQueue[radioIndex] = this.radioQueue[radioIndex + 1]
    this.radioQueue[radioIndex + 1] = temp
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
    const count = this.userQueue.length + this.radioQueue.length
    this.userQueue = []
    this.radioQueue = []
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
    const totalSize = this.userQueue.length + this.radioQueue.length
    logger.event("scheduler", "Stop", {
      title: this.current?.title ?? "none",
      queueSize: totalSize,
      guildId: this.connection.joinConfig.guildId,
    })
    this.userQueue = []
    this.radioQueue = []
    this.audio.killProcess()
    this.player.stop()
  }

  destroy() {
    if (this.destroyed || this.isProcessing) return
    this.destroyed = true
    const guildId = this.connection.joinConfig.guildId
    logger.info("scheduler", "Scheduler destruido", {
      guildId,
    })
    this.stop()
    this.connection.destroy()
    if (!this.disconnectCalled) {
      this.disconnectCalled = true
      this.onDisconnect?.(guildId)
    }
  }

  async toggleAutoplay(): Promise<boolean> {
    this.autoplay = !this.autoplay
    logger.event("scheduler", "Autoplay cambiado", {
      enabled: this.autoplay,
      guildId: this.connection.joinConfig.guildId,
    })

    if (this.autoplay && this.current && this.userQueue.length === 0 && this.radioQueue.length === 0) {
      await this.populateRadioQueue()
    }

    return this.autoplay
  }

  async reshuffleRadioTrack(flatIndex: number): Promise<Track | null> {
    const radioIndex = flatIndex - this.userQueue.length
    if (radioIndex < 0 || radioIndex >= this.radioQueue.length) return null

    const searchTitle = this.radioBaseTitle ?? this.lastTrackTitle
    if (!searchTitle) return null

    const shouldSwitch = this.sameArtistStreak >= ARTIST_ROTATION_LIMIT
    const result = await findRelated(searchTitle, this.last5Tracks, shouldSwitch, this.currentArtist, this.artistHistory)
    if (!result) return null

    const track = { ...result.track, requestedBy: "radio", canonicalTitle: result.canonicalTitle } as Track
    this.radioQueue[radioIndex] = track
    logger.info("radio", "Track de radio resugerido", {
      title: track.title,
      id: track.id,
      index: radioIndex,
    })

    if (result.canonicalTitle) {
      this.radioBaseTitle = result.canonicalTitle
    }
    return track
  }

  getRadioNext(): Track | null {
    return this.radioNext
  }

  private async populateRadioQueue(): Promise<void> {
    const searchTitle = this.radioBaseTitle ?? this.lastTrackTitle
    if (!searchTitle || !this.autoplay || this.radioQueue.length > 0) return

    const shouldSwitch = this.sameArtistStreak >= ARTIST_ROTATION_LIMIT
    const result = await findRelated(searchTitle, this.last5Tracks, shouldSwitch, this.currentArtist, this.artistHistory)
    if (!result || this.radioQueue.length > 0) return

    const track = { ...result.track, requestedBy: "radio", canonicalTitle: result.canonicalTitle } as Track
    this.radioQueue.push(track)
    logger.info("radio", "Cola de radio poblada (último track de usuario)", {
      title: track.title,
      id: track.id,
      canonicalTitle: result.canonicalTitle,
    })
    this.onTrackChange?.(this.connection.joinConfig.guildId)
  }

  async reshuffleRadio(): Promise<Track | null> {
    const searchTitle = this.radioBaseTitle ?? this.lastTrackTitle
    if (!searchTitle) return null
    this.radioNext = null
    const shouldSwitch = this.sameArtistStreak >= ARTIST_ROTATION_LIMIT
    const result = await findRelated(searchTitle, this.last5Tracks, shouldSwitch, this.currentArtist, this.artistHistory)
    if (result) {
      this.radioNext = { ...result.track, requestedBy: "radio", canonicalTitle: result.canonicalTitle } as Track
      if (result.canonicalTitle) {
        this.radioBaseTitle = result.canonicalTitle
      }
      logger.info("radio", "Radio next rehecho", {
        title: this.radioNext.title,
        id: this.radioNext.id,
        canonicalTitle: result.canonicalTitle,
      })
    }
    return this.radioNext
  }

  private async preloadRadioNext(): Promise<void> {
    const searchTitle = this.radioBaseTitle ?? this.lastTrackTitle
    if (!searchTitle) return
    const shouldSwitch = this.sameArtistStreak >= ARTIST_ROTATION_LIMIT
    const result = await findRelated(searchTitle, this.last5Tracks, shouldSwitch, this.currentArtist, this.artistHistory)
    if (result) {
      this.radioNext = { ...result.track, requestedBy: "radio", canonicalTitle: result.canonicalTitle } as Track
      if (result.canonicalTitle) {
        this.radioBaseTitle = result.canonicalTitle
      }
      logger.debug("radio", "Radio next pre-calculado", {
        title: this.radioNext.title,
        id: this.radioNext.id,
        canonicalTitle: result.canonicalTitle,
      })
    }
  }

  getQueue(): Track[] {
    return [...this.userQueue, ...this.radioQueue]
  }

  getCurrentTrack(): Track | null {
    return this.current
  }

  isAutoplayEnabled(): boolean {
    return this.autoplay
  }

  getSize(): number {
    return this.userQueue.length + this.radioQueue.length
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

  getVoiceChannelName(): string | null {
    const channel = this.connection.joinConfig.channelId
    if (!channel) return null
    const guild = this.connection.joinConfig.guildId
    const client = getBotClient()
    if (!client) return null
    const guildObj = client.guilds.cache.get(guild)
    if (!guildObj) return null
    const voiceChannel = guildObj.channels.cache.get(channel)
    return voiceChannel?.name ?? null
  }
}

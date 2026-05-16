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

const MAX_AUTOPLAY_SEC = 1500

const GENRE_KEYWORDS = [
  "rock", "pop", "metal", "hip hop", "rap", "r&b", "jazz", "blues",
  "country", "electronic", "dance", "classical", "reggae", "punk",
  "alternative", "indie", "soul", "funk", "disco", "folk", "latin",
  "edm", "techno", "house", "trance", "dubstep", "ambient", "grunge",
  "punk rock", "alternative rock", "hard rock", "heavy metal", "nu metal",
  "hip-hop", "trap", "lo-fi", "synthwave", "progressive", "acoustic",
]

function parseDurationSec(dur: string | number | undefined): number {
  if (dur == null) return 0
  if (typeof dur === "number") return dur
  const parts = dur.split(":").map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

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
  private pauseOffset = 0
  private pauseTime: number | null = null
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
        console.log(`[Idle] Track terminó: "${finished?.title ?? "null"}", queue.length=${this.queue.length}, autoplay=${this.autoplay}, loopMode=${this.loopMode}`)
        const willAutoplay = this.autoplay && finished && this.queue.length === 0
        console.log(`[Idle] willAutoplay=${willAutoplay}`)
        if (!willAutoplay) {
          if (this.loopMode === "one" && finished) {
            this.queue.unshift({ ...finished })
            console.log(`[Idle] Loop ONE → readicioné "${finished.title}" al inicio`)
          } else if (this.loopMode === "all" && finished) {
            this.queue.push({ ...finished })
            console.log(`[Idle] Loop ALL → readicioné "${finished.title}" al final`)
          }
        }
        if (willAutoplay) {
          await this.autoplayAddNext()
        }
        if (this.activeProcess && !this.activeProcess.killed) {
          this.activeProcess.kill()
        }
        this.activeProcess = undefined
        this.isPlaying = false
        this.current = null
        this.playbackStart = null
        this.pauseOffset = 0
        this.pauseTime = null
        console.log(`[Idle] Estado: isPlaying=false, llamando processQueue (queue.length=${this.queue.length})`)
        await this.processQueue()
        console.log(`[Idle] processQueue terminó, llamando onTrackChange`)
        await this.onTrackChange?.(this.connection.joinConfig.guildId)
      } catch (error) {
        console.error("[Idle] Error:", error)
      }
    })

    this.player.on("error", async (error) => {
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

  private async processQueue() {
    if (this.isPlaying) {
      console.log("[processQueue] isPlaying=true, saliendo")
      return
    }

    const nextTrack = this.queue.shift()
    console.log(`[processQueue] shift → ${nextTrack ? `"${nextTrack.title}"` : "null"}`)

    if (!nextTrack) {
      console.log("[processQueue] queue vacía, nada que reproducir")
      return
    }

    this.isPlaying = true
    this.current = nextTrack
    this.lastTrackTitle = nextTrack.title
    console.log(`[processQueue] Reproduciendo: "${nextTrack.title}" (${nextTrack.url})`)

    try {
      if (!nextTrack.url) {
        console.error("Track sin URL, saltando")
        this.isPlaying = false
        this.current = null
        await this.processQueue()
        return
      }

      if (this.activeProcess && !this.activeProcess.killed) {
        this.activeProcess.kill()
      }
      this.activeProcess = undefined

      const subprocess = youtubedl.exec(nextTrack.url, {
        format: "bestaudio",
        output: "-",
        quiet: true,
        noWarnings: true,
        forceOverwrites: true,
      }, { stdio: ["ignore", "pipe", "ignore"] })

      this.activeProcess = subprocess
      subprocess.catch(() => {})
      const stream = subprocess.stdout!

      subprocess.on("error", (err) => console.error("[yt-dlp] Error en proceso:", err))
      stream.on("error", () => {})
      subprocess.on("close", (code) => {
        if (code && code !== 0) console.error(`[yt-dlp] Salió con código ${code}`)
      })

      const probe = await demuxProbe(stream)

      const resource: AudioResource = createAudioResource(probe.stream, {
        inputType: probe.type,
      })
      this.playbackStart = Date.now()
      this.pauseOffset = 0
      this.pauseTime = null
      this.player.play(resource)
    } catch (error) {
      console.error("Error al reproducir track")
      this.isPlaying = false
      this.current = null
      this.playbackStart = null
      this.pauseOffset = 0
      this.pauseTime = null
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
      subprocess.catch(() => {})
      const stream = subprocess.stdout!

      subprocess.on("error", (err) => console.error("[yt-dlp] Error en proceso (seek):", err))
      stream.on("error", () => {})
      subprocess.on("close", (code) => {
        if (code && code !== 0) console.error(`[yt-dlp] Salió con código ${code} (seek)`)
      })

      const probe = await demuxProbe(stream)

      const resource: AudioResource = createAudioResource(probe.stream, {
        inputType: probe.type,
      })
      this.playbackStart = Date.now()
      this.pauseOffset = 0
      this.pauseTime = null
      this.player.play(resource)
    } catch (error) {
      console.error("Error al buscar (seek)")
      this.isPlaying = false
      this.current = null
      this.playbackStart = null
      this.pauseOffset = 0
      this.pauseTime = null
      await this.processQueue()
    } finally {
      this.seeking = false
    }
  }

  private async autoplayAddNext() {
    try {
      const title = this.lastTrackTitle ?? ""

      let genreQuery = ""
      const currentUrl = this.current?.url
      if (currentUrl) {
        try {
          const info = await play.video_basic_info(currentUrl)
          const tags = info.video_details.tags ?? []
          const genreTag = tags.find(t => GENRE_KEYWORDS.includes(t.toLowerCase()))
          if (genreTag) {
            genreQuery = `${genreTag} music`
            console.log(`[Autoplay] Tag de género detectado: "${genreTag}"`)
          } else {
            console.log(`[Autoplay] Sin tag de género en los tags del video`)
          }
        } catch (e) {
          console.log(`[Autoplay] Error al obtener info del video:`, e)
        }
      }

      const sep = title.search(/ [-–|]/)
      const artistQuery = sep > 0
        ? title.slice(0, sep)
        : title.replace(/\[.*?\]|\(.*?\)/g, "").trim() || "popular music"

      const queries = genreQuery ? [genreQuery, artistQuery] : [artistQuery]

      for (const q of queries) {
        console.log(`[Autoplay] Buscando: "${q}" (lastTrackTitle="${this.lastTrackTitle}")`)

        let videos: { title?: string; url?: string; id?: string; durationRaw?: string }[] = []
        try {
          const results = await play.search(q, { limit: 15 })
          console.log(`[Autoplay] play.search: ${results.length} videos`)
          videos = results.map(r => ({ title: r.title, url: r.url, id: r.id, durationRaw: r.durationRaw }))
        } catch {
          console.log("[Autoplay] play.search falló, usando fallback yt-dlp")
          try {
            const out = await youtubedl(`ytsearch15:${q}`, {
              dumpSingleJson: true,
              noWarnings: true,
              quiet: true,
              flatPlaylist: true,
              matchFilter: "duration < 1500",
            }, { timeout: 15000 }) as any
            const entries = out?.entries ?? []
            console.log(`[Autoplay] yt-dlp fallback: ${entries.length} resultados`)
            videos = entries.map((e: any) => ({
              title: e.title,
              url: `https://youtube.com/watch?v=${e.id}`,
              id: e.id,
              durationRaw: e.duration ?? undefined,
            }))
          } catch (e2) {
            console.log("[Autoplay] Fallback yt-dlp también falló:", e2)
            continue
          }
        }

        if (!videos.length) {
          console.log("[Autoplay] Sin resultados, probando siguiente query")
          continue
        }

        const currentId = this.current?.id
        const currentTitle = this.current?.title?.toLowerCase()
        videos.forEach((r, i) => console.log(`[Autoplay]  Result[${i}]: id=${r.id} title="${r.title}"`))
        const filtered = videos.filter(v => {
          if (currentId && v.id === currentId) {
            console.log(`[Autoplay]  Filtrando: ${v.title} coincide por ID`)
            return false
          }
          if (currentTitle && v.title?.toLowerCase() === currentTitle) {
            console.log(`[Autoplay]  Filtrando: ${v.title} coincide por título`)
            return false
          }
          const durSec = parseDurationSec(v.durationRaw)
          if (durSec > MAX_AUTOPLAY_SEC) {
            console.log(`[Autoplay]  Filtrando: ${v.title} dura ${durSec}s (>${MAX_AUTOPLAY_SEC}s)`)
            return false
          }
          return true
        })
        console.log(`[Autoplay] Filtrados: ${filtered.length} de ${videos.length}`)
        if (!filtered.length) {
          console.log("[Autoplay] Todos filtrados, probando siguiente query")
          continue
        }

        this.autoplayFails = 0
        const video = filtered[Math.floor(Math.random() * filtered.length)]
        const id = video.id
        console.log(`[Autoplay] Añadiendo: "${video.title}" (id=${id}) al inicio de la queue`)
        this.addNext({
          title: video.title ?? "Unknown",
          url: video.url ?? `https://youtube.com/watch?v=${video.id}`,
          requestedBy: "Autoplay",
          duration: video.durationRaw,
          id,
          thumbnail: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
        })
        console.log(`[Autoplay] Queue ahora tiene ${this.queue.length} tracks`)
        return
      }

      console.log("[Autoplay] Todas las queries agotadas, sin resultados")
    } catch (error) {
      console.error("[Autoplay] Error:", error)
      console.log("[Autoplay] Omitiendo autoplay para este track — no se desactiva")
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

import type { Ports } from "../domain/ports"
import type { Track, GuildSession, ResolvedTrack } from "../domain/types"
import type { Result } from "../shared/result"
import { ok, err } from "../shared/result"
import * as Queue from "../domain/queue"
import * as Session from "../domain/session"
import { youtubeThumbnail, extractArtist, extractSong } from "../domain/track-parser"
import { recommendAndEnqueue } from "../domain/radio"

type MusicUseCasesCallbacks = Readonly<{
  onTrackChange?: (guildId: string) => void
}>

export type MusicUseCases = Readonly<{
  play: (query: string, guildId: string, userId: string, voiceChannelId: string, adapterCreator: unknown) => Promise<Result<readonly Track[], string>>
  skip: (guildId: string) => Result<void, "no_session">
  pause: (guildId: string) => Result<void, "no_session" | "already_paused">
  resume: (guildId: string) => Result<void, "no_session" | "not_paused">
  stop: (guildId: string) => Result<void, "no_session">
  seek: (guildId: string, seconds: number) => Promise<Result<void, "no_session" | "no_track" | "seek_failed">>
  getSession: (guildId: string) => GuildSession | null
  getSessions: () => Map<string, GuildSession>
  startPlayback: (guildId: string) => Promise<void>
  setSession: (guildId: string, session: GuildSession) => void
  destroySession: (guildId: string) => void
  prefetchRadioUrl: (guildId: string) => Promise<void>
  isDeployMode: () => boolean
  setDeployMode: (mode: boolean) => void
}>

const toTrack = (video: ResolvedTrack, requestedBy: string): Track => {
  const canonicalTitle = video.track && video.artist
    ? `${video.artist} - ${video.track}`
    : video.track ?? undefined
  const titleForExtraction = canonicalTitle ?? video.title
  return {
    title: video.title,
    url: video.url,
    requestedBy,
    duration: video.duration,
    id: video.id,
    thumbnail: video.id ? youtubeThumbnail(video.id) : video.thumbnail,
    canonicalTitle,
    artist: extractArtist(titleForExtraction) || undefined,
    song: extractSong(titleForExtraction),
    album: video.album,
  }
}

export const createMusicUseCases = (ports: Ports, callbacks?: MusicUseCasesCallbacks): MusicUseCases => {
  const sessions = new Map<string, GuildSession>()
  let deployMode = false
  const handlingIdle = new Set<string>()
  const MAX_STREAM_RETRIES = 2
  const streamRetries = new Map<string, number>()

  const onTrackChange = (guildId: string): void => {
    callbacks?.onTrackChange?.(guildId)
  }

  const getSession = (guildId: string): GuildSession | null =>
    sessions.get(guildId) ?? null

  const setSession = (guildId: string, session: GuildSession): void => {
    sessions.set(guildId, session)
  }

  const destroySession = (guildId: string): void => {
    const session = sessions.get(guildId)
    if (session) {
      ports.audio.killProcess(guildId)
      ports.player.destroy(guildId)
      ports.voice.destroy(guildId)
      sessions.delete(guildId)
      streamRetries.delete(guildId)
      ports.notify.deleteMessage(guildId).catch(() => {})
    }
  }

  const startPlayback = async (guildId: string): Promise<void> => {
    const session = sessions.get(guildId)
    if (!session || session.playback.isPlaying) return

    const { track, queue: newQueue } = Queue.dequeue(session.queue, session.prefs.autoplay)
    if (!track?.url) {
      if (!track) {
        ports.logger.debug("music", "startPlayback: cola agotada, sin track disponible", {
          guildId,
          autoplay: session.prefs.autoplay,
          userTracks: newQueue.userTracks.length,
          radioTracks: newQueue.radioTracks.length,
        })
      }
      return
    }

    ports.audio.killProcess(guildId)
    ports.player.stop(guildId)

    const prefetched = session.prefetchedUrl?.trackUrl === track.url ? session.prefetchedUrl : null
    const resourceResult = prefetched
      ? await ports.audio.createFromAudioUrl(guildId, prefetched.audioUrl)
      : await ports.audio.createResource(guildId, track.url)
    if (!resourceResult.ok) {
      ports.logger.error("music", "Failed to create audio resource", { error: resourceResult.error })
      return
    }

    ports.player.play(guildId, resourceResult.value)
    const playing = Session.setPlaying({ ...session, queue: newQueue }, track)
    const updated = track.requestedBy !== "radio"
      ? { ...playing, radioBaseTitle: null, prefetchedUrl: null }
      : { ...playing, prefetchedUrl: null }
    sessions.set(guildId, updated)
    onTrackChange(guildId)

    if (newQueue.userTracks.length === 0 && newQueue.radioTracks.length === 0 && session.prefs.autoplay) {
      ports.logger.debug("music", "startPlayback: cola agotada, poblando radio", { guildId })
      populateRadio(guildId)
        .then(() => onTrackChange(guildId))
        .catch((e: unknown) => {
          ports.logger.error("radio", "Error populating radio queue", { error: String(e) })
        })
    }
  }

  const handleTrackFinished = async (guildId: string): Promise<void> => {
    const session = sessions.get(guildId)
    if (!session || session.playback.seeking || session.playback.isPaused) return

    if (ports.audio.consumeStreamFailure(guildId) && session.queue.current?.url && (streamRetries.get(guildId) ?? 0) < MAX_STREAM_RETRIES) {
      streamRetries.set(guildId, (streamRetries.get(guildId) ?? 0) + 1)
      ports.logger.warn("music", "Stream fallo (posible 403), reintentando misma pista", {
        guildId,
        retry: streamRetries.get(guildId),
        track: session.queue.current.title,
      })
      const current = session.queue.current
      sessions.set(guildId, Session.setStopped({
        ...session,
        prefetchedUrl: null,
        queue: Queue.addNext(session.queue, current),
      }))
      await startPlayback(guildId)
      return
    }

    streamRetries.delete(guildId)
    const finished = session.queue.current
    const base = finished ? Session.onTrackFinished(session, finished, extractArtist) : session
    const queued = finished ? Queue.applyLoop(base.queue, finished) : base.queue
    sessions.set(guildId, Session.setStopped({ ...base, queue: queued }))

    await startPlayback(guildId)

    const after = sessions.get(guildId)
    if (!after) return

    if (!after.playback.isPlaying && after.prefs.autoplay && Queue.isEmpty(after.queue)) {
      ports.logger.info("radio", "Pista finalizada, generando siguiente tema de radio", {
        guildId,
        last5Count: after.last5Tracks.length,
      })
      onTrackChange(guildId)
      populateRadio(guildId)
        .then(() => startPlayback(guildId))
        .catch((e: unknown) => ports.logger.error("radio", "Error populating radio queue", { error: String(e) }))
    } else if (!after.playback.isPlaying && !after.prefs.autoplay && Queue.isEmpty(after.queue)) {
      ports.logger.info("music", "Pista finalizada, cola vacia sin autoplay, destruyendo sesion", { guildId })
      destroySession(guildId)
    } else {
      ports.logger.debug("music", "Pista finalizada, continuando reproduccion", {
        guildId,
        isPlaying: after.playback.isPlaying,
        autoplay: after.prefs.autoplay,
        queueSize: Queue.getSize(after.queue),
      })
    }
  }

  const handleIdle = (guildId: string): void => {
    if (handlingIdle.has(guildId)) return
    handlingIdle.add(guildId)
    handleTrackFinished(guildId).finally(() => { handlingIdle.delete(guildId) })
  }

  const populateRadio = async (guildId: string): Promise<void> => {
    const session = sessions.get(guildId)
    if (!session || !session.prefs.autoplay || session.queue.radioTracks.length > 0) return

    ports.logger.info("radio", "Poblando cola de radio (fin de pista)", {
      guildId,
      searchTitle: session.radioBaseTitle ?? session.queue.current?.title ?? session.last5Tracks[0] ?? null,
      last5Count: session.last5Tracks.length,
    })

    const updated = await recommendAndEnqueue(session, ports.recommend, ports.logger)
    sessions.set(guildId, updated)
    await prefetchRadioUrl(guildId)
  }

  const prefetchRadioUrl = async (guildId: string): Promise<void> => {
    const session = sessions.get(guildId)
    if (!session) return
    const nextRadio = session.queue.radioTracks[0]
    if (!nextRadio?.url) return
    if (session.prefetchedUrl?.trackUrl === nextRadio.url) return

    const result = await ports.audio.getAudioUrl(nextRadio.url)
    if (!result.ok) {
      ports.logger.debug("audio", "Prefetch de URL de radio fallo", {
        guildId,
        track: nextRadio.title,
        error: result.error,
      })
      return
    }
    sessions.set(guildId, {
      ...session,
      prefetchedUrl: { trackUrl: nextRadio.url, audioUrl: result.value },
    })
  }

  const play = async (
    query: string,
    guildId: string,
    userId: string,
    voiceChannelId: string,
    adapterCreator: unknown,
  ): Promise<Result<readonly Track[], string>> => {
    if (deployMode) return err("deploying")

    const resolved = await ports.search.resolveQuery(query)
    if (!resolved.ok) return err(resolved.error)

    let session = getSession(guildId)
    if (!session) {
      const joined = await ports.voice.join(guildId, voiceChannelId, adapterCreator)
      if (!joined.ok) return err("voice_join_failed")
      ports.player.subscribeToConnection(guildId)
      ports.player.onIdle(guildId, handleIdle)
      session = Session.createSession(guildId, voiceChannelId)
    }

    const tracks = resolved.value.tracks.map((t: ResolvedTrack) => toTrack(t, userId))
    const newQueue = tracks.length > 1
      ? Queue.addMultiple(session.queue, tracks)
      : Queue.addTrack(session.queue, tracks[0])

    sessions.set(guildId, { ...session, queue: newQueue, prefetchedUrl: null })

    if (!session.playback.isPlaying) await startPlayback(guildId)

    return ok(tracks)
  }

  const skip = (guildId: string): Result<void, "no_session"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    ports.audio.killProcess(guildId)
    ports.player.stop(guildId)
    return ok(undefined)
  }

  const pause = (guildId: string): Result<void, "no_session" | "already_paused"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    if (session.playback.isPaused) return err("already_paused")
    ports.player.pause(guildId)
    sessions.set(guildId, Session.setPaused(session))
    return ok(undefined)
  }

  const resume = (guildId: string): Result<void, "no_session" | "not_paused"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    if (!session.playback.isPaused) return err("not_paused")
    ports.player.unpause(guildId)
    sessions.set(guildId, Session.setResumed(session))
    return ok(undefined)
  }

  const stop = (guildId: string): Result<void, "no_session"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    destroySession(guildId)
    return ok(undefined)
  }

  const seek = async (
    guildId: string,
    seconds: number,
  ): Promise<Result<void, "no_session" | "no_track" | "seek_failed">> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    if (!session.queue.current?.url) return err("no_track")

    const base = { ...session, prefetchedUrl: null }
    sessions.set(guildId, Session.setSeeking(base, true))
    ports.audio.killProcess(guildId)
    ports.player.stop(guildId)

    await new Promise(resolve => setTimeout(resolve, 100))

    const resource = await ports.audio.createResource(guildId, session.queue.current.url, seconds)
    if (!resource.ok) {
      sessions.set(guildId, Session.setSeeking(base, false))
      return err("seek_failed")
    }

    ports.player.play(guildId, resource.value)
    sessions.set(guildId, Session.setPlaying(base, session.queue.current))
    return ok(undefined)
  }

  return {
    play,
    skip,
    pause,
    resume,
    stop,
    seek,
    getSession,
    getSessions: () => sessions,
    startPlayback,
    setSession,
    destroySession,
    prefetchRadioUrl,
    isDeployMode: () => deployMode,
    setDeployMode: (mode: boolean) => { deployMode = mode },
  } as const
}

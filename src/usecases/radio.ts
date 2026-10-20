import type { Ports } from "../domain/ports"
import type { GuildSession, Track } from "../domain/types"
import { ok, err, type Result } from "../shared/result"
import * as Queue from "../domain/queue"
import { ARTIST_ROTATION_LIMIT } from "../config/radio"
import { recommendAndEnqueue, toRadioTrack } from "../domain/radio"
import { displayTitle } from "../domain/track-parser"

export type RadioUseCases = Readonly<{
  toggleAutoplay: (guildId: string) => Promise<Result<boolean, "no_session">>
  reshuffleRadio: (guildId: string, index: number) => Promise<Result<Track | null, "no_session" | "invalid_index">>
}>

export const createRadioUseCases = (
  ports: Ports,
  getSession: (guildId: string) => GuildSession | null,
  setSession: (guildId: string, session: GuildSession) => void,
  prefetchNext: (guildId: string) => Promise<void>,
  onChange?: (guildId: string) => void,
): RadioUseCases => {
  // The stream URL is only needed when the current track ends: never make the user wait for it
  const prefetchInBackground = (guildId: string): void => {
    prefetchNext(guildId).catch((e: unknown) => {
      ports.logger.debug("radio", "Error en prefetch", { guildId, error: String(e) })
    })
  }

  const toggleAutoplay = async (guildId: string): Promise<Result<boolean, "no_session">> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    const newAutoplay = !session.prefs.autoplay
    const toggled: GuildSession = {
      ...session,
      prefs: { ...session.prefs, autoplay: newAutoplay },
      queue: newAutoplay
        ? session.queue
        : Queue.clearRadio(session.queue),
      radioBaseTitle: newAutoplay ? session.radioBaseTitle : null,
    }
    setSession(guildId, toggled)
    onChange?.(guildId)

    if (!newAutoplay) {
      ports.logger.info("radio", "Autoplay desactivado", {
        guildId,
        radioTracksCleared: session.queue.radioTracks.length,
      })
      return ok(false)
    }

    ports.logger.info("radio", "Autoplay activado", {
      guildId,
      current: session.queue.current?.title ?? null,
      userTracks: session.queue.userTracks.length,
      radioTracks: session.queue.radioTracks.length,
    })

    if (toggled.queue.radioTracks.length === 0) {
      const recommended = await recommendAndEnqueue(toggled, ports.recommend, ports.logger)

      // Re-read: the session may have been destroyed or changed while recommending
      const latest = getSession(guildId)
      if (!latest) return err("no_session")
      if (latest.prefs.autoplay && latest.queue.radioTracks.length === 0 && recommended.queue.radioTracks.length > 0) {
        setSession(guildId, {
          ...latest,
          queue: { ...latest.queue, radioTracks: recommended.queue.radioTracks },
          radioBaseTitle: recommended.radioBaseTitle,
        })
        onChange?.(guildId)
      }
    }

    prefetchInBackground(guildId)
    return ok(true)
  }

  const reshuffleRadio = async (
    guildId: string,
    index: number,
  ): Promise<Result<Track | null, "no_session" | "invalid_index">> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")

    const radioIndex = index - session.queue.userTracks.length
    if (radioIndex < 0 || radioIndex >= session.queue.radioTracks.length) {
      return err("invalid_index")
    }

    if (session.reshufflingRadioIndex !== null) return ok(null)

    const current = session.queue.current
    const searchTitle = session.radioBaseTitle ?? (current ? displayTitle(current) : undefined)
    if (!searchTitle) return ok(null)

    setSession(guildId, { ...session, reshufflingRadioIndex: radioIndex })
    onChange?.(guildId)

    try {
      const excludeIds = [
        ...(session.queue.current?.id ? [session.queue.current.id] : []),
        ...session.last5Ids,
      ]

      const result = await ports.recommend.findRelated(searchTitle, session.last5Tracks, {
        shouldSwitch: session.sameArtistStreak >= ARTIST_ROTATION_LIMIT,
        currentArtist: session.currentArtist,
        artistHistory: session.artistHistory,
        excludeIds,
      })

      const latest = getSession(guildId)
      if (!latest) return err("no_session")

      if (!result) {
        setSession(guildId, { ...latest, reshufflingRadioIndex: null })
        onChange?.(guildId)
        return ok(null)
      }

      const track = toRadioTrack(result)
      const updated: GuildSession = {
        ...latest,
        queue: Queue.replaceRadioTrack(latest.queue, radioIndex, track),
        radioBaseTitle: result.canonicalTitle ?? latest.radioBaseTitle,
        reshufflingRadioIndex: null,
      }
      setSession(guildId, updated)
      onChange?.(guildId)
      if (radioIndex === 0) prefetchInBackground(guildId)

      return ok(track)
    } catch (e: unknown) {
      const latest = getSession(guildId)
      if (latest) {
        setSession(guildId, { ...latest, reshufflingRadioIndex: null })
        onChange?.(guildId)
      }
      throw e
    }
  }

  return { toggleAutoplay, reshuffleRadio } as const
}

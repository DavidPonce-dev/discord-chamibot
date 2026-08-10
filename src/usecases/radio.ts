import type { Ports } from "../domain/ports"
import type { GuildSession, Track } from "../domain/types"
import { ok, err, type Result } from "../shared/result"
import * as Queue from "../domain/queue"
import { ARTIST_ROTATION_LIMIT } from "../config/radio"
import { recommendAndEnqueue } from "../domain/radio"

export type RadioUseCases = Readonly<{
  toggleAutoplay: (guildId: string) => Promise<Result<boolean, "no_session">>
  reshuffleRadio: (guildId: string, index: number) => Promise<Result<Track | null, "no_session" | "invalid_index">>
}>

export const createRadioUseCases = (
  ports: Ports,
  getSession: (guildId: string) => GuildSession | null,
  setSession: (guildId: string, session: GuildSession) => void,
  prefetchRadioUrl: (guildId: string) => Promise<void>,
  onChange?: (guildId: string) => void,
): RadioUseCases => {
  const toggleAutoplay = async (guildId: string): Promise<Result<boolean, "no_session">> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    const newAutoplay = !session.prefs.autoplay
    let updated: GuildSession = {
      ...session,
      prefs: { ...session.prefs, autoplay: newAutoplay },
      queue: newAutoplay
        ? session.queue
        : Queue.clearRadio(session.queue),
      radioNext: newAutoplay ? session.radioNext : null,
      radioBaseTitle: newAutoplay ? session.radioBaseTitle : null,
    }

    if (newAutoplay) {
      ports.logger.info("radio", "Autoplay activado", {
        guildId,
        current: session.queue.current?.title ?? null,
        userTracks: session.queue.userTracks.length,
        radioTracks: session.queue.radioTracks.length,
      })
      setSession(guildId, updated)
      onChange?.(guildId)
      if (updated.queue.radioTracks.length === 0) {
        updated = await recommendAndEnqueue(updated, ports.recommend, ports.logger)
        setSession(guildId, updated)
        onChange?.(guildId)
      }
    } else {
      ports.logger.info("radio", "Autoplay desactivado", {
        guildId,
        radioTracksCleared: session.queue.radioTracks.length,
      })
      setSession(guildId, updated)
      onChange?.(guildId)
    }

    if (newAutoplay) await prefetchRadioUrl(guildId)
    return ok(newAutoplay)
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

    const searchTitle = session.radioBaseTitle ?? session.queue.current?.title
    if (!searchTitle) return ok(null)

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

    if (!result) return ok(null)

    const track: Track = { ...result.track, requestedBy: "radio", canonicalTitle: result.canonicalTitle }
    const updated: GuildSession = {
      ...session,
      queue: Queue.replaceRadioTrack(session.queue, radioIndex, track),
      radioBaseTitle: result.canonicalTitle ?? session.radioBaseTitle,
    }
    setSession(guildId, updated)
    onChange?.(guildId)
    if (radioIndex === 0) await prefetchRadioUrl(guildId)

    return ok(track)
  }

  return { toggleAutoplay, reshuffleRadio } as const
}

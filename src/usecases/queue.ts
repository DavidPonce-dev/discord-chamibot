import type { Ports } from "../domain/ports"
import type { GuildSession, Track, LoopMode } from "../domain/types"
import { ok, err, type Result } from "../shared/result"
import * as Queue from "../domain/queue"

export type QueueViewData = Readonly<{
  tracks: readonly Track[]
  current: Track | null
  page: number
  session: GuildSession
}>

export type QueueUseCases = Readonly<{
  getQueue: (guildId: string, page: number) => Result<QueueViewData, "no_session">
  shuffleQueue: (guildId: string) => Result<void, "no_session" | "empty">
  removeTrack: (guildId: string, position: number) => Result<Track, "no_session" | "out_of_bounds">
  moveUp: (guildId: string, index: number) => Result<void, "no_session" | "invalid">
  moveDown: (guildId: string, index: number) => Result<void, "no_session" | "invalid">
  toggleLoop: (guildId: string) => Result<LoopMode, "no_session">
}>

export const createQueueUseCases = (
  _ports: Ports,
  getSession: (guildId: string) => GuildSession | null,
  setSession: (guildId: string, session: GuildSession) => void,
): QueueUseCases => {
  const getQueue = (guildId: string, page: number): Result<QueueViewData, "no_session"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    return ok({
      tracks: Queue.getAllTracks(session.queue),
      current: session.queue.current,
      page,
      session,
    })
  }

  const shuffleQueue = (guildId: string): Result<void, "no_session" | "empty"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    if (Queue.isEmpty(session.queue)) return err("empty")
    setSession(guildId, { ...session, queue: Queue.shuffle(session.queue) })
    return ok(undefined)
  }

  const removeTrack = (guildId: string, position: number): Result<Track, "no_session" | "out_of_bounds"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    const result = Queue.removeTrack(session.queue, position - 1)
    if (!result.ok) return err("out_of_bounds")
    setSession(guildId, { ...session, queue: result.value.queue })
    return ok(result.value.track)
  }

  const moveUp = (guildId: string, index: number): Result<void, "no_session" | "invalid"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    const result = Queue.moveUp(session.queue, index)
    if (!result.ok) return err("invalid")
    setSession(guildId, { ...session, queue: result.value })
    return ok(undefined)
  }

  const moveDown = (guildId: string, index: number): Result<void, "no_session" | "invalid"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    const result = Queue.moveDown(session.queue, index)
    if (!result.ok) return err("invalid")
    setSession(guildId, { ...session, queue: result.value })
    return ok(undefined)
  }

  const toggleLoop = (guildId: string): Result<LoopMode, "no_session"> => {
    const session = getSession(guildId)
    if (!session) return err("no_session")
    const newQueue = Queue.toggleLoop(session.queue)
    setSession(guildId, { ...session, queue: newQueue })
    return ok(newQueue.loopMode)
  }

  return { getQueue, shuffleQueue, removeTrack, moveUp, moveDown, toggleLoop } as const
}

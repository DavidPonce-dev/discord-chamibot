import { VoiceConnection } from "@discordjs/voice"
import { Message, GuildTextBasedChannel } from "discord.js"
import { TrackScheduler } from "@/services/scheduler/TrackScheduler"
import { logger } from "@/utils/logger"

type CleanupFn = (guildId: string) => void
const cleanupCallbacks: CleanupFn[] = []
const preDestroyCallbacks: CleanupFn[] = []

export function registerCleanup(cb: CleanupFn) {
  cleanupCallbacks.push(cb)
}

export function registerPreDestroyCleanup(cb: CleanupFn) {
  preDestroyCallbacks.push(cb)
}

export class GuildManager {
  private sessions = new Map<string, TrackScheduler>()
  private autoplayPrefs = new Map<string, boolean>()
  private queueMessages = new Map<string, Message>()
  private queueChannels = new Map<string, GuildTextBasedChannel>()
  private statusTitles = new Map<string, string>()
  private nowPlayingMessages = new Map<string, Message>()

  getQueueChannel(guildId: string): GuildTextBasedChannel | undefined {
    return this.queueChannels.get(guildId)
  }

  setQueueChannel(guildId: string, channel: GuildTextBasedChannel) {
    this.queueChannels.set(guildId, channel)
  }

  clearQueueChannel(guildId: string) {
    this.queueChannels.delete(guildId)
  }

  getStatusTitle(guildId: string): string | undefined {
    return this.statusTitles.get(guildId)
  }

  setStatusTitle(guildId: string, title: string) {
    this.statusTitles.set(guildId, title)
  }

  clearStatusTitle(guildId: string) {
    this.statusTitles.delete(guildId)
  }

  getAutoplayPref(guildId: string): boolean {
    return this.autoplayPrefs.get(guildId) ?? false
  }

  toggleAutoplayPref(guildId: string): boolean {
    const current = this.autoplayPrefs.get(guildId) ?? false
    this.autoplayPrefs.set(guildId, !current)
    logger.event("guild", "Autoplay preference toggled", {
      guildId,
      enabled: !current,
    })
    return !current
  }

  create(guildId: string, connection: VoiceConnection) {
    logger.event("guild", "Sesión de música creada", { guildId })
    const session = new TrackScheduler(connection, this.getAutoplayPref(guildId))
    this.sessions.set(guildId, session)
    return session
  }

  get(guildId: string) {
    return this.sessions.get(guildId)
  }

  delete(guildId: string) {
    logger.event("guild", "Sesión de música eliminada", { guildId })
    for (const cb of preDestroyCallbacks) {
      cb(guildId)
    }
    const session = this.sessions.get(guildId)
    if (session) {
      session.destroy()
    }
    this.sessions.delete(guildId)
    this.queueMessages.delete(guildId)
    this.queueChannels.delete(guildId)
    this.statusTitles.delete(guildId)
    this.nowPlayingMessages.delete(guildId)
    this.autoplayPrefs.delete(guildId)
    for (const cb of cleanupCallbacks) {
      cb(guildId)
    }
  }

  has(guildId: string) {
    return this.sessions.has(guildId)
  }

  setQueueMessage(guildId: string, message: Message) {
    this.queueMessages.set(guildId, message)
  }

  getQueueMessage(guildId: string): Message | undefined {
    return this.queueMessages.get(guildId)
  }

  clearQueueMessage(guildId: string) {
    this.queueMessages.delete(guildId)
  }

  setNowPlayingMessage(guildId: string, message: Message) {
    this.nowPlayingMessages.set(guildId, message)
  }

  getNowPlayingMessage(guildId: string): Message | undefined {
    return this.nowPlayingMessages.get(guildId)
  }

  clearNowPlayingMessage(guildId: string) {
    this.nowPlayingMessages.delete(guildId)
  }

  getSessions() {
    return this.sessions
  }
}

export const guildManager = new GuildManager()

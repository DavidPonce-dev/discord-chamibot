import { VoiceConnection } from "@discordjs/voice"
import { Message, GuildTextBasedChannel } from "discord.js"
import { TrackScheduler } from "@/music/TrackScheduler"
import { setupSchedulerCallbacks } from "@/music/QueueProgressTracker"
import { logger } from "@/utils/logger"

export class GuildManager {
  private sessions = new Map<string, TrackScheduler>()
  private autoplayPrefs = new Map<string, boolean>()
  private queuePages = new Map<string, number>()
  private queueMessages = new Map<string, Message>()
  private queueChannels = new Map<string, GuildTextBasedChannel>()
  private nowPlayingMessages = new Map<string, Message>()
  private lastfmUsernames = new Map<string, string>()

  getQueueChannel(guildId: string): GuildTextBasedChannel | undefined {
    return this.queueChannels.get(guildId)
  }

  setQueueChannel(guildId: string, channel: GuildTextBasedChannel) {
    this.queueChannels.set(guildId, channel)
  }

  clearQueueChannel(guildId: string) {
    this.queueChannels.delete(guildId)
  }

  getQueuePage(guildId: string): number {
    return this.queuePages.get(guildId) ?? 1
  }

  setQueuePage(guildId: string, page: number) {
    this.queuePages.set(guildId, page)
  }

  clearQueuePage(guildId: string) {
    this.queuePages.delete(guildId)
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
    const existing = this.sessions.get(guildId)
    if (existing) return existing
    logger.event("guild", "Sesión de música creada", { guildId })
    const session = new TrackScheduler(connection, this.getAutoplayPref(guildId))
    this.sessions.set(guildId, session)
    setupSchedulerCallbacks(session, guildId)
    return session
  }

  get(guildId: string) {
    return this.sessions.get(guildId)
  }

  delete(guildId: string) {
    logger.event("guild", "Sesión de música eliminada", { guildId })
    const session = this.sessions.get(guildId)
    if (session) {
      session.destroy()
    }

    this.queueMessages.get(guildId)?.delete().catch(() => {})
    this.queueMessages.delete(guildId)
    this.nowPlayingMessages.get(guildId)?.delete().catch(() => {})
    this.nowPlayingMessages.delete(guildId)

    this.sessions.delete(guildId)
    this.queueChannels.delete(guildId)
    this.queuePages.delete(guildId)
    this.autoplayPrefs.delete(guildId)
    this.lastfmUsernames.delete(guildId)
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

  getLastfmUsername(guildId: string): string | undefined {
    return this.lastfmUsernames.get(guildId)
  }

  setLastfmUsername(guildId: string, username: string) {
    this.lastfmUsernames.set(guildId, username)
    logger.event("guild", "Last.fm username configurado", {
      guildId,
      username,
    })
  }

  clearLastfmUsername(guildId: string) {
    this.lastfmUsernames.delete(guildId)
    logger.event("guild", "Last.fm username removido", { guildId })
  }

  getSessions() {
    return this.sessions
  }
}

export const guildManager = new GuildManager()

import { VoiceConnection } from "@discordjs/voice"
import { Message } from "discord.js"
import { TrackScheduler } from "./TrackScheduler"

class GuildManager {
  private sessions = new Map<string, TrackScheduler>()
  private autoplayPrefs = new Map<string, boolean>()
  private queueMessages = new Map<string, Message>()

  getAutoplayPref(guildId: string): boolean {
    return this.autoplayPrefs.get(guildId) ?? false
  }

  toggleAutoplayPref(guildId: string): boolean {
    const current = this.autoplayPrefs.get(guildId) ?? false
    this.autoplayPrefs.set(guildId, !current)
    return !current
  }

  create(guildId: string, connection: VoiceConnection) {
    const session = new TrackScheduler(connection, this.getAutoplayPref(guildId))
    this.sessions.set(guildId, session)
    return session
  }

  get(guildId: string) {
    return this.sessions.get(guildId)
  }

  delete(guildId: string) {
    const session = this.sessions.get(guildId)
    if (session) {
      session.destroy()
    }
    this.sessions.delete(guildId)
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
}

export const guildManager = new GuildManager()

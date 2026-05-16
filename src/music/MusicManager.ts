import { VoiceConnection } from "@discordjs/voice"
import { Message } from "discord.js"
import { MusicQueue } from "./MusicQueue"

export class MusicManager {
  private queues = new Map<string, MusicQueue>()
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
    const queue = new MusicQueue(connection, this.getAutoplayPref(guildId))
    this.queues.set(guildId, queue)
    return queue
  }

  get(guildId: string) {
    return this.queues.get(guildId)
  }

  delete(guildId: string) {
    const queue = this.queues.get(guildId)
    if (queue) {
      queue.destroy()
    }
    this.queues.delete(guildId)
  }

  has(guildId: string) {
    return this.queues.has(guildId)
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

export const musicManager = new MusicManager()

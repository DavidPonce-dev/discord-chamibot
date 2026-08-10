import type {
  GuildTextBasedChannel,
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js"
import type { NotificationPort, LoggerPort } from "../../domain/ports"
import type { QueuePayload } from "../../domain/types"
import { createMessageQueue, type MessageQueue } from "../../shared/message-queue"

type QueueMessageStore = {
  get: (guildId: string) => Message | undefined
  set: (guildId: string, msg: Message) => void
  clear: (guildId: string) => void
}

type QueueChannelStore = {
  get: (guildId: string) => GuildTextBasedChannel | undefined
  set: (guildId: string, ch: GuildTextBasedChannel) => void
  clear: (guildId: string) => void
}

export const createQueueMessageStore = (): { messages: QueueMessageStore; channels: QueueChannelStore } => {
  const messages = new Map<string, Message>()
  const channels = new Map<string, GuildTextBasedChannel>()

  return {
    messages: {
      get: (guildId: string) => messages.get(guildId),
      set: (guildId: string, msg: Message) => { messages.set(guildId, msg) },
      clear: (guildId: string) => { messages.delete(guildId) },
    },
    channels: {
      get: (guildId: string) => channels.get(guildId),
      set: (guildId: string, ch: GuildTextBasedChannel) => { channels.set(guildId, ch) },
      clear: (guildId: string) => { channels.delete(guildId) },
    },
  }
}

export const createDiscordNotifier = (
  getQueueMessage: (guildId: string) => Message | undefined,
  setQueueMessage: (guildId: string, msg: Message) => void,
  getQueueChannel: (guildId: string) => GuildTextBasedChannel | undefined,
  setQueueChannel: (guildId: string, ch: GuildTextBasedChannel) => void,
  clearQueueMessage: (guildId: string) => void,
  clearQueueChannel: (guildId: string) => void,
  logger: LoggerPort,
): NotificationPort & { messageQueue: MessageQueue } => {
  const messageQueue = createMessageQueue()

  const DELETED_MESSAGE_CODES = [10008, 50001, 10004]
  const isMessageDeletedError = (msg: string): boolean =>
    DELETED_MESSAGE_CODES.some(code => msg.includes(String(code))) || msg.includes("Unknown Message")

  const sendQueueUpdate = async (guildId: string, payload: QueuePayload): Promise<void> => {
    const channel = getQueueChannel(guildId)
    if (!channel) return

    const existing = getQueueMessage(guildId)
    if (existing) {
      try {
        await existing.edit({
          embeds: payload.embeds as EmbedBuilder[],
          components: payload.components as ActionRowBuilder<ButtonBuilder>[],
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isMessageDeletedError(msg)) {
          clearQueueMessage(guildId)
          try {
            const newMsg = await channel.send({
              embeds: payload.embeds as EmbedBuilder[],
              components: payload.components as ActionRowBuilder<ButtonBuilder>[],
            })
            setQueueMessage(guildId, newMsg)
          } catch {}
        }
      }
      return
    }

    try {
      const msg = await channel.send({
        embeds: payload.embeds as EmbedBuilder[],
        components: payload.components as ActionRowBuilder<ButtonBuilder>[],
      })
      setQueueMessage(guildId, msg)
      setQueueChannel(guildId, channel)
    } catch (e: unknown) {
      logger.debug("notify", "Failed to send queue message", { guildId, error: String(e) })
    }
  }

  const editMessage = async (guildId: string, payload: QueuePayload): Promise<void> => {
    messageQueue.enqueue(guildId, async () => {
      await sendQueueUpdate(guildId, payload)
    })
  }

  const deleteMessage = async (guildId: string): Promise<void> => {
    messageQueue.clear(guildId)
    const msg = getQueueMessage(guildId)
    if (msg) msg.delete().catch(() => {})
    clearQueueMessage(guildId)
    clearQueueChannel(guildId)
  }

  return { sendQueueUpdate, editMessage, deleteMessage, messageQueue } as const
}

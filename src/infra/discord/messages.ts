import type {
  GuildTextBasedChannel,
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js"
import type { NotificationPort, LoggerPort } from "../../domain/ports"
import type { QueuePayload } from "../../domain/types"
import { getErrorMessage } from "../../shared/error"

export type QueueMessageStore = {
  get: (guildId: string) => Message | undefined
  set: (guildId: string, msg: Message) => void
  clear: (guildId: string) => void
}

export type QueueChannelStore = {
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

const toMessageOptions = (payload: QueuePayload) => ({
  embeds: payload.embeds as EmbedBuilder[],
  components: payload.components as ActionRowBuilder<ButtonBuilder>[],
})

// The only writer of the queue message. No queue: a render while another is still in flight for
// the same guild is skipped (the next tick shows the latest state), so a slow or rate-limited
// edit never piles up work behind it
export const createDiscordNotifier = (
  messages: QueueMessageStore,
  channels: QueueChannelStore,
  logger: LoggerPort,
): NotificationPort => {
  const inFlight = new Set<string>()
  // Bumped by deleteMessage: an edit that started before it must not bring the message back
  const generations = new Map<string, number>()
  const lastRendered = new Map<string, string>()

  const DELETED_MESSAGE_CODES = [10008, 50001, 10004]
  const isMessageDeletedError = (msg: string): boolean =>
    DELETED_MESSAGE_CODES.some(code => msg.includes(String(code))) || msg.includes("Unknown Message")

  const generationOf = (guildId: string): number => generations.get(guildId) ?? 0

  const renderNow = async (guildId: string, build: () => QueuePayload | null): Promise<void> => {
    const generation = generationOf(guildId)
    const channel = channels.get(guildId)
    if (!channel) return
    const payload = build()
    if (!payload) return
    const serialized = JSON.stringify(payload)

    const existing = messages.get(guildId)
    if (existing && existing.channelId === channel.id) {
      if (lastRendered.get(guildId) === serialized) return
      try {
        await existing.edit(toMessageOptions(payload))
        lastRendered.set(guildId, serialized)
        return
      } catch (e: unknown) {
        const msg = getErrorMessage(e)
        if (!isMessageDeletedError(msg)) {
          // A rejected edit leaves the message showing the previous state: make it visible
          logger.warn("notify", "Discord rechazo la edicion del mensaje de cola", { guildId, error: msg.slice(0, 300) })
          return
        }
      }
    } else if (existing) {
      // The player follows the channel of the latest /p
      existing.delete().catch(() => {})
    }

    messages.clear(guildId)
    lastRendered.delete(guildId)
    if (generationOf(guildId) !== generation) return

    try {
      const sent = await channel.send(toMessageOptions(payload))
      if (generationOf(guildId) !== generation) {
        sent.delete().catch(() => {})
        return
      }
      messages.set(guildId, sent)
      lastRendered.set(guildId, serialized)
    } catch (e: unknown) {
      logger.warn("notify", "No se pudo enviar el mensaje de cola", { guildId, error: getErrorMessage(e).slice(0, 300) })
    }
  }

  const render = async (guildId: string, build: () => QueuePayload | null): Promise<void> => {
    if (inFlight.has(guildId)) return
    inFlight.add(guildId)
    try {
      await renderNow(guildId, build)
    } finally {
      inFlight.delete(guildId)
    }
  }

  const deleteMessage = async (guildId: string): Promise<void> => {
    generations.set(guildId, generationOf(guildId) + 1)
    const msg = messages.get(guildId)
    if (msg) msg.delete().catch(() => {})
    messages.clear(guildId)
    channels.clear(guildId)
    lastRendered.delete(guildId)
  }

  return { render, deleteMessage } as const
}

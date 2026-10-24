import type { GuildTextBasedChannel, ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js"
import type { GuildSession } from "../../domain/types"
import type { MusicUseCases } from "../../usecases/music"
import type { NotificationPort, LoggerPort } from "../../domain/ports"
import type { QueueMessageStore, QueueChannelStore } from "../discord/messages"
import * as Queue from "../../domain/queue"
import { buildQueueContent } from "./queue-embed"
import { buildTrackRows, buildNavRow, buildPlaybackRow } from "./queue-components"
import { paginate } from "../../shared/format"
import { TRACKS_PER_PAGE } from "../../config/ui"
import { PROGRESS_UPDATE_INTERVAL_MS } from "../../config/timeouts"

type QueueDisplayDeps = Readonly<{
  music: MusicUseCases
  notifier: NotificationPort
  queueMessages: QueueMessageStore
  queueChannels: QueueChannelStore
  logger: LoggerPort
}>

export type QueueDisplay = Readonly<{
  updateQueueForGuild: (guildId: string) => void
  initializeQueueDisplay: (guildId: string, channel: GuildTextBasedChannel | undefined) => Promise<void>
  refreshButtonMessage: (interaction: ButtonInteraction, page?: number) => Promise<void>
  startProgressUpdates: (guildId: string) => void
}>

const buildQueuePayload = (session: GuildSession): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } => {
  // The stored page can be past the end after the queue shrinks: render the clamped one
  const { page, totalPages } = paginate(Queue.getAllTracks(session.queue), session.queuePage, TRACKS_PER_PAGE)
  const embed = buildQueueContent(session, page)

  const rows = buildTrackRows(session, page)
  const navRow = buildNavRow(page, totalPages)
  if (navRow) rows.push(navRow)
  rows.push(buildPlaybackRow(session))

  return { embeds: [embed], components: rows }
}

export const createQueueDisplay = (deps: QueueDisplayDeps): QueueDisplay => {
  const { music, notifier, queueMessages, queueChannels } = deps
  const progressIntervals = new Map<string, NodeJS.Timeout>()

  const updateQueueForGuild = (guildId: string): void => {
    notifier.renderQueue(guildId, () => {
      const session = music.getSession(guildId)
      return session ? buildQueuePayload(session) : null
    })
  }

  const stopProgressUpdates = (guildId: string): void => {
    const iv = progressIntervals.get(guildId)
    if (iv) { clearInterval(iv); progressIntervals.delete(guildId) }
  }

  const startProgressUpdates = (guildId: string): void => {
    stopProgressUpdates(guildId)
    progressIntervals.set(guildId, setInterval(() => {
      const session = music.getSession(guildId)
      if (!session || Queue.isEmpty(session.queue)) {
        stopProgressUpdates(guildId)
        return
      }
      updateQueueForGuild(guildId)
    }, PROGRESS_UPDATE_INTERVAL_MS))
  }

  const initializeQueueDisplay = async (guildId: string, channel: GuildTextBasedChannel | undefined): Promise<void> => {
    if (!channel?.send) return
    if (!music.getSession(guildId)) return
    queueChannels.set(guildId, channel)
    updateQueueForGuild(guildId)
    startProgressUpdates(guildId)
  }

  const refreshButtonMessage = async (interaction: ButtonInteraction, page?: number): Promise<void> => {
    const guildId = interaction.guildId
    if (!guildId) return
    const session = music.getSession(guildId)
    if (!session) {
      stopProgressUpdates(guildId)
      await notifier.deleteMessage(guildId)
      return
    }

    if (page !== undefined) {
      const clamped = paginate(Queue.getAllTracks(session.queue), page, TRACKS_PER_PAGE).page
      music.setSession(guildId, { ...session, queuePage: clamped })
    }

    const tracked = queueMessages.get(guildId)
    if (!tracked) {
      // Messages live in memory only: after a restart or a lost reference, adopt the clicked one
      queueMessages.set(guildId, interaction.message)
      if (!queueChannels.get(guildId) && interaction.channel) {
        queueChannels.set(guildId, interaction.channel as GuildTextBasedChannel)
      }
    } else if (tracked.id !== interaction.message.id) {
      // A stale player left in the chat: only the tracked one stays
      interaction.message.delete().catch(() => {})
      return
    }

    updateQueueForGuild(guildId)
  }

  return { updateQueueForGuild, initializeQueueDisplay, refreshButtonMessage, startProgressUpdates } as const
}

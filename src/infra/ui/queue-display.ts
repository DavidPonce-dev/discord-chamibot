import type { GuildTextBasedChannel, ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, Message } from "discord.js"
import type { GuildSession } from "../../domain/types"
import type { MusicUseCases } from "../../usecases/music"
import type { NotificationPort, LoggerPort } from "../../domain/ports"
import { buildQueueContent } from "./queue-embed"
import { buildTrackRows, buildNavRow, buildPlaybackRow } from "./queue-components"
import { paginate } from "../../shared/format"
import { TRACKS_PER_PAGE } from "../../config/ui"
import { PROGRESS_UPDATE_INTERVAL_MS } from "../../config/timeouts"

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

const buildQueuePayload = (session: GuildSession, page: number): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } => {
  const embed = buildQueueContent(session, page)
  const allTracks = [...session.queue.userTracks, ...session.queue.radioTracks]
  const { totalPages } = paginate(allTracks, page, TRACKS_PER_PAGE)

  const rows = buildTrackRows(session, page)
  const navRow = buildNavRow(page, totalPages)
  if (navRow) rows.push(navRow)
  rows.push(buildPlaybackRow(session))

  return { embeds: [embed], components: rows }
}

export const createQueueDisplay = (deps: QueueDisplayDeps): QueueDisplay => {
  const { music, notifier, queueChannels } = deps
  const progressIntervals = new Map<string, NodeJS.Timeout>()

  const updateQueueForGuild = (guildId: string): void => {
    const session = music.getSession(guildId)
    if (!session) return

    const channel = queueChannels.get(guildId)
    if (!channel) return

    notifier.editMessage(guildId, buildQueuePayload(session, session.queuePage) as any)
  }

  const stopProgressUpdates = (guildId: string): void => {
    const iv = progressIntervals.get(guildId)
    if (iv) { clearInterval(iv); progressIntervals.delete(guildId) }
  }

  const startProgressUpdates = (guildId: string): void => {
    stopProgressUpdates(guildId)
    progressIntervals.set(guildId, setInterval(() => {
      const session = music.getSession(guildId)
      if (!session || (!session.queue.current && session.queue.userTracks.length === 0 && session.queue.radioTracks.length === 0)) {
        stopProgressUpdates(guildId)
        return
      }
      updateQueueForGuild(guildId)
    }, PROGRESS_UPDATE_INTERVAL_MS))
  }

  const initializeQueueDisplay = async (guildId: string, channel: GuildTextBasedChannel | undefined): Promise<void> => {
    if (!channel?.send) return
    const session = music.getSession(guildId)
    if (!session) return
    await notifier.sendQueueUpdate(guildId, buildQueuePayload(session, session.queuePage) as any)
    queueChannels.set(guildId, channel)
    startProgressUpdates(guildId)
  }

  const refreshButtonMessage = async (interaction: ButtonInteraction, page?: number): Promise<void> => {
    const guildId = interaction.guildId
    if (!guildId) return
    const session = music.getSession(guildId)
    if (!session) {
      await notifier.deleteMessage(guildId)
      stopProgressUpdates(guildId)
      return
    }

    const currentPage = page ?? session.queuePage
    music.setSession(guildId, { ...session, queuePage: currentPage })

    const isEmpty = !session.queue.current && session.queue.userTracks.length === 0 && session.queue.radioTracks.length === 0
    if (isEmpty) {
      await notifier.deleteMessage(guildId)
      stopProgressUpdates(guildId)
      return
    }

    await interaction.editReply(buildQueuePayload(session, currentPage))
  }

  return { updateQueueForGuild, initializeQueueDisplay, refreshButtonMessage, startProgressUpdates } as const
}

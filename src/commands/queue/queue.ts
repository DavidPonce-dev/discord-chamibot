import {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js"
import type { GuildTextBasedChannel } from "discord.js"
import { guildManager } from "../../services/guild/GuildManager"
import { buildQueueContent, buildEmptyEmbed } from "../../ui/embeds/QueueEmbed"
import { buildTrackRows, buildNavRow, buildPlaybackRow } from "../../ui/components/QueueComponents"
import { TRACKS_PER_PAGE } from "../../constants"
import { calcTotalPages } from "../../utils/format"
import { logger } from "../../utils/logger"
import { getErrorMessage } from "../../utils/error"

type QueueMessagePayload = {
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<ButtonBuilder>[]
}

const queuePages = new Map<string, number>()

export function getQueuePage(guildId: string): number {
  return queuePages.get(guildId) ?? 1
}

export function setQueuePage(guildId: string, page: number) {
  queuePages.set(guildId, page)
}

export function clearQueuePage(guildId: string) {
  queuePages.delete(guildId)
}

function buildQueuePayload(queue: ReturnType<typeof guildManager.get>, page: number, statusTitle?: string): QueueMessagePayload {
  if (!queue) return { embeds: [buildEmptyEmbed()], components: [] }

  const embed = buildQueueContent(queue, page, statusTitle)
  const tracks = queue.getQueue()
  const totalPages = calcTotalPages(tracks.length, TRACKS_PER_PAGE)

  const rows = buildTrackRows(queue, page)
  const navRow = buildNavRow(page, totalPages)
  if (navRow) rows.push(navRow)
  rows.push(buildPlaybackRow(queue))

  return { embeds: [embed], components: rows }
}

function buildEmptyPayload(): QueueMessagePayload {
  return { embeds: [buildEmptyEmbed()], components: [] }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const scheduler = guildManager.get(interaction.guildId!)

  if (!scheduler || (scheduler.getSize() === 0 && !scheduler.getCurrentTrack())) {
    await interaction.deferReply()
    await interaction.deleteReply().catch(() => {})
    return
  }

  queuePages.set(interaction.guildId!, 1)
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
  const channel = interaction.channel as GuildTextBasedChannel | null
  if (channel?.send) {
    const sent = await channel.send(buildQueuePayload(scheduler, 1))
    guildManager.setQueueMessage(interaction.guildId!, sent)
  }
}

export async function updateQueueForGuild(guildId: string, statusTitle?: string, page?: number) {
  const scheduler = guildManager.get(guildId)
  const msg = guildManager.getQueueMessage(guildId)
  if (!scheduler || !msg) return

  if (scheduler.getSize() === 0 && !scheduler.getCurrentTrack()) {
    try {
      await msg.delete()
    } catch (err) {
      logger.debug("queue", "Message already deleted", { guildId, error: getErrorMessage(err) })
    }
    guildManager.clearQueueMessage(guildId)
    clearQueuePage(guildId)
    guildManager.delete(guildId)
    return
  }

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)
  try {
    if (scheduler.getSize() === 0 && !scheduler.getCurrentTrack()) return
    await msg.edit(buildQueuePayload(scheduler, currentPage, statusTitle))
  } catch (err) {
    logger.debug("queue", "Error editing queue message (transient, will retry)", {
      guildId,
      error: getErrorMessage(err),
    })
  }
}

export async function ensureQueueMessage(
  guildId: string,
  channel: GuildTextBasedChannel | undefined,
  statusTitle?: string,
  page?: number,
) {
  const existing = guildManager.getQueueMessage(guildId)
  if (existing) {
    await updateQueueForGuild(guildId, statusTitle, page)
    return
  }
  if (!channel) return

  const scheduler = guildManager.get(guildId)
  if (!scheduler) return

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)
  try {
    const msg = await channel.send(buildQueuePayload(scheduler, currentPage, statusTitle))
    guildManager.setQueueMessage(guildId, msg)
  } catch (err) {
    logger.debug("queue", "Failed to send queue message (channel not sendable)", {
      guildId,
      error: getErrorMessage(err),
    })
  }
}

export async function refreshQueueMessage(interaction: MessageComponentInteraction, page?: number) {
  const guildId = interaction.guildId!
  const scheduler = guildManager.get(guildId)
  const msg = guildManager.getQueueMessage(guildId)

  if (!scheduler || (scheduler.getSize() === 0 && !scheduler.getCurrentTrack())) {
    if (msg) {
      await interaction.deferUpdate()
      await msg.edit(buildEmptyPayload()).catch(() => {})
    } else {
      await interaction.update(buildEmptyPayload())
    }
    return
  }

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)

  if (msg) {
    await interaction.deferUpdate()
    await msg.edit(buildQueuePayload(scheduler, currentPage)).catch(() => {})
  } else {
    await interaction.update(buildQueuePayload(scheduler, currentPage))
  }
}

import {
  MessageComponentInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  GuildTextBasedChannel,
} from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { buildQueueContent, buildEmptyEmbed } from "@/ui/embeds/QueueEmbed"
import { buildTrackRows, buildNavRow, buildPlaybackRow } from "@/ui/components/QueueComponents"
import { TRACKS_PER_PAGE } from "@/constants"
import { calcTotalPages, clampPage } from "@/utils/format"
import { logger } from "@/utils/logger"
import { getErrorMessage } from "@/utils/error"
import { EMPTY_MESSAGE_TIMEOUT_MS } from "@/config/timeouts"
import { requireGuild } from "@/utils/guards"

type QueueMessagePayload = {
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<ButtonBuilder>[]
}

const queuePages = new Map<string, number>()
const activeEdits = new Map<string, Promise<void>>()
const dirtyGuilds = new Set<string>()
const DELETED_MESSAGE_CODES = [10008, 50001, 10004]

function isMessageDeletedError(err: unknown): boolean {
  const msg = getErrorMessage(err)
  return DELETED_MESSAGE_CODES.some(code => msg.includes(String(code))) || msg.includes("Unknown Message")
}

function buildQueuePayload(scheduler: ReturnType<typeof guildManager.get>, page: number, statusTitle?: string): QueueMessagePayload {
  if (!scheduler) return { embeds: [buildEmptyEmbed()], components: [] }

  const embed = buildQueueContent(scheduler, page, statusTitle)
  const tracks = scheduler.getQueue()
  const totalPages = calcTotalPages(tracks.length, TRACKS_PER_PAGE)

  const rows = buildTrackRows(scheduler, page)
  const navRow = buildNavRow(page, totalPages)
  if (navRow) rows.push(navRow)
  rows.push(buildPlaybackRow(scheduler))

  return { embeds: [embed], components: rows }
}

function buildEmptyPayload(): QueueMessagePayload {
  return { embeds: [buildEmptyEmbed()], components: [] }
}

async function recreateQueueMessage(guildId: string, statusTitle?: string, page?: number) {
  const scheduler = guildManager.get(guildId)
  const channel = guildManager.getQueueChannel(guildId)
  if (!scheduler || scheduler.isDestroyed() || !channel) return

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)

  try {
    const msg = await channel.send(buildQueuePayload(scheduler, currentPage, statusTitle))
    guildManager.setQueueMessage(guildId, msg)
    logger.info("queue", "Queue message recreado", { guildId })
  } catch (err) {
    logger.debug("queue", "Failed to recreate queue message", {
      guildId,
      error: getErrorMessage(err),
    })
  }
}

export function getQueuePage(guildId: string): number {
  return queuePages.get(guildId) ?? 1
}

export function setQueuePage(guildId: string, page: number) {
  queuePages.set(guildId, page)
}

export function clearQueuePage(guildId: string) {
  queuePages.delete(guildId)
}

export async function updateQueueForGuild(guildId: string, statusTitle?: string, page?: number) {
  const scheduler = guildManager.get(guildId)
  if (!scheduler || scheduler.isDestroyed()) return

  if (activeEdits.has(guildId)) {
    dirtyGuilds.add(guildId)
    return
  }

  await doEdit(guildId, statusTitle, page)

  if (dirtyGuilds.delete(guildId)) {
    await doEdit(guildId, statusTitle, page)
  }
}

async function doEdit(guildId: string, statusTitle?: string, page?: number) {
  const edit = (async () => {
    const scheduler = guildManager.get(guildId)
    const msg = guildManager.getQueueMessage(guildId)
    if (!scheduler || scheduler.isDestroyed()) return

    if (scheduler.getSize() === 0 && !scheduler.getCurrentTrack()) {
      if (msg) {
        try {
          await msg.delete()
        } catch (err) {
          logger.debug("queue", "Message already deleted", { guildId, error: getErrorMessage(err) })
        }
      }
      guildManager.clearQueueMessage(guildId)
      clearQueuePage(guildId)
      guildManager.delete(guildId)
      return
    }

    const currentPage = page ?? queuePages.get(guildId) ?? 1
    queuePages.set(guildId, currentPage)

    if (!msg) {
      await recreateQueueMessage(guildId, statusTitle, currentPage)
      return
    }

    try {
      await msg.edit(buildQueuePayload(scheduler, currentPage, statusTitle))
    } catch (err) {
      if (isMessageDeletedError(err)) {
        logger.debug("queue", "Queue message deleted, recreating", { guildId })
        guildManager.clearQueueMessage(guildId)
        await recreateQueueMessage(guildId, statusTitle, currentPage)
      } else {
        logger.debug("queue", "Error editing queue message (transient, will retry)", {
          guildId,
          error: getErrorMessage(err),
        })
      }
    }
  })()

  activeEdits.set(guildId, edit)
  await edit
  activeEdits.delete(guildId)
}

export function cancelPendingUpdates(guildId: string) {
  dirtyGuilds.delete(guildId)
  activeEdits.delete(guildId)
}

export function hasPendingUpdates(guildId: string): boolean {
  return activeEdits.has(guildId) || dirtyGuilds.has(guildId)
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
  if (!scheduler || scheduler.isDestroyed()) return

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)
  try {
    const msg = await channel.send(buildQueuePayload(scheduler, currentPage, statusTitle))
    guildManager.setQueueMessage(guildId, msg)
    guildManager.setQueueChannel(guildId, channel)
  } catch (err) {
    logger.debug("queue", "Failed to send queue message (channel not sendable)", {
      guildId,
      error: getErrorMessage(err),
    })
  }
}

export async function refreshQueueMessage(interaction: MessageComponentInteraction, page?: number) {
  const guildId = requireGuild(interaction)
  if (!guildId) return
  const scheduler = guildManager.get(guildId)
  const msg = guildManager.getQueueMessage(guildId)

  const isEmpty = !scheduler || (scheduler.getSize() === 0 && !scheduler.getCurrentTrack())
  const payload = isEmpty ? buildEmptyPayload() : (() => {
    const currentPage = page ?? queuePages.get(guildId) ?? 1
    queuePages.set(guildId, currentPage)
    return buildQueuePayload(scheduler, currentPage)
  })()

  const isSameMessage = msg && interaction.message && msg.id === interaction.message.id
  if (msg && !isSameMessage) {
    await msg.edit(payload).catch(() => {})
  }
  const sent = await interaction.update(payload)

  if (isEmpty) {
    setTimeout(async () => {
      const message = await interaction.channel?.messages.fetch(sent.id).catch(() => null)
      if (message) {
        await message.delete().catch(() => {})
        guildManager.clearQueueMessage(guildId)
        clearQueuePage(guildId)
      }
    }, EMPTY_MESSAGE_TIMEOUT_MS)
  }
}

export function buildQueuePayloadForCommand(scheduler: ReturnType<typeof guildManager.get>, page: number): QueueMessagePayload {
  return buildQueuePayload(scheduler, page)
}

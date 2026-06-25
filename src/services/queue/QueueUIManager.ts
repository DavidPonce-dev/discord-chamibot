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
import { TRACKS_PER_PAGE } from "@/config/ui"
import { paginate } from "@/utils/format"
import { isQueueEmpty, requireGuild } from "@/utils/guards"
import { logger } from "@/utils/logger"
import { getErrorMessage } from "@/utils/error"
import { EMPTY_MESSAGE_TIMEOUT_MS } from "@/config/timeouts"

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

export function buildQueuePayload(scheduler: ReturnType<typeof guildManager.get>, page: number): QueueMessagePayload {
  if (!scheduler) return { embeds: [buildEmptyEmbed()], components: [] }

  const embed = buildQueueContent(scheduler, page)
  const { totalPages } = paginate(scheduler.getQueue(), page, TRACKS_PER_PAGE)

  const rows = buildTrackRows(scheduler, page)
  const navRow = buildNavRow(page, totalPages)
  if (navRow) rows.push(navRow)
  rows.push(buildPlaybackRow(scheduler))

  return { embeds: [embed], components: rows }
}

function buildEmptyPayload(): QueueMessagePayload {
  return { embeds: [buildEmptyEmbed()], components: [] }
}

export async function cleanupQueueUI(guildId: string) {
  const msg = guildManager.getQueueMessage(guildId)
  if (msg) msg.delete().catch(() => {})
  guildManager.clearQueueMessage(guildId)

  const npMsg = guildManager.getNowPlayingMessage(guildId)
  if (npMsg) npMsg.delete().catch(() => {})
  guildManager.clearNowPlayingMessage(guildId)

  guildManager.clearQueueChannel(guildId)
  guildManager.clearStatusTitle(guildId)
  clearQueuePage(guildId)
}

async function recreateQueueMessage(guildId: string, page?: number) {
  const scheduler = guildManager.get(guildId)
  const channel = guildManager.getQueueChannel(guildId)
  if (!scheduler || scheduler.isDestroyed() || !channel) return

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)

  try {
    const msg = await channel.send(buildQueuePayload(scheduler, currentPage))
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

export async function updateQueueForGuild(guildId: string, page?: number) {
  const scheduler = guildManager.get(guildId)
  if (!scheduler || scheduler.isDestroyed()) return

  if (activeEdits.has(guildId)) {
    dirtyGuilds.add(guildId)
    return
  }

  await doEdit(guildId, page)

  if (dirtyGuilds.delete(guildId)) {
    await doEdit(guildId, page)
  }
}

async function doEdit(guildId: string, page?: number) {
  const edit = (async () => {
    const scheduler = guildManager.get(guildId)
    const msg = guildManager.getQueueMessage(guildId)
    if (!scheduler || scheduler.isDestroyed()) return

    if (isQueueEmpty(scheduler)) {
      await cleanupQueueUI(guildId)
      guildManager.delete(guildId)
      return
    }

    const currentPage = page ?? queuePages.get(guildId) ?? 1
    queuePages.set(guildId, currentPage)

    if (!msg) {
      await recreateQueueMessage(guildId, currentPage)
      return
    }

    try {
      await msg.edit(buildQueuePayload(scheduler, currentPage))
    } catch (err) {
      if (isMessageDeletedError(err)) {
        logger.debug("queue", "Queue message deleted, recreating", { guildId })
        guildManager.clearQueueMessage(guildId)
        await recreateQueueMessage(guildId, currentPage)
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

export async function ensureQueueMessage(
  guildId: string,
  channel: GuildTextBasedChannel | undefined,
  page?: number,
) {
  const existing = guildManager.getQueueMessage(guildId)

  if (existing) {
    await updateQueueForGuild(guildId, page)
    return
  }
  if (!channel) return

  const scheduler = guildManager.get(guildId)
  if (!scheduler || scheduler.isDestroyed()) return

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)
  try {
    const msg = await channel.send(buildQueuePayload(scheduler, currentPage))
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

  const isEmpty = isQueueEmpty(scheduler)
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



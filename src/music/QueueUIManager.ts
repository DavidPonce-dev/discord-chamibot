import {
  MessageComponentInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  GuildTextBasedChannel,
} from "discord.js"
import { guildManager } from "@/music/GuildManager"
import { buildQueueContent, buildEmptyEmbed } from "@/ui/embeds/QueueEmbed"
import { buildTrackRows, buildNavRow, buildPlaybackRow, buildQueueControlRow } from "@/ui/components/QueueComponents"
import { TRACKS_PER_PAGE } from "@/config/ui"
import { paginate } from "@/utils/format"
import { isQueueEmpty, requireGuild } from "@/utils/guards"
import { logger } from "@/utils/logger"
import { getErrorMessage } from "@/utils/error"
import { EMPTY_MESSAGE_TIMEOUT_MS } from "@/config/timeouts"
import { MessageQueue } from "@/utils/messageQueue"

const messageQueue = new MessageQueue()

type QueueMessagePayload = {
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<ButtonBuilder>[]
}

const DELETED_MESSAGE_CODES = [10008, 50001, 10004]

function isMessageDeletedError(err: unknown): boolean {
  const msg = getErrorMessage(err)
  return DELETED_MESSAGE_CODES.some(code => msg.includes(String(code))) || msg.includes("Unknown Message")
}

function buildQueuePayload(scheduler: ReturnType<typeof guildManager.get>, page: number): QueueMessagePayload {
  if (!scheduler) return { embeds: [buildEmptyEmbed()], components: [] }

  const embed = buildQueueContent(scheduler, page)
  const { totalPages } = paginate(scheduler.getQueue(), page, TRACKS_PER_PAGE)

  const rows = buildTrackRows(scheduler, page)
  const navRow = buildNavRow(page, totalPages)
  if (navRow) rows.push(navRow)
  rows.push(buildPlaybackRow(scheduler))
  rows.push(buildQueueControlRow(scheduler))

  return { embeds: [embed], components: rows }
}

function buildEmptyPayload(): QueueMessagePayload {
  return { embeds: [buildEmptyEmbed()], components: [] }
}

export async function cleanupQueueUI(guildId: string) {
  messageQueue.clear(guildId)

  const msg = guildManager.getQueueMessage(guildId)
  if (msg) msg.delete().catch(() => {})
  guildManager.clearQueueMessage(guildId)

  guildManager.clearQueueChannel(guildId)
  guildManager.clearQueuePage(guildId)
}

async function upsertQueueMessage(
  guildId: string,
  channel: GuildTextBasedChannel | undefined,
  page?: number,
): Promise<void> {
  const scheduler = guildManager.get(guildId)
  if (!scheduler || scheduler.isDestroyed()) return

  const currentPage = page ?? guildManager.getQueuePage(guildId) ?? 1
  guildManager.setQueuePage(guildId, currentPage)

  const existing = guildManager.getQueueMessage(guildId)
  if (existing) {
    try {
      await existing.edit(buildQueuePayload(scheduler, currentPage))
    } catch (err) {
      if (isMessageDeletedError(err)) {
        logger.debug("queue", "Queue message deleted, recreating", { guildId })
        guildManager.clearQueueMessage(guildId)
        await sendQueueMessage(guildId, channel, currentPage)
      } else {
        logger.debug("queue", "Error editing queue message (transient, will retry)", {
          guildId,
          error: getErrorMessage(err),
        })
      }
    }
    return
  }

  await sendQueueMessage(guildId, channel, currentPage)
}

async function sendQueueMessage(
  guildId: string,
  channel: GuildTextBasedChannel | undefined,
  page: number,
): Promise<void> {
  const scheduler = guildManager.get(guildId)
  if (!scheduler || scheduler.isDestroyed() || !channel) return

  try {
    const msg = await channel.send(buildQueuePayload(scheduler, page))
    guildManager.setQueueMessage(guildId, msg)
    guildManager.setQueueChannel(guildId, channel)
    logger.info("queue", "Queue message creado", { guildId })
  } catch (err) {
    logger.debug("queue", "Failed to send queue message", {
      guildId,
      error: getErrorMessage(err),
    })
  }
}

export function updateQueueForGuild(guildId: string, page?: number) {
  messageQueue.enqueue(guildId, async () => {
    const channel = guildManager.getQueueChannel(guildId)
    await upsertQueueMessage(guildId, channel, page)
  })
}

export async function ensureQueueMessage(
  guildId: string,
  channel: GuildTextBasedChannel | undefined,
  page?: number,
) {
  await upsertQueueMessage(guildId, channel, page)
}

export async function refreshQueueMessage(interaction: MessageComponentInteraction, page?: number) {
  const guildId = requireGuild(interaction)
  if (!guildId) return
  const scheduler = guildManager.get(guildId)
  const msg = guildManager.getQueueMessage(guildId)

  const isEmpty = isQueueEmpty(scheduler)
  const payload = isEmpty ? buildEmptyPayload() : (() => {
    const currentPage = page ?? guildManager.getQueuePage(guildId) ?? 1
    guildManager.setQueuePage(guildId, currentPage)
    return buildQueuePayload(scheduler, currentPage)
  })()

  const isSameMessage = msg && interaction.message && msg.id === interaction.message.id
  if (msg && !isSameMessage) {
    messageQueue.enqueue(guildId, async () => {
      await msg.edit(payload).catch(() => {})
    })
  }
  const sent = await interaction.update(payload)

  if (isEmpty) {
    setTimeout(async () => {
      const message = await interaction.channel?.messages.fetch(sent.id).catch(() => null)
      if (message) {
        await message.delete().catch(() => {})
        guildManager.clearQueueMessage(guildId)
        guildManager.clearQueuePage(guildId)
      }
    }, EMPTY_MESSAGE_TIMEOUT_MS)
  }
}

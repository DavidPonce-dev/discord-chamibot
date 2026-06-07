import { ButtonInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { refreshQueueMessage, getQueuePage } from "@/services/queue/QueueUIManager"
import { logger } from "@/utils/logger"
import { requireSession, requireGuild } from "@/utils/guards"
import { BUTTON_PREFIXES, LOOP_LABELS } from "@/config/ui"
import { BUTTON_COOLDOWN_MS, SEEK_BACK_SECONDS } from "@/config/timeouts"
import { getErrorMessage } from "@/utils/error"

const userCooldowns = new Map<string, number>()

function isOnCooldown(userId: string): boolean {
  const last = userCooldowns.get(userId)
  if (!last) return false
  return Date.now() - last < BUTTON_COOLDOWN_MS
}

function setCooldown(userId: string) {
  userCooldowns.set(userId, Date.now())
}

interface QueueButtonAction {
  action: (scheduler: import("../services/scheduler/TrackScheduler").TrackScheduler, idx: number) => void
  logEvent: string
}

const queueIndexActions: Record<string, QueueButtonAction> = {
  [BUTTON_PREFIXES.queueUp]: { action: (s, idx) => s.moveUp(idx), logEvent: "Subir track" },
  [BUTTON_PREFIXES.queueDown]: { action: (s, idx) => s.moveDown(idx), logEvent: "Bajar track" },
  [BUTTON_PREFIXES.queueDelete]: { action: (s, idx) => s.remove(idx), logEvent: "Eliminar de cola" },
}

export async function handleButton(interaction: ButtonInteraction) {
  const guildId = requireGuild(interaction)
  if (!guildId) return
  const user = interaction.user.username
  const userId = interaction.user.id

  if (isOnCooldown(userId)) {
    await interaction.reply({ content: "Esper\u00e1 un momento antes de usar otro bot\u00f3n", ephemeral: true }).catch(() => {})
    return
  }

  setCooldown(userId)
  const scheduler = requireSession(interaction)

  if (!scheduler) {
    logger.warn("button", "Bot\u00f3n sin sesi\u00f3n activa", { user, guildId, customId: interaction.customId })
    return
  }

  try {
    for (const [prefix, { action, logEvent }] of Object.entries(queueIndexActions)) {
      if (interaction.customId.startsWith(prefix)) {
        const idx = parseInt(interaction.customId.slice(prefix.length), 10)
        action(scheduler, idx)
        logger.event("button", logEvent, { user, guildId, index: idx })
        await refreshQueueMessage(interaction)
        return
      }
    }

    const handler = buttonHandlers[interaction.customId]
    if (handler) {
      await handler(scheduler, interaction, guildId, user)
      return
    }

    logger.warn("button", "Acci\u00f3n no reconocida", { user, guildId, customId: interaction.customId })
    await interaction.reply({ content: "Acci\u00f3n no reconocida", ephemeral: true })
  } catch (error) {
    logger.error("button", "Error en bot\u00f3n", {
      user,
      guildId,
      customId: interaction.customId,
      error: getErrorMessage(error),
    })
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply("Error al ejecutar la acci\u00f3n")
      } else {
        await interaction.reply({ content: "Error al ejecutar la acci\u00f3n", ephemeral: true })
      }
    } catch { /* interaction might be expired */ }
  }
}

type ButtonHandler = (
  scheduler: import("../services/scheduler/TrackScheduler").TrackScheduler,
  interaction: ButtonInteraction,
  guildId: string,
  user: string,
) => Promise<void>

const buttonHandlers: Record<string, ButtonHandler> = {
  [BUTTON_PREFIXES.queuePagePrev]: async (s, interaction, guildId, user) => {
    logger.event("button", "P\u00e1gina anterior", { user, guildId })
    await refreshQueueMessage(interaction, Math.max(1, (getQueuePage(guildId) || 1) - 1))
  },
  [BUTTON_PREFIXES.queuePageNext]: async (s, interaction, guildId, user) => {
    logger.event("button", "P\u00e1gina siguiente", { user, guildId })
    await refreshQueueMessage(interaction, getQueuePage(guildId) + 1)
  },
  [BUTTON_PREFIXES.queuePlaybackPause]: async (s, interaction, guildId, user) => {
    s.togglePause()
    logger.event("button", "Pause/Resume toggle", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  [BUTTON_PREFIXES.queuePlaybackSkip]: async (s, interaction, guildId, user) => {
    s.skip()
    logger.event("button", "Saltando", { user, guildId })
    await refreshQueueMessage(interaction, 1)
  },
  [BUTTON_PREFIXES.queuePlaybackShuffle]: async (s, interaction, guildId, user) => {
    s.shuffle()
    logger.event("button", "Mezclando cola", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  [BUTTON_PREFIXES.queuePlaybackClear]: async (s, interaction, guildId, user) => {
    s.clear()
    logger.event("button", "Limpiando cola", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  [BUTTON_PREFIXES.queuePlaybackAutoplay]: async (s, interaction, guildId, user) => {
    s.toggleAutoplay()
    guildManager.toggleAutoplayPref(guildId)
    logger.event("button", "Autoplay toggle", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  [BUTTON_PREFIXES.nowPlayingPause]: async (s, interaction, guildId, user) => {
    s.pause()
    logger.event("button", "Now Playing pause", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "\u23f8 Pausado")
  },
  [BUTTON_PREFIXES.nowPlayingResume]: async (s, interaction, guildId, user) => {
    s.resume()
    logger.event("button", "Now Playing resume", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "\u25b6 Reanudado")
  },
  [BUTTON_PREFIXES.nowPlayingSkip]: async (s, interaction, guildId, user) => {
    s.skip()
    logger.event("button", "Now Playing skip", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "\u23ed Saltado")
  },
  [BUTTON_PREFIXES.nowPlayingLoop]: async (s, interaction, guildId, user) => {
    const mode = s.toggleLoop()
    logger.event("button", "Now Playing loop", { user, guildId, mode })
    await clearButtonsAndFollowUp(interaction, LOOP_LABELS[mode])
  },
  [BUTTON_PREFIXES.nowPlayingShuffle]: async (s, interaction, guildId, user) => {
    s.shuffle()
    logger.event("button", "Now Playing shuffle", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "\ud83d\udd00 Cola mezclada")
  },
  [BUTTON_PREFIXES.nowPlayingSeekBack]: async (s, interaction, guildId, user) => {
    const pos = Math.max(0, s.getPosition() - SEEK_BACK_SECONDS)
    await s.seek(pos)
    logger.event("button", "Now Playing seek back", { user, guildId, position: pos })
    await clearButtonsAndFollowUp(interaction, "\u23ea -15s")
  },
}

async function clearButtonsAndFollowUp(interaction: ButtonInteraction, content: string) {
  await interaction.update({ components: [] })
  await interaction.followUp({ content, ephemeral: true })
}

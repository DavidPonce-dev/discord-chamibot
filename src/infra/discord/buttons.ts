import type { ButtonInteraction } from "discord.js"
import type { MusicUseCases } from "../../usecases/music"
import type { QueueUseCases } from "../../usecases/queue"
import type { RadioUseCases } from "../../usecases/radio"
import type { LoggerPort } from "../../domain/ports"
import { BUTTON_PREFIXES } from "../../config/ui"
import { getErrorMessage } from "../../shared/error"

type ButtonBundle = Readonly<{
  music: MusicUseCases
  queue: QueueUseCases
  radio: RadioUseCases
  refreshMessage: (interaction: ButtonInteraction, page?: number) => Promise<void>
  logger: LoggerPort
}>

const extractIndex = (customId: string, prefix: string): number =>
  parseInt(customId.slice(prefix.length), 10)

export const handleButton = async (
  interaction: ButtonInteraction,
  bundle: ButtonBundle,
): Promise<void> => {
  const { music, queue, radio, refreshMessage, logger } = bundle
  const guildId = interaction.guildId
  if (!guildId) return
  const user = interaction.user.username
  const customId = interaction.customId

  await interaction.deferUpdate().catch(() => {})

  const requireSession = async (): Promise<boolean> => {
    if (!music.getSession(guildId)) {
      await interaction.editReply({ content: "No hay sesion activa" }).catch(() => {})
      return false
    }
    return true
  }

  try {
    // Index-based actions: queueUp, queueDown, queueDelete
    for (const [prefix, actionFn] of [
      [BUTTON_PREFIXES.queueUp, (gid: string, idx: number) => { queue.moveUp(gid, idx) }] as const,
      [BUTTON_PREFIXES.queueDown, (gid: string, idx: number) => { queue.moveDown(gid, idx) }] as const,
      [BUTTON_PREFIXES.queueDelete, (gid: string, idx: number) => { queue.removeTrack(gid, idx + 1) }] as const,
    ] as const) {
      if (customId.startsWith(prefix)) {
        if (!await requireSession()) return
        const idx = extractIndex(customId, prefix)
        actionFn(guildId, idx)
        await refreshMessage(interaction)
        return
      }
    }

    // Radio shuffle (index-based)
    if (customId.startsWith(BUTTON_PREFIXES.queueRadioShuffle)) {
      if (!await requireSession()) return
      const idx = extractIndex(customId, BUTTON_PREFIXES.queueRadioShuffle)
      await radio.reshuffleRadio(guildId, idx)
      await refreshMessage(interaction)
      return
    }

    // Page navigation
    if (customId === BUTTON_PREFIXES.queuePagePrev) {
      const session = music.getSession(guildId)
      if (!session) return
      await refreshMessage(interaction, Math.max(1, session.queuePage - 1))
      return
    }

    if (customId === BUTTON_PREFIXES.queuePageNext) {
      const session = music.getSession(guildId)
      if (!session) return
      await refreshMessage(interaction, session.queuePage + 1)
      return
    }

    // Playback controls
    if (customId === BUTTON_PREFIXES.queuePlaybackPause) {
      if (!await requireSession()) return
      const session = music.getSession(guildId)!
      session.playback.isPaused ? music.resume(guildId) : music.pause(guildId)
      await refreshMessage(interaction)
      return
    }

    if (customId === BUTTON_PREFIXES.queuePlaybackSkip) {
      if (!await requireSession()) return
      music.skip(guildId)
      await refreshMessage(interaction, 1)
      return
    }

    if (customId === BUTTON_PREFIXES.queuePlaybackShuffle) {
      if (!await requireSession()) return
      queue.shuffleQueue(guildId)
      await refreshMessage(interaction)
      return
    }

    if (customId === BUTTON_PREFIXES.queuePlaybackStop) {
      if (!await requireSession()) return
      music.stop(guildId)
      await refreshMessage(interaction)
      return
    }

    if (customId === BUTTON_PREFIXES.queuePlaybackAutoplay) {
      if (!await requireSession()) return
      await radio.toggleAutoplay(guildId)
      await refreshMessage(interaction)
      return
    }

    logger.warn("button", "Accion no reconocida", { user, guildId, customId })
    await interaction.editReply({ content: "Accion no reconocida" }).catch(() => {})
  } catch (e: unknown) {
    logger.error("button", "Error en boton", { user, guildId, customId, error: getErrorMessage(e) })
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply("Error al ejecutar la accion")
      } else {
        await interaction.reply({ content: "Error al ejecutar la accion", ephemeral: true })
      }
    } catch {}
  }
}

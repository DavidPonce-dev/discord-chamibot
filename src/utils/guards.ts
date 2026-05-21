import { ChatInputCommandInteraction, ButtonInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"
import { TrackScheduler } from "../services/TrackScheduler"

export function requireQueue(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): TrackScheduler | null {
  const queue = guildManager.get(interaction.guildId!)
  if (!queue || !queue.getCurrentTrack()) {
    interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true }).catch(() => {})
    return null
  }
  return queue
}

export function requireSession(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): TrackScheduler | null {
  const queue = guildManager.get(interaction.guildId!)
  if (!queue) {
    interaction.reply({ content: "No hay una sesión activa", ephemeral: true }).catch(() => {})
    return null
  }
  return queue
}

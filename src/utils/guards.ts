import { ChatInputCommandInteraction, ButtonInteraction } from "discord.js"
import { guildManager } from "../services/guild/GuildManager"
import { TrackScheduler } from "../services/scheduler/TrackScheduler"

export function requireScheduler(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): TrackScheduler | null {
  const scheduler = guildManager.get(interaction.guildId!)
  if (!scheduler || !scheduler.getCurrentTrack()) {
    interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true }).catch(() => {})
    return null
  }
  return scheduler
}

export function requireSession(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): TrackScheduler | null {
  const scheduler = guildManager.get(interaction.guildId!)
  if (!scheduler) {
    interaction.reply({ content: "No hay una sesión activa", ephemeral: true }).catch(() => {})
    return null
  }
  return scheduler
}

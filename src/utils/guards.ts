import { ChatInputCommandInteraction, ButtonInteraction, MessageComponentInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { TrackScheduler } from "@/services/scheduler/TrackScheduler"

type GuildInteraction = ChatInputCommandInteraction | ButtonInteraction | MessageComponentInteraction

function getGuildId(interaction: GuildInteraction): string | null {
  return interaction.guildId
}

async function replyNoGuild(interaction: GuildInteraction) {
  await interaction.reply({ content: "Este comando solo funciona en servidores", ephemeral: true }).catch(() => {})
}

export function requireGuild(
  interaction: GuildInteraction,
): string | null {
  const guildId = getGuildId(interaction)
  if (!guildId) {
    replyNoGuild(interaction).catch(() => {})
    return null
  }
  return guildId
}

export function requireScheduler(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): TrackScheduler | null {
  const guildId = requireGuild(interaction)
  if (!guildId) return null
  const scheduler = guildManager.get(guildId)
  if (!scheduler || !scheduler.getCurrentTrack()) {
    interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true }).catch(() => {})
    return null
  }
  return scheduler
}

export function requireSession(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): TrackScheduler | null {
  const guildId = requireGuild(interaction)
  if (!guildId) return null
  const scheduler = guildManager.get(guildId)
  if (!scheduler) {
    interaction.reply({ content: "No hay una sesión activa", ephemeral: true }).catch(() => {})
    return null
  }
  return scheduler
}
